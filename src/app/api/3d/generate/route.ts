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
import {
  attachMeshUrl as attachTrellisUrl,
  generateTrellisGlb,
  isFalConfigured,
  isTrellisEnabled,
  uploadImageToFal,
} from "@/lib/trellis";
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
  let mode: unknown;
  let imageDataUrl: unknown;
  try {
    const body = await req.json();
    prompt = body?.prompt;
    answers = body?.answers;
    wantMesh = body?.wantMesh;
    mode = body?.mode;
    imageDataUrl = body?.imageDataUrl;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const genMode = mode === "image" ? "image" : "text";

  if (genMode === "text" && (typeof prompt !== "string" || prompt.trim().length < 10)) {
    return NextResponse.json(
      { error: "Опишите объект подробнее — минимум 10 символов." },
      { status: 400 }
    );
  }

  if (
    genMode === "image" &&
    (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image"))
  ) {
    return NextResponse.json(
      { error: "Загрузите изображение (PNG/JPG) для Trellis 2." },
      { status: 400 }
    );
  }

  if (typeof prompt === "string" && prompt.length > 1500) {
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
            "Бесплатный лимит: 1 генерация 3D. Перейди на Pro или подожди — лимит уже использован.",
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

    const ideaPrompt =
      genMode === "image"
        ? typeof prompt === "string" && prompt.trim().length > 3
          ? prompt.trim()
          : "3D модель по загруженному изображению (Trellis 2)"
        : (prompt as string).trim();

    let concept = await generate3DConcept(ideaPrompt, safeAnswers);
    let meshError: string | null = null;
    let meshProvider: "tripo" | "meshy" | "trellis2" | null = null;
    let needsClientBlob = false;

    const requestMesh = wantMesh !== false;
    const meshPrompt = [
      ideaPrompt,
      ...safeAnswers.map((a) => `${a.question}: ${a.answer}`),
    ]
      .join(". ")
      .slice(0, 1000);

    if (requestMesh && genMode === "image" && isTrellisEnabled()) {
      try {
        const publicUrl = await uploadImageToFal(imageDataUrl as string);
        const glb = await generateTrellisGlb(publicUrl);
        concept = attachTrellisUrl(concept, glb.url);
        needsClientBlob = glb.needsClientBlob;
        meshProvider = "trellis2";
      } catch (error) {
        meshError =
          error instanceof Error
            ? error.message
            : "Trellis 2 failed — показан силуэт";
        console.error("Trellis generation failed", error);
      }
    } else if (requestMesh && genMode === "image" && !isTrellisEnabled()) {
      meshError = isFalConfigured()
        ? "Trellis выключен (TRELLIS_ENABLED=false)"
        : "Нет FAL_KEY — добавь в Vercel для Trellis 2";
    }

    if (requestMesh && genMode === "text" && isTripoEnabled()) {
      try {
        const glb = await generateTripoGlb(meshPrompt);
        concept = attachTripoUrl(concept, glb.url);
        needsClientBlob = glb.needsClientBlob;
        meshProvider = "tripo";
      } catch (error) {
        meshError =
          error instanceof Error ? error.message : "Tripo mesh failed — силуэт";
        console.error("Tripo generation failed", error);
      }
    } else if (requestMesh && genMode === "text" && !isTripoEnabled()) {
      if (!meshError) {
        meshError = isTripoConfigured()
          ? "Tripo выключен (TRIPO_ENABLED=false)"
          : "Нет TRIPO_API_KEY (tsk_...) в Vercel env";
      }
    }

    if (
      !concept.meshUrl &&
      requestMesh &&
      genMode === "text" &&
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
      needsClientBlob,
      tripoConfigured: isTripoConfigured(),
      tripoEnabled: isTripoEnabled(),
      falConfigured: isFalConfigured(),
      trellisEnabled: isTrellisEnabled(),
      meshyConfigured: isMeshyConfigured(),
      meshError,
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
