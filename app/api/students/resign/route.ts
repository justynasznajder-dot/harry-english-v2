import { POST as resignChild } from "@/app/api/children/resign/route";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return resignChild(request);
}
