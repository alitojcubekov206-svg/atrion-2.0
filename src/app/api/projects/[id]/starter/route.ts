import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { requireApiUser } from "@/backend/api-auth";
import { consumeAiQuota, refundAiQuota } from "@/backend/ai-quota";
import { generateStarterKit } from "@/backend/ai";
import type { Blueprint } from "@/shared/types";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId || !project.blueprint) {
    return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  }

  let blueprint: Blueprint;
  try {
    blueprint = JSON.parse(project.blueprint) as Blueprint;
  } catch {
    return NextResponse.json({ error: "План проекта повреждён. Сгенерируйте заново." }, { status: 409 });
  }

  const quota = await consumeAiQuota(userId);
  if (!quota.ok) return NextResponse.json({ error: quota.error, code: quota.code }, { status: 429 });

  try {
    const kit = await generateStarterKit(project.idea, blueprint);
    return NextResponse.json({ kit });
  } catch (error) {
    await refundAiQuota(userId);
    console.error("starter kit generation failed", error);
    return NextResponse.json({ error: "Не удалось создать стартовый код" }, { status: 502 });
  }
}
