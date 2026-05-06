import { NextRequest, NextResponse } from "next/server";
import { getChildrenByParentId, getUserById } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Sprawdź czy użytkownik jest zalogowany (token z cookie)
    const authToken = request.cookies.get('auth-token');
    if (!authToken) {
      return NextResponse.json(
        { message: "Nieautoryzowany dostęp" },
        { status: 401 }
      );
    }

    // Pobierz user_id z tokenu (format: base64(user_id:timestamp))
    let userId: string;
    try {
      const tokenData = Buffer.from(authToken.value, 'base64').toString();
      userId = tokenData.split(':')[0];
    } catch (error) {
      return NextResponse.json(
        { message: "Nieprawidłowy token" },
        { status: 401 }
      );
    }

    // Sprawdź czy użytkownik istnieje
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { message: "Użytkownik nie istnieje" },
        { status: 404 }
      );
    }

    // Rodzic widzi swoje dzieci; admin/teacher bez listy dzieci.
    let children: any[] = [];
    if (user.role === "PARENT") {
      const rows = await getChildrenByParentId(userId);
      children = rows.map((c) => ({
        childId: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        birthDate: c.birth_date,
        active: c.active,
        confirmed: c.confirmed,
        enrollmentRequestId: c.enrollment_request_id,
        resignationRequested: c.resignation_requested || false,
        resignationReason: c.resignation_reason || null,
      }));
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        accessLevel: user.access_level,
        schoolId: user.school_id,
        children,
        accountType: user.account_type,
        students: children.map((c) => ({
          studentId: c.childId,
          firstName: c.firstName,
          lastName: c.lastName,
          birthYear: String(c.birthDate).slice(0, 4),
          active: c.active,
          resignationRequested: c.resignationRequested,
          resignationReason: c.resignationReason,
        })),
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas pobierania danych" },
      { status: 500 }
    );
  }
}
