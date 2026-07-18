import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { generate3DConcept } from "@/lib/ai";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let prompt: unknown;
  let answers: unknown;
  try {
    const body = await req.json();
    prompt = body?.prompt;
    answers = body?.answers;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (typeof prompt !== "string" || prompt.trim().length < 10) {
    return NextResponse.json(
      { error: "Опишите объект подробнее — минимум 10 символов." },
      { status: 400 }
    );
  }

  if (prompt.length > 1500) {
    return NextResponse.json({ error: "Описание слишком длинное." }, { status: 400 });
  }

  try {
    const safeAnswers = Array.isArray(answers)
      ? answers
          .filter(
            (item) =>
              item &&
              typeof item.question === "string" &&
              typeof item.answer === "string"
          )
          .slice(0, 10)
      : [];
    const concept = await generate3DConcept(prompt.trim(), safeAnswers);
    return NextResponse.json({ concept });
  } catch (error) {
    console.error("3D concept generation failed", error);
    return NextResponse.json(
      { error: "AI не смог создать модель. Уточните описание и попробуйте снова." },
      { status: 502 }
    );
  }
}
