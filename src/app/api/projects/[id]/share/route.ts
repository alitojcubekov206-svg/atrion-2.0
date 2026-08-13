import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { createProjectShareToken } from "@/lib/share";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({
    where: { id },
    select: { userId: true, blueprint: true },
  });
  if (!project || project.userId !== userId || !project.blueprint) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const token = await createProjectShareToken(id);
  const origin = new URL(req.url).origin;
  return NextResponse.json({ url: `${origin}/share/${token}` });
}
