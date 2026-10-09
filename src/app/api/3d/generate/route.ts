import { NextResponse } from "next/server";
import { requireApiUser } from "@/backend/api-auth";
import { reserveGenerationQuota } from "@/backend/generation-quota";
import { generate3DModel } from "@/backend/ai";
import { planFor } from "@/backend/procedural-3d";
import {partsProcurement} from "@/shared/procurement";

// 60 is the Vercel Hobby ceiling; anything higher fails the deploy on that plan.
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  let prompt: unknown;
  let answers: unknown;
  try {
    const body = await req.json();
    prompt = body?.prompt;
    answers = body?.answers;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (typeof prompt !== "string" || prompt.trim().length < 3) {
    return NextResponse.json(
      { error: "Укажите название объекта — минимум 3 символа." },
      { status: 400 }
    );
  }
  if (prompt.length > 1500) {
    return NextResponse.json({ error: "Описание слишком длинное." }, { status: 400 });
  }

  const quota = await reserveGenerationQuota(userId);
  if (!quota.ok) {
    return NextResponse.json({ error: quota.error, code: quota.code }, { status: quota.status });
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

    const cleanPrompt = prompt.trim();
    // A fresh variant per request: asking again gives a new model, not the same one.
    const variant = crypto.randomUUID().slice(0, 8);
    const generationPlan = planFor(cleanPrompt, variant);
    const result = await generate3DModel(cleanPrompt, safeAnswers, { variant });

    // ТЗ 4.1: the generation must be traceable - what was read out of the text,
    // which geometry won, and how detailed the result is.
    const diagnostics = {
      plan: generationPlan.summary,
      kind: generationPlan.blueprint.kind,
      matched: generationPlan.blueprint.matched,
      source: result.source,
      score: result.score,
      match: result.match,
      quality: result.quality,
      missing: result.missing,
      primitives: result.primitives,
      parts: result.concept.parts.length,
      notes: result.notes,
    };
    console.info("[3d/generate]", {
      requestId: crypto.randomUUID(), promptLength: cleanPrompt.length,
      kind: diagnostics.kind, source: diagnostics.source,
      parts: diagnostics.parts, primitives: diagnostics.primitives,
    });

    return NextResponse.json({ concept: result.concept, diagnostics, procurement: partsProcurement(result.concept.parts) });
  } catch (error) {
    await quota.refund();
    console.error("3D concept generation failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json(
      { error: "Не удалось создать модель. Уточните описание и попробуйте снова." },
      { status: 502 }
    );
  }
}
