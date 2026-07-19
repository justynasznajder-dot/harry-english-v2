import { NextRequest, NextResponse } from "next/server";
import { getParentProfileByUserId, getUserById } from "@/lib/db";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { sendHarryMail } from "@/lib/email";

export async function POST(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId } = auth.ctx;

  try {
    const body = await request.json();
    const message = String(body.message ?? body.changes ?? "").trim();
    if (!message) {
      return NextResponse.json({ message: "Opisz proponowane zmiany danych" }, { status: 400 });
    }

    const [user, profile] = await Promise.all([
      getUserById(parentId),
      getParentProfileByUserId(parentId),
    ]);
    if (!user) {
      return NextResponse.json({ message: "Użytkownik nie istnieje" }, { status: 404 });
    }

    const profileSummary = profile
      ? [
          `Adres: ${profile.address ?? "—"}, ${profile.zip_code ?? ""} ${profile.city ?? ""}`.trim(),
          profile.pesel ? `PESEL: ${profile.pesel}` : null,
          profile.nip ? `NIP: ${profile.nip}` : null,
          profile.company_name ? `Firma: ${profile.company_name}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "Brak zapisanego profilu do umowy.";

    const schoolEmail = process.env.EMAIL_USER || "kontakt@harry-english.pl";
    const parentName = `${user.first_name} ${user.last_name}`.trim();

    await sendHarryMail({
      from: {
        name: "Harry English — portal rodzica",
        address: schoolEmail,
      },
      to: schoolEmail,
      replyTo: user.email,
      subject: `Prośba o zmianę danych do faktury — ${parentName}`,
      text: [
        `Rodzic ${parentName} (${user.email}) prosi o aktualizację danych do umowy/faktury.`,
        "",
        "Obecne dane:",
        profileSummary,
        "",
        "Proponowane zmiany:",
        message,
        "",
        `ID rodzica: ${parentId}`,
        `ID szkoły: ${schoolId}`,
      ].join("\n"),
      html: `<p>Rodzic <strong>${parentName}</strong> (${user.email}) prosi o aktualizację danych do umowy/faktury.</p>
             <p><strong>Obecne dane:</strong><br/>${profileSummary.replace(/\n/g, "<br/>")}</p>
             <p><strong>Proponowane zmiany:</strong><br/>${message.replace(/\n/g, "<br/>")}</p>
             <p style="font-size:12px;color:#666">ID rodzica: ${parentId}<br/>ID szkoły: ${schoolId}</p>`,
    });

    return NextResponse.json({
      success: true,
      message: "Prośba została wysłana do szkoły. Skontaktujemy się w sprawie zmiany danych.",
    });
  } catch (error) {
    console.error("POST /api/user/profile/change-request:", error);
    return NextResponse.json({ message: "Nie udało się wysłać prośby" }, { status: 500 });
  }
}
