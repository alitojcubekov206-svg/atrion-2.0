import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { requireApiUser } from "@/backend/api-auth";
import { createProjectShareToken, SHARE_TOKEN_DAYS } from "@/backend/share";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const project = await db.project.findUnique({
    where: { id },
    select: { userId: true, blueprint: true },
  });
  if (!project || project.userId !== auth.userId || !project.blueprint) {
    return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  }

  const token = await createProjectShareToken(id);
  const origin = new URL(req.url).origin;
  return NextResponse.json({ url: `${origin}/share/${token}`, expiresInDays: SHARE_TOKEN_DAYS });
}
