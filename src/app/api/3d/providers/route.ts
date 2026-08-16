import { NextResponse } from "next/server";
import { getSessionUserId } from "@/backend/auth";
import { isDemoMode } from "@/backend/ai";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ aiConfigured: !isDemoMode() });
}
