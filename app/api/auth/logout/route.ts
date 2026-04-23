import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    message: "Wylogowano pomyślnie"
  });

  // Usuń cookie z tokenem
  response.cookies.set('auth-token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0, // Natychmiastowe wygaśnięcie
    path: '/',
  });

  return response;
}
