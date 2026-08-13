import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { generate3DInterview } from "@/lib/ai";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let prompt: unknown;
  try {
    const body = await req.json();
    prompt = body?.prompt;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (typeof prompt !== "string" || prompt.trim().length < 10) {
    return NextResponse.json(
      { error: "Опишите объект подробнее — минимум 10 символов." },
      { status: 400 }
    );
  }

  try {
    const questions = await generate3DInterview(prompt.trim());
    return NextResponse.json({ questions });
  } catch (error) {
    console.error("3D interview generation failed", error);
    return NextResponse.json(
      { error: "AI не смог подготовить вопросы. Попробуйте ещё раз." },
      { status: 502 }
    );
  }
}
