import { NextResponse } from "next/server";
import { getSessionUserId, getUserPlan } from "@/lib/auth";
import { generate3DConcept } from "@/lib/ai";
import { db } from "@/lib/db";

export const maxDuration = 120;

export async function POST(req: Request) {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId: string = sessionUserId;

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
  const FREE_GENERATION_LIMIT = 5;
  if (plan !== "pro") {
    const reservation = await db.user.updateMany({
      where: {
        id: userId,
        plan: { not: "pro" },
        threeDGenerations: { lt: FREE_GENERATION_LIMIT },
      },
      data: { threeDGenerations: { increment: 1 } },
    });
    if (reservation.count === 0) {
      return NextResponse.json(
        {
          error: `Бесплатный лимит: ${FREE_GENERATION_LIMIT} генераций 3D. Перейди на Pro.`,
          code: "THREE_D_LIMIT_REACHED",
        },
        { status: 403 }
      );
    }
    freeGenerationReserved = true;
  }

  async function refundQuota() {
    if (!freeGenerationReserved) return;
    freeGenerationReserved = false;
    await db.user
      .updateMany({
        where: { id: userId, threeDGenerations: { gt: 0 } },
        data: { threeDGenerations: { decrement: 1 } },
      })
      .catch((e) => console.error("3D quota refund failed", e));
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
    await refundQuota();
    console.error("3D concept generation failed", error);
    return NextResponse.json(
      { error: "Не удалось создать модель. Уточните описание и попробуйте снова." },
      { status: 502 }
    );
  }
}
