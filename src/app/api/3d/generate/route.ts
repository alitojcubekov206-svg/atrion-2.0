import { NextResponse } from "next/server";
import { getSessionUserId, getUserPlan } from "@/lib/auth";
import { generate3DConcept } from "@/lib/ai";
import { db } from "@/lib/db";

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

  const plan = await getUserPlan(userId);

  let freeGenerationReserved = false;
  if (plan !== "pro") {
    const reservation = await db.user.updateMany({
      where: {
        id: userId,
        plan: { not: "pro" },
        threeDGenerations: { lt: 1 },
      },
      data: { threeDGenerations: { increment: 1 } },
    });
    if (reservation.count === 0) {
      return NextResponse.json(
        {
          error: "Бесплатная 3D-генерация уже использована. Перейдите на Pro для расширенного доступа.",
          code: "THREE_D_LIMIT_REACHED",
        },
        { status: 403 }
      );
    }
    freeGenerationReserved = true;
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
    if (freeGenerationReserved) {
      await db.user
        .updateMany({
          where: { id: userId, threeDGenerations: { gt: 0 } },
          data: { threeDGenerations: { decrement: 1 } },
        })
        .catch((rollbackError) => console.error("3D quota rollback failed", rollbackError));
    }
    console.error("3D concept generation failed", error);
    return NextResponse.json(
      { error: "AI не смог создать модель. Уточните описание и попробуйте снова." },
      { status: 502 }
    );
  }
}
