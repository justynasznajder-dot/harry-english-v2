import { POST as addChild } from "@/app/api/children/add/route";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return addChild(request);
}
