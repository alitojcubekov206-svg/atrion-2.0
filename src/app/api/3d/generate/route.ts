import { NextResponse } from "next/server";
import { getSessionUserId, getUserPlan } from "@/lib/auth";
import { generate3DConcept } from "@/lib/ai";
import { attachMeshUrl as attachMeshyUrl, generateMeshyGlb, isMeshyConfigured } from "@/lib/meshy";
import {
  attachMeshUrl as attachTripoUrl,
  generateTripoGlb,
  isTripoConfigured,
  isTripoEnabled,
} from "@/lib/tripo";
import { db } from "@/lib/db";

export const maxDuration = 300;

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let prompt: unknown;
  let answers: unknown;
  let wantMesh: unknown;
  try {
    const body = await req.json();
    prompt = body?.prompt;
    answers = body?.answers;
    wantMesh = body?.wantMesh;
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
          error:
            "Бесплатная 3D-генерация уже использована. Перейдите на Pro для расширенного доступа.",
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

    let concept = await generate3DConcept(prompt.trim(), safeAnswers);
    let meshError: string | null = null;
    let meshProvider: "tripo" | "meshy" | null = null;

    const meshPrompt = [
      prompt.trim(),
      ...safeAnswers.map((a) => `${a.question}: ${a.answer}`),
    ]
      .join(". ")
      .slice(0, 1000);

    // wantMesh !== false → try real mesh when a provider is configured
    const requestMesh = wantMesh !== false;

    if (requestMesh && isTripoEnabled()) {
      try {
        const glb = await generateTripoGlb(meshPrompt);
        concept = attachTripoUrl(concept, glb);
        meshProvider = "tripo";
      } catch (error) {
        meshError =
          error instanceof Error ? error.message : "Tripo mesh failed — силуэт";
        console.error("Tripo generation failed", error);
      }
    }

    if (
      !concept.meshUrl &&
      requestMesh &&
      isMeshyConfigured() &&
      process.env.MESHY_ENABLED === "true"
    ) {
      try {
        const glb = await generateMeshyGlb(meshPrompt.slice(0, 580));
        concept = attachMeshyUrl(concept, glb);
        meshProvider = "meshy";
        meshError = null;
      } catch (error) {
        meshError =
          error instanceof Error ? error.message : "Meshy mesh failed — силуэт";
        console.error("Meshy generation failed", error);
      }
    }

    return NextResponse.json({
      concept,
      mesh: Boolean(concept.meshUrl),
      meshProvider,
      tripoConfigured: isTripoConfigured(),
      tripoEnabled: isTripoEnabled(),
      meshyConfigured: isMeshyConfigured(),
      meshError,
      // legacy keys for older clients
      meshy: Boolean(concept.meshUrl),
      meshyError: meshError,
    });
  } catch (error) {
    if (freeGenerationReserved) {
      await db.user
        .updateMany({
          where: { id: userId, threeDGenerations: { gt: 0 } },
          data: { threeDGenerations: { decrement: 1 } },
        })
        .catch((rollbackError) =>
          console.error("3D quota rollback failed", rollbackError)
        );
    }
    console.error("3D concept generation failed", error);
    return NextResponse.json(
      { error: "AI не смог создать модель. Уточните описание и попробуйте снова." },
      { status: 502 }
    );
  }
}
