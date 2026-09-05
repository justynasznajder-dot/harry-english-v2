import { NextResponse } from "next/server";
import { clearAllAuthCookies } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({
    message: "Wylogowano pomyślnie",
  });

  clearAllAuthCookies(response);

  return response;
}
