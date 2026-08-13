import { NextResponse } from "next/server";
import { getSessionUserId, getUserPlan } from "@/lib/auth";
import { refine3DConcept } from "@/lib/ai";
import type { ThreeDConcept } from "@/lib/types";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const plan = await getUserPlan(userId);
  if (plan !== "pro") {
    // Free users can refine the one concept they already generated.
    // Generation quota is enforced on /api/3d/generate.
  }

  try {
    const refined = await refine3DConcept(concept, instruction, selectedPartId);
    return NextResponse.json({ concept: refined });
  } catch (error) {
    console.error("3D refine failed", error);
    return NextResponse.json(
      { error: "AI не смог применить правку. Попробуйте короче сформулировать." },
      { status: 502 }
    );
  }
}
