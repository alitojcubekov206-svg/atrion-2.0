import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { requireApiUser } from "@/backend/api-auth";
import { consumeAiQuota, refundAiQuota } from "@/backend/ai-quota";
import { consultProjectExpert } from "@/backend/ai";
import type { Blueprint, ExpertRole } from "@/shared/types";

export const maxDuration = 60;

const ROLES: ExpertRole[] = ["architect", "programmer", "product", "security", "critic"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId || !project.blueprint) {
    return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const role = body.role as ExpertRole;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!ROLES.includes(role) || question.length < 2 || question.length > 1500) {
    return NextResponse.json({ error: "Некорректный эксперт или вопрос" }, { status: 400 });
  }

  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (item): item is { role: "user" | "assistant"; content: string } =>
            item &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string"
        )
        .slice(-6)
    : [];

  let blueprint: Blueprint;
  try {
    blueprint = JSON.parse(project.blueprint) as Blueprint;
  } catch {
    return NextResponse.json({ error: "План проекта повреждён. Сгенерируйте заново." }, { status: 409 });
  }

  const quota = await consumeAiQuota(userId);
  if (!quota.ok) return NextResponse.json({ error: quota.error, code: quota.code }, { status: 429 });

  try {
    const reply = await consultProjectExpert(role, project.idea, blueprint, question, history);
    return NextResponse.json({ reply });
  } catch (error) {
    await refundAiQuota(userId);
    console.error("expert consultation failed", error);
    return NextResponse.json({ error: "Эксперт временно недоступен" }, { status: 502 });
  }
}
