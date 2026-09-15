import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { requireApiUser } from "@/backend/api-auth";
import { consumeAiQuota, refundAiQuota } from "@/backend/ai-quota";
import { generateBlueprint } from "@/backend/ai";
import type { InterviewState } from "@/shared/types";

export const maxDuration = 60;

function parseInterview(raw: string | null): InterviewState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InterviewState;
  } catch {
    return null;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  }

  let answers: Record<string, string> = {};
  try {
    const body = (await req.json()) as { answers?: unknown };
    if (body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)) {
      answers = Object.fromEntries(
        Object.entries(body.answers as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, (v as string).slice(0, 500)])
      );
    }
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const interview = parseInterview(project.interview);
  const qa = (interview?.questions ?? []).map((q) => ({
    question: q.question,
    answer: answers[q.id] ?? "-",
  }));

  const quota = await consumeAiQuota(userId);
  if (!quota.ok) return NextResponse.json({ error: quota.error, code: quota.code }, { status: 429 });

  try {
    const blueprint = await generateBlueprint(project.idea, qa);
    await db.project.update({
      where: { id },
      data: {
        blueprint: JSON.stringify(blueprint),
        interview: JSON.stringify({ questions: interview?.questions ?? [], answers }),
        status: "generated",
        title: blueprint.overview.name || project.title,
      },
    });
    return NextResponse.json({ blueprint });
  } catch (e) {
    await refundAiQuota(userId);
    console.error("blueprint generation failed", e);
    return NextResponse.json({ error: "AI недоступен, попробуйте ещё раз" }, { status: 502 });
  }
}
