import { NextResponse } from "next/server";
import { requireApiUser } from "@/backend/api-auth";
import { consumeAiQuota, refundAiQuota } from "@/backend/ai-quota";
import { generate3DInterview } from "@/backend/ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  let prompt: unknown;
  try {
    const body = await req.json();
    prompt = body?.prompt;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (typeof prompt !== "string" || prompt.trim().length < 10) {
    return NextResponse.json(
      { error: "Опишите объект подробнее - минимум 10 символов." },
      { status: 400 }
    );
  }
  if (prompt.length > 1500) {
    return NextResponse.json({ error: "Описание слишком длинное." }, { status: 400 });
  }

  const quota = await consumeAiQuota(userId);
  if (!quota.ok) return NextResponse.json({ error: quota.error, code: quota.code }, { status: 429 });

  try {
    const questions = await generate3DInterview(prompt.trim());
    return NextResponse.json({ questions });
  } catch (error) {
    await refundAiQuota(userId);
    console.error("3D interview generation failed", error);
    return NextResponse.json(
      { error: "AI не смог подготовить вопросы. Попробуйте ещё раз." },
      { status: 502 }
    );
  }
}
