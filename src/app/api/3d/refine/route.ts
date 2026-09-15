import { NextResponse } from "next/server";
import { requireApiUser } from "@/backend/api-auth";
import { consumeAiQuota, refundAiQuota } from "@/backend/ai-quota";
import { refine3DConcept } from "@/backend/ai";
import type { ThreeDConcept } from "@/shared/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : "";
  const concept = body.concept as ThreeDConcept | undefined;
  const selectedPartId =
    typeof body.selectedPartId === "string" ? body.selectedPartId : null;

  if (!instruction || instruction.length < 3) {
    return NextResponse.json({ error: "Опишите правку подробнее." }, { status: 400 });
  }
  if (instruction.length > 1000) {
    return NextResponse.json({ error: "Слишком длинная команда." }, { status: 400 });
  }
  if (!concept || !Array.isArray(concept.parts) || concept.parts.length === 0) {
    return NextResponse.json({ error: "Сначала создайте модель." }, { status: 400 });
  }

  const quota = await consumeAiQuota(userId);
  if (!quota.ok) return NextResponse.json({ error: quota.error, code: quota.code }, { status: 429 });

  try {
    const refined = await refine3DConcept(concept, instruction, selectedPartId);
    return NextResponse.json({ concept: refined });
  } catch (error) {
    await refundAiQuota(userId);
    console.error("3D refine failed", error);
    return NextResponse.json(
      { error: "AI не смог применить правку. Попробуйте короче сформулировать." },
      { status: 502 }
    );
  }
}
