import { NextRequest, NextResponse } from "next/server";
import { backfillMissingLessonsForAllSchools } from "@/lib/lesson-generation";

export const maxDuration = 120;

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Codzienny cron: dopełnia brakujące zajęcia tylko dla potwierdzonych harmonogramów. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backfillMissingLessonsForAllSchools();
    return NextResponse.json({
      message:
        result.groupsProcessed === 0
          ? "Brak grup z potwierdzonym harmonogramem na aktywny rok"
          : `Sprawdzono ${result.groupsProcessed} grup z potwierdzonym harmonogramem (${result.schoolsProcessed} szkół), dodano ${result.created} brakujących zajęć`,
      ...result,
    });
  } catch (error) {
    console.error("GET /api/cron/lessons-generate:", error);
    return NextResponse.json({ message: "Błąd crona generowania zajęć" }, { status: 500 });
  }
}
