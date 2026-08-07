import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { isTripoConfigured, isTripoEnabled } from "@/lib/tripo";
import { isFalConfigured, isTrellisEnabled } from "@/lib/trellis";
import { isMeshyConfigured } from "@/lib/meshy";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    tripoConfigured: isTripoConfigured(),
    tripoEnabled: isTripoEnabled(),
    falConfigured: isFalConfigured(),
    trellisEnabled: isTrellisEnabled(),
    meshyConfigured: isMeshyConfigured(),
    meshyEnabled: process.env.MESHY_ENABLED === "true",
  });
}
