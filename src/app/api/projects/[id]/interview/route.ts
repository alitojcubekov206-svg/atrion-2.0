import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { requireApiUser } from "@/backend/api-auth";
import { consumeAiQuota, refundAiQuota } from "@/backend/ai-quota";
import { generateInterview } from "@/backend/ai";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  }

  const quota = await consumeAiQuota(userId);
  if (!quota.ok) return NextResponse.json({ error: quota.error, code: quota.code }, { status: 429 });

  try {
    const questions = await generateInterview(project.idea);
    await db.project.update({
      where: { id },
      data: { interview: JSON.stringify({ questions, answers: {} }), status: "interview" },
    });
    return NextResponse.json({ questions });
  } catch (e) {
    await refundAiQuota(userId);
    console.error("interview generation failed", e);
    return NextResponse.json({ error: "AI недоступен, попробуйте ещё раз" }, { status: 502 });
  }
}
