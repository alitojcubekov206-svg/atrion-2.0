import { NextResponse } from "next/server";
import { requireApiUser } from "@/backend/api-auth";
import { consumeAiQuota } from "@/backend/ai-quota";
import { reserveGenerationQuota } from "@/backend/generation-quota";
import { EditNotApplied, isModelRebuild, readEditableConcept } from "@/backend/refinement";
import { refine3DConcept } from "@/backend/ai";
import {partsProcurement} from "@/shared/procurement";

export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  let body: Record<string, unknown>;
  try {
    const value = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid body");
    body = value;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : "";
  const concept = readEditableConcept(body.concept);
  const selectedPartId =
    typeof body.selectedPartId === "string" ? body.selectedPartId : null;

  if (!instruction || instruction.length < 3) {
    return NextResponse.json({ error: "Опишите правку подробнее." }, { status: 400 });
  }
  if (instruction.length > 1000) {
    return NextResponse.json({ error: "Слишком длинная команда." }, { status: 400 });
  }
  if (!concept) {
    return NextResponse.json({ error: "Передайте корректную модель для правки." }, { status: 400 });
  }
  if (selectedPartId && !concept.parts.some(part => part.id === selectedPartId)) {
    return NextResponse.json({ error: "Выбранная деталь не найдена." }, { status: 400 });
  }

  const quota = await (isModelRebuild(instruction) ? reserveGenerationQuota(userId) : consumeAiQuota(userId));
  if (!quota.ok) return NextResponse.json({ error: quota.error, code: quota.code }, { status: quota.status });

  try {
    const refined = await refine3DConcept(concept, instruction, selectedPartId);
    return NextResponse.json({ concept: refined, procurement: partsProcurement(refined.parts) });
  } catch (error) {
    await quota.refund();
    if (error instanceof EditNotApplied) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    console.error("3D refine failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json(
      { error: "AI не смог применить правку. Попробуйте короче сформулировать." },
      { status: 502 }
    );
  }
}
