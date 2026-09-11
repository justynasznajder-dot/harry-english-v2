import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import {
  createUser,
  POLISH_DAY_FROM_ST_SQL,
  queryDb,
  runPgTransaction,
  updateUser,
  updateUserPasswordHash,
} from "@/lib/db";
import { generateTempPassword } from "@/lib/password";
import { formatPersonName } from "@/lib/format-person-name";
import {
  assignChildToProposedGroup,
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";
import {
  allocateChildClientNumber,
  ensureChildClientNumber,
} from "@/lib/client-numbers";
import { promotePendingLargeFamilyCardToParent } from "@/lib/parent-profile-discount";
import {
  ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE,
  type EnrollmentStatus,
} from "@/lib/enrollment-status";
import { isComplimentaryForParent } from "@/lib/school-discounts";
import { resolveEffectiveLessonRange } from "@/lib/group-lesson-bounds";
import {
  normalizeLessonsPerWeek,
  sqlScheduleTemplateVisibleForStudent,
} from "@/lib/lessons-per-week";

export type EnrollmentRow = {
  id: string;
  user_id: string | null;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  parent_phone: string | null;
  school_id: string;
  child_first_name: string;
  child_last_name: string;
  child_birth_date: string;
  preferred_location: string | null;
  proposed_group_id: string | null;
  status: string;
  lessons_per_week: number | null;
};

export type ProposalEmailItem = {
  childFirstName: string;
  childLastName: string;
  groupName: string;
  locationName: string;
  schedule: string;
  teacherName: string;
  /** Data rozpoczęcia roku szkolnego (YYYY-MM-DD) — „według harmonogramu”. */
  schoolYearStartOn?: string | null;
  /** Efektywna data startu zajęć grupy (YYYY-MM-DD). */
  groupLessonsStartOn?: string | null;
};

export type SharedParentState = {
  parentUserId: string;
  parentEmail: string;
  parentFirstName: string;
  parentLastName: string;
  parentCreated: boolean;
  tempPassword: string | null;
  schoolId: string;
};

export type ProposalInput = {
  requestId: string;
  groupId: string;
  lessonUnitPrice?: number | string | null;
  monthlyUnitPrice?: number | string | null;
  yearlyUnitPrice?: number | string | null;
  /** Opcjonalny % zniżki na profilu dziecka (0–100). */
  discountPercent?: number | string | null;
  /** Komentarz managera (enrollment_requests.manager_comment). */
  managerComment?: string | null;
};

export type EnrollmentProposalStatus =
  | "NEW"
  | "NEGOTIATING"
  | "PROPOSED"
  | "ACCEPTED"
  | "AWAITING_CONTRACT"
  | "CONTRACT_READY";

/**
 * Dane logowania do maila z propozycją.
 * Mail zawsze zawiera login; hasło tymczasowe tylko gdy konto właśnie utworzono.
 * Istniejący rodzic → bez resetu hasła (`tempPassword: null` → „użyj obecnego hasła”).
 */
export type ProposalEmailLogin = {
  loginEmail: string;
  tempPassword: string | null;
};

export function resolveProposalEmailCredentials(params: {
  parentEmail: string;
  parentCreated: boolean;
  tempPasswordFromCreate: string | null;
}): ProposalEmailLogin {
  const tempPassword =
    params.parentCreated && params.tempPasswordFromCreate
      ? params.tempPasswordFromCreate
      : null;

  return {
    loginEmail: params.parentEmail,
    tempPassword,
  };
}

function parseOptionalDiscountPercent(
  raw: number | string | null | undefined
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, message: "Nieprawidłowy % zniżki" };
  }
  if (n < 0 || n > 100) {
    return { ok: false, message: "% zniżki musi być w zakresie 0–100" };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** Komentarz managera — pusty string → NULL; max 4000 znaków. */
export function normalizeManagerComment(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  return t.length > 4000 ? t.slice(0, 4000) : t;
}

function roleLabelPl(role: string): string {
  switch (String(role).toUpperCase()) {
    case "TEACHER":
      return "lektora";
    case "MANAGER":
      return "managera";
    case "ADMIN":
      return "administratora";
    case "CHILD":
      return "dziecka";
    default:
      return "użytkownika (nie rodzica)";
  }
}

/**
 * Konto rodzica do propozycji / zapisu stawek.
 * Nie wolno powiązać zgłoszenia z TEACHER/MANAGER itd. — (school_id, email) jest unikalne,
 * więc lektor z tym samym mailem blokuje utworzenie PARENT (stąd wcześniejsze „Nie znaleziono rodzica”).
 */
async function resolveParentAccountForEnrollment(enrollment: {
  id: string;
  user_id: string | null;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  parent_phone: string | null;
  school_id: string;
}): Promise<
  | {
      ok: true;
      parentUserId: string;
      parentFirstName: string;
      parentLastName: string;
      tempPassword: string | null;
      parentCreated: boolean;
    }
  | { ok: false; status: number; message: string }
> {
  const parentSchoolId = enrollment.school_id;
  const parentEmail = String(enrollment.parent_email || "")
    .trim()
    .toLowerCase();
  if (!parentEmail) {
    return { ok: false, status: 400, message: "Brak adresu email rodzica w zgłoszeniu" };
  }

  const conflictMessage = (role: string, firstName: string, lastName: string) => {
    const who = `${firstName} ${lastName}`.trim() || parentEmail;
    const local = parentEmail.split("@")[0] || "rodzic";
    const domain = parentEmail.includes("@") ? parentEmail.split("@")[1] : "example.com";
    return (
      `Adres ${parentEmail} należy do konta ${roleLabelPl(role)} (${who}). ` +
      `Nie można utworzyć konta rodzica na ten sam e-mail. ` +
      `Zmień e-mail rodzica w zgłoszeniu (np. alias Gmail: ${local}+rodzic@${domain}) i spróbuj ponownie.`
    );
  };

  let linkedUserId = enrollment.user_id?.trim() || null;
  if (linkedUserId) {
    const linkedRes = await queryDb<{
      id: string;
      role: string;
      first_name: string;
      last_name: string;
      phone: string | null;
    }>(
      `SELECT id, role, first_name, last_name, phone FROM users WHERE id = $1 LIMIT 1`,
      [linkedUserId]
    );
    const linked = linkedRes.rows[0];
    if (!linked) {
      await queryDb(
        `UPDATE enrollment_requests SET user_id = NULL WHERE id = $1 AND user_id = $2`,
        [enrollment.id, linkedUserId]
      );
      linkedUserId = null;
    } else if (String(linked.role).toUpperCase() !== "PARENT") {
      // Odłącz błędne powiązanie (np. lektor z tym samym mailem) — dalej sprawdzimy e-mail.
      await queryDb(
        `UPDATE enrollment_requests SET user_id = NULL WHERE id = $1 AND user_id = $2`,
        [enrollment.id, linkedUserId]
      );
      linkedUserId = null;
    } else {
      const parentFirstName = formatPersonName(
        enrollment.parent_first_name?.trim() || linked.first_name
      );
      const parentLastName = formatPersonName(
        enrollment.parent_last_name?.trim() || linked.last_name
      );
      await updateUser(linked.id, {
        first_name: parentFirstName,
        last_name: parentLastName,
        phone: linked.phone?.trim() || enrollment.parent_phone?.trim() || null,
      });
      return {
        ok: true,
        parentUserId: linked.id,
        parentFirstName,
        parentLastName,
        tempPassword: null,
        parentCreated: false,
      };
    }
  }

  const existingRes = await queryDb<{
    id: string;
    role: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  }>(
    `SELECT id, role, first_name, last_name, phone
     FROM users
     WHERE school_id = $1 AND LOWER(email::text) = LOWER($2::text)
     LIMIT 1`,
    [parentSchoolId, parentEmail]
  );
  const existing = existingRes.rows[0];
  if (existing) {
    if (String(existing.role).toUpperCase() !== "PARENT") {
      return {
        ok: false,
        status: 409,
        message: conflictMessage(existing.role, existing.first_name, existing.last_name),
      };
    }
    const parentFirstName = formatPersonName(
      enrollment.parent_first_name?.trim() || existing.first_name
    );
    const parentLastName = formatPersonName(
      enrollment.parent_last_name?.trim() || existing.last_name
    );
    await updateUser(existing.id, {
      first_name: parentFirstName,
      last_name: parentLastName,
      phone: existing.phone?.trim() || enrollment.parent_phone?.trim() || null,
    });
    return {
      ok: true,
      parentUserId: existing.id,
      parentFirstName,
      parentLastName,
      tempPassword: null,
      parentCreated: false,
    };
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  try {
    const newUser = await createUser({
      email: parentEmail,
      passwordHash,
      firstName: formatPersonName(enrollment.parent_first_name?.trim() || "Rodzic"),
      lastName: formatPersonName(enrollment.parent_last_name?.trim() || ""),
      role: "PARENT",
      schoolId: parentSchoolId,
      phone: enrollment.parent_phone ?? null,
      confirmed: false,
      accessLevel: "PENDING",
      mustChangePassword: true,
    });
    return {
      ok: true,
      parentUserId: newUser.id,
      parentFirstName: newUser.first_name,
      parentLastName: newUser.last_name,
      tempPassword,
      parentCreated: true,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(detail)) {
      const again = await queryDb<{ role: string; first_name: string; last_name: string }>(
        `SELECT role, first_name, last_name FROM users
         WHERE school_id = $1 AND LOWER(email::text) = LOWER($2::text) LIMIT 1`,
        [parentSchoolId, parentEmail]
      );
      const row = again.rows[0];
      if (row && String(row.role).toUpperCase() !== "PARENT") {
        return {
          ok: false,
          status: 409,
          message: conflictMessage(row.role, row.first_name, row.last_name),
        };
      }
    }
    throw err;
  }
}

export async function submitEnrollmentProposal(
  input: ProposalInput,
  sharedParent: SharedParentState | null,
  options?: {
    restrictToSchoolId?: string;
    allowedStatuses?: EnrollmentProposalStatus[];
    /**
     * Tylko zapis: konto rodzica + dziecko + członkostwo w grupie (confirmed=false),
     * bez zmiany statusu na PROPOSED/ACCEPTED i bez maila.
     */
    draftOnly?: boolean;
    /** Przy draftOnly — puste stawki jako NULL. */
    allowEmptyPrices?: boolean;
    /** Tryb bez umowy: jednorazowa + ratalna wymagane; za zajęcia opcjonalne; grupa może być pusta przy samym zapisie. */
    complimentaryPrices?: boolean;
  }
): Promise<
  | {
      ok: true;
      sharedParent: SharedParentState;
      emailItem: ProposalEmailItem;
      /** Tryb bez umowy — caller ma domknąć COMPLETED po udanej wysyłce maila. */
      complimentaryCompleted: boolean;
      childId: string;
      groupChanged: boolean;
    }
  | { ok: false; status: number; message: string }
> {
  const {
    requestId,
    groupId,
    lessonUnitPrice,
    monthlyUnitPrice,
    yearlyUnitPrice,
    discountPercent,
    managerComment: managerCommentRaw,
  } = input;
  const managerComment =
    managerCommentRaw === undefined ? undefined : normalizeManagerComment(managerCommentRaw);
  const allowedStatuses = options?.allowedStatuses ?? ["NEW", "NEGOTIATING"];
  const draftOnly = options?.draftOnly === true;

  const enrollmentRes = await queryDb<EnrollmentRow>(
    `SELECT er.id,
            er.user_id,
            er.parent_first_name,
            er.parent_last_name,
            er.parent_email,
            er.parent_phone,
            er.school_id,
            er.child_first_name,
            er.child_last_name,
            er.child_birth_date::text AS child_birth_date,
            er.preferred_location,
            er.proposed_group_id,
            er.lessons_per_week,
            UPPER(BTRIM(COALESCE(er.status::text, ''))) AS status
     FROM enrollment_requests er
     WHERE er.id = $1
       AND ($2::text IS NULL OR er.school_id = $2::text)
       AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = ANY($3::text[])
     LIMIT 1`,
    [requestId, options?.restrictToSchoolId ?? null, allowedStatuses]
  );
  const enrollment = enrollmentRes.rows[0];
  if (!enrollment) {
    const onlyNegotiating =
      allowedStatuses.length === 1 && allowedStatuses[0] === "NEGOTIATING";
    const isGroupChangeRepropose = allowedStatuses.some((s) =>
      ["ACCEPTED", "AWAITING_CONTRACT", "CONTRACT_READY", "NEGOTIATING"].includes(s)
    );
    return {
      ok: false,
      status: 409,
      message: onlyNegotiating
        ? "Propozycję dla jednego dziecka można wysłać tylko gdy rodzic negocjuje termin zajęć."
        : isGroupChangeRepropose && !draftOnly
          ? "Nową propozycję grupy można wysłać tylko przed podpisaniem umowy (albo gdy rodzic negocjuje termin)."
          : draftOnly
            ? "Grupę i stawki można zapisać tylko przed podpisaniem umowy."
            : "Propozycję można wysłać tylko dla zgłoszenia „Nowe”.",
    };
  }

  const previousStatus = enrollment.status;

  const studentLessonsPerWeek = normalizeLessonsPerWeek(enrollment.lessons_per_week);

  const previousGroupId = enrollment.proposed_group_id?.trim() || null;
  const groupChanged = Boolean(previousGroupId && previousGroupId !== groupId);

  const parentSchoolId = enrollment.school_id;
  const parentEmail = String(enrollment.parent_email || "").trim().toLowerCase();
  if (!parentEmail) {
    return { ok: false, status: 400, message: "Brak adresu email rodzica w zgłoszeniu" };
  }

  if (sharedParent && sharedParent.parentEmail !== parentEmail) {
    return {
      ok: false,
      status: 400,
      message: "Wszystkie propozycje w jednej wysyłce muszą dotyczyć tego samego rodzica.",
    };
  }

  if (sharedParent && sharedParent.schoolId !== parentSchoolId) {
    return {
      ok: false,
      status: 400,
      message: "Wszystkie propozycje w jednej wysyłce muszą dotyczyć tej samej szkoły.",
    };
  }

  const groupRes = await queryDb<{
    id: string;
    name: string;
    location_name: string;
    schedule: string;
    teacher_name: string;
    price_monthly: string | null;
    price_yearly: string | null;
  }>(
    `SELECT g.id,
            g.name,
            g.price_monthly::text,
            g.price_yearly::text,
            COALESCE(MAX(gl.name), MAX(sl.name), 'Do ustalenia') AS location_name,
            COALESCE(
              NULLIF(
                STRING_AGG(
                  DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
                  ', '
                ),
                ''
              ),
              'Do ustalenia'
            ) AS schedule,
            COALESCE(
              NULLIF(TRIM(MAX(CONCAT(t.first_name, ' ', t.last_name))), ''),
              'Do ustalenia'
            ) AS teacher_name
     FROM groups g
     LEFT JOIN users t ON t.id = g.teacher_id
     LEFT JOIN locations gl ON gl.id = g.location_id
     LEFT JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
       AND ${sqlScheduleTemplateVisibleForStudent("COALESCE($3::int, 2)")}
     LEFT JOIN locations sl ON sl.id = st.location_id
     WHERE g.id = $1 AND g.school_id = $2
     GROUP BY g.id, g.name, g.price_monthly, g.price_yearly, g.lessons_per_week, gl.name`,
    [groupId, parentSchoolId, studentLessonsPerWeek]
  );
  const group = groupRes.rows[0];
  if (!group) return { ok: false, status: 404, message: "Nie znaleziono grupy" };

  const lessonRange = await resolveEffectiveLessonRange({
    schoolId: parentSchoolId,
    groupId,
  });
  const schoolYearStartOn = lessonRange?.yearFrom ?? null;
  const groupLessonsStartOn = lessonRange?.effectiveFrom ?? schoolYearStartOn;

  let parentUserId: string;
  let parentFirstName: string;
  let parentLastName: string;
  let tempPassword: string | null = null;
  let parentCreated = false;

  if (sharedParent) {
    parentUserId = sharedParent.parentUserId;
    parentFirstName = sharedParent.parentFirstName;
    parentLastName = sharedParent.parentLastName;
    parentCreated = sharedParent.parentCreated;
    tempPassword = sharedParent.tempPassword;
  } else {
    const resolved = await resolveParentAccountForEnrollment(enrollment);
    if (!resolved.ok) {
      return { ok: false, status: resolved.status, message: resolved.message };
    }
    parentUserId = resolved.parentUserId;
    parentFirstName = resolved.parentFirstName;
    parentLastName = resolved.parentLastName;
    parentCreated = resolved.parentCreated;
    tempPassword = resolved.tempPassword;
  }

  // Konto powstało wcześniej przy „Zapisz” (bez maila) — przy wysyłce daj nowe hasło tymczasowe.
  if (!draftOnly && !parentCreated && !tempPassword) {
    const pendingRes = await queryDb<{ must_change_password: boolean }>(
      `SELECT must_change_password FROM users WHERE id = $1 LIMIT 1`,
      [parentUserId]
    );
    if (pendingRes.rows[0]?.must_change_password === true) {
      tempPassword = generateTempPassword();
      await updateUserPasswordHash(parentUserId, await bcrypt.hash(tempPassword, 10));
      parentCreated = true;
    }
  }

  await queryDb(
    `UPDATE enrollment_requests
     SET user_id = $1
     WHERE school_id = $2
       AND user_id IS NULL
       AND LOWER(parent_email::text) = LOWER($3::text)`,
    [parentUserId, parentSchoolId, parentEmail]
  );

  await promotePendingLargeFamilyCardToParent({
    schoolId: parentSchoolId,
    parentUserId,
    parentEmail,
  });

  const complimentary = await isComplimentaryForParent(parentSchoolId, {
    parentId: parentUserId,
    parentEmail,
  });

  const parseUnitPrice = (
    raw: number | string | null | undefined,
    label: string,
    required: boolean
  ): { ok: true; value: number | null } | { ok: false; message: string } => {
    if (raw == null || raw === "") {
      if (!required) return { ok: true, value: null };
      return { ok: false, message: `Podaj stawkę: ${label}` };
    }
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, message: `Nieprawidłowa stawka: ${label}` };
    }
    return { ok: true, value: n };
  };

  let parsedLesson: number | null = null;
  let parsedMonthly: number | null = null;
  let parsedYearly: number | null = null;

  if (options?.complimentaryPrices || complimentary) {
    const lesson = parseUnitPrice(lessonUnitPrice, "za pojedyncze zajęcia", false);
    if (!lesson.ok) return { ok: false, status: 400, message: lesson.message };
    const monthly = parseUnitPrice(monthlyUnitPrice, "ratalna", true);
    if (!monthly.ok) return { ok: false, status: 400, message: monthly.message };
    const yearly = parseUnitPrice(yearlyUnitPrice, "jednorazowa", true);
    if (!yearly.ok) return { ok: false, status: 400, message: yearly.message };
    parsedLesson = lesson.value;
    parsedMonthly = monthly.value;
    parsedYearly = yearly.value;
  } else if (draftOnly && options?.allowEmptyPrices) {
    const lesson = parseUnitPrice(lessonUnitPrice, "za pojedyncze zajęcia", false);
    if (!lesson.ok) return { ok: false, status: 400, message: lesson.message };
    const monthly = parseUnitPrice(monthlyUnitPrice, "ratalna", false);
    if (!monthly.ok) return { ok: false, status: 400, message: monthly.message };
    const yearly = parseUnitPrice(yearlyUnitPrice, "jednorazowa", false);
    if (!yearly.ok) return { ok: false, status: 400, message: yearly.message };
    parsedLesson = lesson.value;
    parsedMonthly = monthly.value;
    parsedYearly = yearly.value;
  } else {
    const lesson = parseUnitPrice(lessonUnitPrice, "za pojedyncze zajęcia", true);
    if (!lesson.ok) return { ok: false, status: 400, message: lesson.message };
    const monthly = parseUnitPrice(monthlyUnitPrice, "ratalna", true);
    if (!monthly.ok) return { ok: false, status: 400, message: monthly.message };
    const yearly = parseUnitPrice(yearlyUnitPrice, "jednorazowa", true);
    if (!yearly.ok) return { ok: false, status: 400, message: yearly.message };
    parsedLesson = lesson.value;
    parsedMonthly = monthly.value;
    parsedYearly = yearly.value;
  }

  const discountParsed = parseOptionalDiscountPercent(discountPercent);
  if (!discountParsed.ok) {
    return { ok: false, status: 400, message: discountParsed.message };
  }
  const parsedDiscount = discountParsed.value;

  // draftOnly: bez zmiany statusu mailowego — zachowaj bieżący (NEW / ACCEPTED / …).
  // Po zmianie grupy przed podpisem przy wysyłce maila: jeśli rodzic miał już dane/umowę do podpisu,
  // wracamy do AWAITING_CONTRACT (dane w profilu zostają; rodzic generuje umowę na nowo).
  const initialStatus: EnrollmentStatus = draftOnly
    ? ((previousStatus || "NEW") as EnrollmentStatus)
    : ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE
      ? "PROPOSED"
      : complimentary
        ? "PROPOSED"
        : previousStatus === "AWAITING_CONTRACT" || previousStatus === "CONTRACT_READY"
          ? "AWAITING_CONTRACT"
          : "ACCEPTED";

  if (draftOnly) {
    await queryDb(
      `UPDATE enrollment_requests
       SET proposed_group_id = $2,
           user_id = COALESCE(user_id, $3),
           lesson_unit_price = $4,
           monthly_unit_price = $5,
           yearly_unit_price = $6,
           manager_comment = CASE WHEN $7::boolean THEN $8 ELSE manager_comment END
       WHERE id = $1`,
      [
        requestId,
        groupId,
        parentUserId,
        parsedLesson,
        parsedMonthly,
        parsedYearly,
        managerComment !== undefined,
        managerComment ?? null,
      ]
    );
  } else {
    await queryDb(
      `UPDATE enrollment_requests
       SET status = $7::enrollment_status,
           proposed_group_id = $2,
           proposed_at = NOW(),
           accepted_at = CASE
             WHEN $7::text = 'ACCEPTED' THEN NOW()
             ELSE accepted_at
           END,
           user_id = COALESCE(user_id, $3),
           lesson_unit_price = $4,
           monthly_unit_price = $5,
           yearly_unit_price = $6,
           manager_comment = CASE WHEN $8::boolean THEN $9 ELSE manager_comment END
       WHERE id = $1`,
      [
        requestId,
        groupId,
        parentUserId,
        parsedLesson,
        parsedMonthly,
        parsedYearly,
        initialStatus,
        managerComment !== undefined,
        managerComment ?? null,
      ]
    );
  }

  let resolvedChildId: string;
  const childFirst = formatPersonName(enrollment.child_first_name ?? "");
  const childLast = formatPersonName(enrollment.child_last_name ?? "");
  const childBirth = String(enrollment.child_birth_date ?? "").slice(0, 10);

  const existingChildRes = await queryDb<{ id: string }>(
    `SELECT id FROM children
     WHERE parent_id = $1
       AND school_id = $2
       AND first_name = $3
       AND last_name = $4
     LIMIT 1`,
    [parentUserId, parentSchoolId, childFirst, childLast]
  );
  const existingChildId = existingChildRes.rows[0]?.id ?? null;

  if (existingChildId) {
    resolvedChildId = existingChildId;
    await runPgTransaction(async (client) => {
      await ensureChildClientNumber(
        client,
        existingChildId,
        parentSchoolId,
        parentUserId
      );
      await client.query(
        `UPDATE children
         SET active = TRUE,
             enrollment_request_id = $2,
             access_level = $3,
             confirmed = CASE
               WHEN UPPER(BTRIM(COALESCE(access_level::text, ''))) IN ('SIGNED', 'COMPLETED')
                 THEN confirmed
               ELSE FALSE
             END,
             lesson_unit_price = COALESCE($4, lesson_unit_price),
             monthly_unit_price = COALESCE($5, monthly_unit_price),
             yearly_unit_price = COALESCE($6, yearly_unit_price),
             discount_percent = $7
         WHERE id = $1`,
        [
          existingChildId,
          requestId,
          initialStatus,
          parsedLesson,
          parsedMonthly,
          parsedYearly,
          parsedDiscount,
        ]
      );
    });
  } else {
    const childId = randomUUID();
    resolvedChildId = childId;
    await runPgTransaction(async (client) => {
      const childClientNumber = await allocateChildClientNumber(
        client,
        parentSchoolId,
        parentUserId
      );
      await client.query(
        `INSERT INTO children (
           id, school_id, parent_id, client_number, first_name, last_name, birth_date,
           active, confirmed, enrollment_request_id, access_level,
           lesson_unit_price, monthly_unit_price, yearly_unit_price, discount_percent
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, TRUE, FALSE, $8, $9, $10, $11, $12, $13)`,
        [
          childId,
          parentSchoolId,
          parentUserId,
          childClientNumber,
          childFirst,
          childLast,
          childBirth,
          requestId,
          initialStatus,
          parsedLesson,
          parsedMonthly,
          parsedYearly,
          parsedDiscount,
        ]
      );
    });
  }

  if (!draftOnly) {
    await syncChildrenAccessLevelForEnrollment(requestId, initialStatus);
  }

  await assignChildToProposedGroup(resolvedChildId, groupId, {
    previousGroupId,
    lessonUnitPrice: parsedLesson,
    monthlyUnitPrice: parsedMonthly,
    yearlyUnitPrice: parsedYearly,
    lessonsPerWeek: studentLessonsPerWeek,
    persistToChild: true,
  });

  // Przed podpisem: przy zmianie grupy zaktualizuj group_id na niewysłanych/niepodpisanych umowach.
  // Treść HTML odświeży rodzic przy ponownym generowaniu (ten sam numer umowy).
  if (!draftOnly && groupChanged) {
    await queryDb(
      `UPDATE contracts c
       SET group_id = $3
       WHERE c.parent_id = $1
         AND c.school_id = $2
         AND c.status IN ('DRAFT', 'SENT')
         AND (
           c.child_id = $4
           OR c.enrollment_request_id = $5
           OR EXISTS (
             SELECT 1 FROM contract_children cc
             WHERE cc.contract_id = c.id AND cc.child_id = $4
           )
         )`,
      [parentUserId, parentSchoolId, groupId, resolvedChildId, requestId]
    );
  }

  // Tryb bez umowy: przy wysyłce maila ustawiamy PROPOSED; COMPLETED dopiero po udanej wysyłce (caller).
  // „Zapisz” (draftOnly) nigdy nie domyka — zostaje NEW z grupą/stawkami.
  const complimentaryReadyToComplete =
    complimentary &&
    Boolean(groupId.trim()) &&
    !draftOnly &&
    !ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE;

  if (!draftOnly) {
    await syncParentUserAccessLevel(parentUserId);
  }

  return {
    ok: true,
    sharedParent: {
      parentUserId,
      parentEmail,
      parentFirstName,
      parentLastName,
      parentCreated,
      tempPassword,
      schoolId: parentSchoolId,
    },
    emailItem: {
      childFirstName: enrollment.child_first_name,
      childLastName: enrollment.child_last_name,
      groupName: group.name,
      locationName: group.location_name,
      schedule: group.schedule,
      teacherName: group.teacher_name,
      schoolYearStartOn,
      groupLessonsStartOn,
    },
    complimentaryCompleted: complimentaryReadyToComplete,
    childId: resolvedChildId,
    groupChanged,
  };
}

