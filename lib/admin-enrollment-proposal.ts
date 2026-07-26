import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import {
  createUser,
  findUserBySchoolAndEmail,
  POLISH_DAY_FROM_ST_SQL,
  queryDb,
  runPgTransaction,
  updateUser,
} from "@/lib/db";
import { generateTempPassword } from "@/lib/password";
import { formatPersonName } from "@/lib/format-person-name";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";
import {
  allocateChildClientNumber,
  ensureChildClientNumber,
} from "@/lib/client-numbers";
import { promotePendingLargeFamilyCardToParent } from "@/lib/parent-profile-discount";

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
};

export type ProposalEmailItem = {
  childFirstName: string;
  childLastName: string;
  groupName: string;
  locationName: string;
  schedule: string;
};

export type SharedParentState = {
  parentUserId: string;
  parentEmail: string;
  parentFirstName: string;
  parentLastName: string;
  parentCreated: boolean;
  tempPassword: string | null;
};

export type ProposalInput = {
  requestId: string;
  groupId: string;
  lessonUnitPrice?: number | string | null;
  monthlyUnitPrice?: number | string | null;
  yearlyUnitPrice?: number | string | null;
};

export type EnrollmentProposalStatus = "NEW" | "NEGOTIATING";

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

export async function submitEnrollmentProposal(
  input: ProposalInput,
  sharedParent: SharedParentState | null,
  options?: {
    restrictToSchoolId?: string;
    allowedStatuses?: EnrollmentProposalStatus[];
  }
): Promise<
  | {
      ok: true;
      sharedParent: SharedParentState;
      emailItem: ProposalEmailItem;
    }
  | { ok: false; status: number; message: string }
> {
  const { requestId, groupId, lessonUnitPrice, monthlyUnitPrice, yearlyUnitPrice } = input;
  const allowedStatuses = options?.allowedStatuses ?? ["NEW", "NEGOTIATING"];

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
            er.preferred_location
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
    return {
      ok: false,
      status: 409,
      message: onlyNegotiating
        ? "Propozycję dla jednego dziecka można wysłać tylko gdy rodzic negocjuje termin zajęć."
        : "Propozycję można wysłać tylko dla zgłoszenia „Nowe”.",
    };
  }

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

  const groupRes = await queryDb<{
    id: string;
    name: string;
    location_name: string;
    schedule: string;
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
            ) AS schedule
     FROM groups g
     LEFT JOIN locations gl ON gl.id = g.location_id
     LEFT JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
     LEFT JOIN locations sl ON sl.id = st.location_id
     WHERE g.id = $1 AND g.school_id = $2
     GROUP BY g.id, g.name, g.price_monthly, g.price_yearly, gl.name`,
    [groupId, parentSchoolId]
  );
  const group = groupRes.rows[0];
  if (!group) return { ok: false, status: 404, message: "Nie znaleziono grupy" };

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
  } else if (enrollment.user_id && String(enrollment.user_id).trim().length > 0) {
    const existingRes = await queryDb<{
      id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
    }>(`SELECT id, first_name, last_name, phone FROM users WHERE id = $1 LIMIT 1`, [
      enrollment.user_id,
    ]);
    const existing = existingRes.rows[0];
    if (!existing) {
      return {
        ok: false,
        status: 409,
        message: "Zgłoszenie wskazuje na nieistniejące konto rodzica",
      };
    }
    parentUserId = existing.id;
    // Preferuj imię/nazwisko ze zgłoszenia — konto mogło powstać wcześniej pod innym imieniem.
    parentFirstName = formatPersonName(
      enrollment.parent_first_name?.trim() || existing.first_name
    );
    parentLastName = formatPersonName(
      enrollment.parent_last_name?.trim() || existing.last_name
    );
    await updateUser(parentUserId, {
      first_name: parentFirstName,
      last_name: parentLastName,
      phone: enrollment.parent_phone?.trim() || existing.phone || null,
    });
  } else {
    const existing = await findUserBySchoolAndEmail(parentSchoolId, parentEmail);
    if (existing) {
      parentUserId = existing.id;
      parentFirstName = formatPersonName(
        enrollment.parent_first_name?.trim() || existing.first_name
      );
      parentLastName = formatPersonName(
        enrollment.parent_last_name?.trim() || existing.last_name
      );
      await updateUser(parentUserId, {
        first_name: parentFirstName,
        last_name: parentLastName,
        phone: enrollment.parent_phone?.trim() || existing.phone || null,
      });
    } else {
      tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
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
      parentUserId = newUser.id;
      parentFirstName = newUser.first_name;
      parentLastName = newUser.last_name;
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

  await queryDb(
    `UPDATE enrollment_requests
     SET status = 'PROPOSED',
         proposed_group_id = $2,
         proposed_at = NOW(),
         user_id = COALESCE(user_id, $3),
         lesson_unit_price = $4,
         monthly_unit_price = $5,
         yearly_unit_price = $6
     WHERE id = $1`,
    [
      requestId,
      groupId,
      parentUserId,
      lessonUnitPrice != null && lessonUnitPrice !== ""
        ? Number(lessonUnitPrice)
        : null,
      monthlyUnitPrice != null && monthlyUnitPrice !== ""
        ? Number(monthlyUnitPrice)
        : null,
      yearlyUnitPrice != null && yearlyUnitPrice !== ""
        ? Number(yearlyUnitPrice)
        : null,
    ]
  );

  let resolvedChildId: string | null = null;
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
             access_level = 'PROPOSED'
         WHERE id = $1`,
        [existingChildId, requestId]
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
           active, confirmed, enrollment_request_id, access_level
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, TRUE, FALSE, $8, 'PROPOSED')`,
        [
          childId,
          parentSchoolId,
          parentUserId,
          childClientNumber,
          childFirst,
          childLast,
          childBirth,
          requestId,
        ]
      );
    });
  }

  await syncChildrenAccessLevelForEnrollment(requestId, "PROPOSED");
  await syncParentUserAccessLevel(parentUserId);

  return {
    ok: true,
    sharedParent: {
      parentUserId,
      parentEmail,
      parentFirstName,
      parentLastName,
      parentCreated,
      tempPassword,
    },
    emailItem: {
      childFirstName: enrollment.child_first_name,
      childLastName: enrollment.child_last_name,
      groupName: group.name,
      locationName: group.location_name,
      schedule: group.schedule,
    },
  };
}
