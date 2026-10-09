import { NextResponse } from "next/server";
import { getSessionUserId } from "@/backend/auth";
import { primaryTextProvider } from "@/backend/text-ai";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = primaryTextProvider();
  return NextResponse.json({aiConfigured: Boolean(provider), model: provider?.model ?? null, provider: provider?.kind ?? "procedural"});
}
