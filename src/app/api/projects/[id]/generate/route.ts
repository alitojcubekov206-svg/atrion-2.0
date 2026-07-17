import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { generateBlueprint } from "@/lib/ai";
import type { InterviewState } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { answers } = (await req.json()) as { answers: Record<string, string> };
  const interview: InterviewState | null = project.interview ? JSON.parse(project.interview) : null;

  const qa = (interview?.questions ?? []).map((q) => ({
    question: q.question,
    answer: answers?.[q.id] ?? "—",
  }));

  try {
    const blueprint = await generateBlueprint(project.idea, qa);
    await db.project.update({
      where: { id },
      data: {
        blueprint: JSON.stringify(blueprint),
        interview: JSON.stringify({ questions: interview?.questions ?? [], answers: answers ?? {} }),
        status: "generated",
        title: blueprint.overview.name || project.title,
      },
    });
    return NextResponse.json({ blueprint });
  } catch (e) {
    console.error("blueprint generation failed", e);
    return NextResponse.json({ error: "AI недоступен, попробуйте ещё раз" }, { status: 502 });
  }
}