/** Statusy, w których manager może jeszcze zmienić grupę/stawki (przed podpisaniem umowy). */
const PRICE_EDITABLE_ENROLLMENT_STATUSES = [
  "NEW",
  "NEGOTIATING",
  "PROPOSED",
  "ACCEPTED",
  "AWAITING_CONTRACT",
  "CONTRACT_READY",
] as const;

/**
 * Zapis grupy i stawek + utworzenie konta/dziecka + członkostwo w grupie (confirmed=false),
 * bez maila. Działa też po wysłaniu maila (ACCEPTED itd.), aż do podpisania umowy —
 * wtedy status zgłoszenia zostaje bez zmian (nie wraca do NEW).
 */
export async function saveEnrollmentProposalDraft(
  input: ProposalInput,
  options?: {
    restrictToSchoolId?: string;
    allowEmptyPrices?: boolean;
    complimentaryPrices?: boolean;
  }
): Promise<
  | { ok: true; childId: string; parentCreated: boolean; groupChanged: boolean }
  | { ok: false; status: number; message: string }
> {
  const result = await submitEnrollmentProposal(input, null, {
    ...options,
    allowedStatuses: [...PRICE_EDITABLE_ENROLLMENT_STATUSES],
    draftOnly: true,
    allowEmptyPrices: options?.allowEmptyPrices ?? true,
    complimentaryPrices: options?.complimentaryPrices,
  });
  if (!result.ok) return result;

  // Twarda gwarancja: „Zapisz” nigdy nie zostawia COMPLETED (COMPLETED tylko po mailu w trybie bez umowy).
  await queryDb(
    `UPDATE enrollment_requests
     SET status = 'NEW'::enrollment_status,
         accepted_at = NULL
     WHERE id = $1
       AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'COMPLETED'`,
    [input.requestId]
  );
  await queryDb(
    `UPDATE children
     SET access_level = 'NEW',
         confirmed = FALSE
     WHERE enrollment_request_id = $1
       AND UPPER(BTRIM(COALESCE(access_level::text, ''))) = 'COMPLETED'`,
    [input.requestId]
  );

  return {
    ok: true,
    childId: result.childId,
    parentCreated: result.sharedParent.parentCreated,
    groupChanged: result.groupChanged,
  };
}

