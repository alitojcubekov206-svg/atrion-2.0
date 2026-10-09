import { NextResponse } from "next/server";
import { reserveGenerationQuota } from "@/backend/generation-quota";
import { generate3DModel } from "@/backend/ai";
import {generationApi} from "@/backend/generation-http";
import {generationPlan, readGenerationRequest} from "@/backend/generation-request";
import {readDesignBody} from "@/backend/design/body";
import {partsProcurement} from "@/shared/procurement";

// 60 is the Vercel Hobby ceiling; anything higher fails the deploy on that plan.
export const maxDuration = 60;

export async function POST(req: Request) {
  return generationApi(async (userId,requestId)=>{
  const {prompt,answers:safeAnswers}=readGenerationRequest(await readDesignBody(req));

  const quota = await reserveGenerationQuota(userId);
  if (!quota.ok) {
    return NextResponse.json({ error: quota.error, code: quota.code }, { status: quota.status });
  }

  try {
    const cleanPrompt = prompt.trim();
    // A fresh variant per request: asking again gives a new model, not the same one.
    const variant = crypto.randomUUID().slice(0, 8);
    const plan = generationPlan(cleanPrompt, safeAnswers, variant);
    const result = await generate3DModel(cleanPrompt, safeAnswers, { variant });

    // ТЗ 4.1: the generation must be traceable - what was read out of the text,
    // which geometry won, and how detailed the result is.
    const diagnostics = {
      plan: plan.summary,
      kind: plan.blueprint.kind,
      matched: plan.blueprint.matched,
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
      requestId, promptLength: cleanPrompt.length,
      kind: diagnostics.kind, source: diagnostics.source,
      parts: diagnostics.parts, primitives: diagnostics.primitives,
    });

    return NextResponse.json({ concept: result.concept, diagnostics, procurement: partsProcurement(result.concept.parts) });
  } catch (error) {
    await quota.refund();
    throw error;
  }
  });
}
