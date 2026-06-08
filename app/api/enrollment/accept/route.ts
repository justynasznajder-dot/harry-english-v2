import { NextRequest, NextResponse } from "next/server";

import { getRegistrationSchoolId, queryDb } from "@/lib/db";

import { getTokenFromRequest } from "@/lib/auth";

import { completeComplimentaryEnrollment } from "@/lib/complimentary-enrollment";

import {

  syncChildrenAccessLevelForEnrollment,

  syncParentUserAccessLevel,

} from "@/lib/enrollment-sync";

import { isComplimentaryForParent } from "@/lib/school-discounts";



/**

 * Rodzic akceptuje propozycję grupy.

 *

 * Body (opcjonalne): `{ requestId?: string }`.

 *

 * Tryb bez opłat: zapis kończy się od razu (COMPLETED), bez umowy.

 * Standardowo: ACCEPTED → kolejny krok to umowa.

 */

export async function PUT(request: NextRequest) {

  const payload = await getTokenFromRequest(request);

  const parentId = payload?.userId ?? null;

  if (!parentId) {

    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });

  }



  const SCHOOL_ID = getRegistrationSchoolId();



  let requestedId: string | null = null;

  try {

    const body = (await request.json().catch(() => ({}))) as { requestId?: unknown };

    if (typeof body.requestId === "string" && body.requestId.trim().length > 0) {

      requestedId = body.requestId.trim();

    }

  } catch {

    /* brak body — fallback poniżej */

  }



  try {

    const parentRes = await queryDb<{ id: string; email: string }>(

      `SELECT id, email FROM users WHERE id = $1 AND school_id = $2 AND role = 'PARENT' LIMIT 1`,

      [parentId, SCHOOL_ID]

    );

    const parent = parentRes.rows[0];

    if (!parent) {

      return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });

    }



    const enrollmentRes = requestedId

      ? await queryDb<{ id: string }>(

          `SELECT id

           FROM enrollment_requests

           WHERE id = $1 AND user_id = $2 AND school_id = $3

             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'

           LIMIT 1`,

          [requestedId, parentId, SCHOOL_ID]

        )

      : await queryDb<{ id: string }>(

          `SELECT id

           FROM enrollment_requests

           WHERE user_id = $1 AND school_id = $2

             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'

           ORDER BY created_at DESC

           LIMIT 1`,

          [parentId, SCHOOL_ID]

        );



    const enrollment = enrollmentRes.rows[0];

    if (!enrollment) {

      return NextResponse.json(

        {

          message: requestedId

            ? "Propozycja nieaktywna lub nie należy do Twojego konta"

            : "Brak propozycji do akceptacji",

        },

        { status: requestedId ? 409 : 400 }

      );

    }



    const complimentary = await isComplimentaryForParent(SCHOOL_ID, {

      parentId,

      parentEmail: parent.email,

    });



    if (complimentary) {

      await completeComplimentaryEnrollment(enrollment.id, parentId, SCHOOL_ID);

    } else {

      await queryDb(

        `UPDATE enrollment_requests

         SET status = 'ACCEPTED', accepted_at = NOW()

         WHERE id = $1`,

        [enrollment.id]

      );

      await syncChildrenAccessLevelForEnrollment(enrollment.id, "ACCEPTED");

      await syncParentUserAccessLevel(parentId);

    }



    const remainingRes = await queryDb<{ remaining: string }>(

      `SELECT COUNT(*)::text AS remaining

       FROM children

       WHERE parent_id = $1

         AND school_id = $2

         AND active = TRUE

         AND UPPER(BTRIM(COALESCE(access_level::text, ''))) = 'PROPOSED'`,

      [parentId, SCHOOL_ID]

    );

    const remaining = Number(remainingRes.rows[0]?.remaining ?? "0");



    return NextResponse.json({

      message: complimentary

        ? remaining === 0

          ? "Propozycja zaakceptowana — zapis został zakończony (tryb bez opłat)."

          : "Propozycja zaakceptowana — zapis tego dziecka zakończony. Pozostałe propozycje czekają na decyzję."

        : remaining === 0

          ? "Propozycja zaakceptowana — przejdź do uzupełnienia danych do umowy."

          : "Propozycja zaakceptowana. Pozostałe dzieci czekają na Twoją decyzję lub na odrzucenie przez szkołę.",

      remainingProposed: remaining,

      complimentaryEnrollment: complimentary,

      enrollmentCompleted: complimentary,

    });

  } catch (error) {

    console.error("Enrollment accept error:", error);

    return NextResponse.json({ message: "Nie udało się zaakceptować propozycji" }, { status: 500 });

  }

}