function parseOptionalUnitPrice(
  raw: number | string | null | undefined,
  label: string
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, message: `Nieprawidłowa stawka: ${label}` };
  }
  return { ok: true, value: n };
}

/**
 * Zapis samych stawek na zgłoszeniu — bez zmiany statusu / grupy / maila.
 * Działa też po wysłaniu maila (ACCEPTED itd.), aż do podpisania umowy.
 * Tworzy/powiązuje konto rodzica i kartę dziecka (gdy jeszcze brak), żeby % zniżki
 * (na `children`) dało się utrwalić także bez wybranej grupy.
 */
export async function saveEnrollmentRequestPrices(
  input: {
    requestId: string;
    lessonUnitPrice?: number | string | null;
    monthlyUnitPrice?: number | string | null;
    yearlyUnitPrice?: number | string | null;
    discountPercent?: number | string | null;
    managerComment?: string | null;
  },
  options?: { restrictToSchoolId?: string; complimentaryPrices?: boolean }
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const enrollmentRes = await queryDb<{
    id: string;
    user_id: string | null;
    parent_first_name: string;
    parent_last_name: string;
    parent_email: string;
    parent_phone: string | null;
    school_id: string;
    child_first_name: string;
    child_last_name: string;
    child_birth_date: string;
  }>(
    `SELECT er.id,
            er.user_id,
            er.parent_first_name,
            er.parent_last_name,
            er.parent_email,
            er.parent_phone,
            er.school_id,
            er.child_first_name,
            er.child_last_name,
            er.child_birth_date::text AS child_birth_date
     FROM enrollment_requests er
     WHERE er.id = $1
       AND ($2::text IS NULL OR er.school_id = $2::text)
       AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = ANY($3::text[])
     LIMIT 1`,
    [
      input.requestId,
      options?.restrictToSchoolId ?? null,
      [...PRICE_EDITABLE_ENROLLMENT_STATUSES],
    ]
  );
  const enrollment = enrollmentRes.rows[0];
  if (!enrollment) {
    return {
      ok: false,
      status: 409,
      message:
        "Stawki można zmienić tylko przed podpisaniem umowy (nie dla podpisanych / zakończonych / odrzuconych).",
    };
  }

  const discountParsed = parseOptionalDiscountPercent(input.discountPercent);
  if (!discountParsed.ok) {
    return { ok: false, status: 400, message: discountParsed.message };
  }

  let parsedLesson: number | null;
  let parsedMonthly: number | null;
  let parsedYearly: number | null;

  if (options?.complimentaryPrices) {
    const lesson = parseOptionalUnitPrice(input.lessonUnitPrice, "za pojedyncze zajęcia");
    if (!lesson.ok) return { ok: false, status: 400, message: lesson.message };
    const monthly = parseOptionalUnitPrice(input.monthlyUnitPrice, "ratalna");
    if (!monthly.ok) return { ok: false, status: 400, message: monthly.message };
    const yearly = parseOptionalUnitPrice(input.yearlyUnitPrice, "jednorazowa");
    if (!yearly.ok) return { ok: false, status: 400, message: yearly.message };
    if (monthly.value == null || yearly.value == null) {
      return {
        ok: false,
        status: 400,
        message: "Podaj stawkę jednorazową i ratalną (za zajęcia opcjonalnie)",
      };
    }
    parsedLesson = lesson.value;
    parsedMonthly = monthly.value;
    parsedYearly = yearly.value;
  } else {
    const lesson = parseOptionalUnitPrice(input.lessonUnitPrice, "za pojedyncze zajęcia");
    if (!lesson.ok) return { ok: false, status: 400, message: lesson.message };
    const monthly = parseOptionalUnitPrice(input.monthlyUnitPrice, "ratalna");
    if (!monthly.ok) return { ok: false, status: 400, message: monthly.message };
    const yearly = parseOptionalUnitPrice(input.yearlyUnitPrice, "jednorazowa");
    if (!yearly.ok) return { ok: false, status: 400, message: yearly.message };

    if (lesson.value == null || monthly.value == null || yearly.value == null) {
      return {
        ok: false,
        status: 400,
        message: "Podaj wszystkie 3 stawki albo wybierz grupę",
      };
    }
    parsedLesson = lesson.value;
    parsedMonthly = monthly.value;
    parsedYearly = yearly.value;
  }

  const parentSchoolId = enrollment.school_id;
  const parentEmail = String(enrollment.parent_email || "")
    .trim()
    .toLowerCase();
  if (!parentEmail) {
    return { ok: false, status: 400, message: "Brak adresu email rodzica w zgłoszeniu" };
  }

  const resolved = await resolveParentAccountForEnrollment(enrollment);
  if (!resolved.ok) {
    return { ok: false, status: resolved.status, message: resolved.message };
  }
  const parentUserId = resolved.parentUserId;
  const managerComment =
    input.managerComment === undefined
      ? undefined
      : normalizeManagerComment(input.managerComment);

  await queryDb(
    `UPDATE enrollment_requests
     SET user_id = COALESCE(user_id, $2),
         lesson_unit_price = $3,
         monthly_unit_price = $4,
         yearly_unit_price = $5,
         manager_comment = CASE WHEN $6::boolean THEN $7 ELSE manager_comment END
     WHERE id = $1`,
    [
      input.requestId,
      parentUserId,
      parsedLesson,
      parsedMonthly,
      parsedYearly,
      managerComment !== undefined,
      managerComment ?? null,
    ]
  );

  const childFirst = formatPersonName(enrollment.child_first_name ?? "");
  const childLast = formatPersonName(enrollment.child_last_name ?? "");
  const childBirth = String(enrollment.child_birth_date ?? "").slice(0, 10);

  const existingChildRes = await queryDb<{ id: string }>(
    `SELECT id FROM children
     WHERE school_id = $1
       AND (
         enrollment_request_id = $2
         OR (
           parent_id = $3
           AND first_name = $4
           AND last_name = $5
         )
       )
     ORDER BY CASE WHEN enrollment_request_id = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [parentSchoolId, input.requestId, parentUserId, childFirst, childLast]
  );
  let childId = existingChildRes.rows[0]?.id ?? null;

  if (childId) {
    await runPgTransaction(async (client) => {
      await ensureChildClientNumber(client, childId!, parentSchoolId, parentUserId);
      await client.query(
        `UPDATE children
         SET active = TRUE,
             parent_id = $2,
             enrollment_request_id = $3,
             lesson_unit_price = $4,
             monthly_unit_price = $5,
             yearly_unit_price = $6,
             discount_percent = $7
         WHERE id = $1`,
        [
          childId,
          parentUserId,
          input.requestId,
          parsedLesson,
          parsedMonthly,
          parsedYearly,
          discountParsed.value,
        ]
      );
      // Lustro stawek na aktywnych członkostwach (źródło prawdy: children / enrollment).
      await client.query(
        `UPDATE group_students
         SET lesson_unit_price = $2,
             monthly_unit_price = $3,
             yearly_unit_price = $4
         WHERE child_id = $1
           AND school_id = $5
           AND left_at IS NULL`,
        [childId, parsedLesson, parsedMonthly, parsedYearly, parentSchoolId]
      );
    });
  } else {
    if (!childFirst || !childLast || !childBirth) {
      return {
        ok: false,
        status: 400,
        message: "Brak danych dziecka w zgłoszeniu — nie można zapisać zniżki",
      };
    }
    childId = randomUUID();
    await runPgTransaction(async (client) => {
      const childClientNumber = await allocateChildClientNumber(
        client,
        parentSchoolId,
        parentUserId
      );
      await client.query(
        `INSERT INTO children (
           id, school_id, parent_id, client_number, first_name, last_name, birth_date,
           active, confirmed, enrollment_request_id, access_level,
           lesson_unit_price, monthly_unit_price, yearly_unit_price, discount_percent
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, TRUE, FALSE, $8, 'NEW', $9, $10, $11, $12)`,
        [
          childId,
          parentSchoolId,
          parentUserId,
          childClientNumber,
          childFirst,
          childLast,
          childBirth,
          input.requestId,
          parsedLesson,
          parsedMonthly,
          parsedYearly,
          discountParsed.value,
        ]
      );
    });
  }

  return { ok: true };
}

/** Sam zapis komentarza managera na zgłoszeniu (np. blur pola w UI). */
export async function saveEnrollmentManagerComment(
  requestId: string,
  managerCommentRaw: unknown,
  options?: { restrictToSchoolId?: string }
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const rid = String(requestId ?? "").trim();
  if (!rid) {
    return { ok: false, status: 400, message: "Brak identyfikatora zgłoszenia" };
  }
  const managerComment = normalizeManagerComment(managerCommentRaw);
  const schoolId = options?.restrictToSchoolId?.trim() || null;
  const res = await queryDb<{ id: string }>(
    schoolId
      ? `UPDATE enrollment_requests
         SET manager_comment = $2
         WHERE id = $1 AND school_id = $3
         RETURNING id`
      : `UPDATE enrollment_requests
         SET manager_comment = $2
         WHERE id = $1
         RETURNING id`,
    schoolId ? [rid, managerComment, schoolId] : [rid, managerComment]
  );
  if (!res.rows[0]) {
    return { ok: false, status: 404, message: "Nie znaleziono zgłoszenia" };
  }
  return { ok: true };
}
