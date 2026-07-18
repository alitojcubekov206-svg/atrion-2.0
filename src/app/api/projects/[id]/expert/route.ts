import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { consultProjectExpert } from "@/lib/ai";
import type { Blueprint, ExpertRole } from "@/lib/types";

const ROLES: ExpertRole[] = ["architect", "programmer", "product", "security", "critic"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId || !project.blueprint) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const role = body.role as ExpertRole;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!ROLES.includes(role) || question.length < 2 || question.length > 1500) {
    return NextResponse.json({ error: "Invalid expert or question" }, { status: 400 });
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

  try {
    const reply = await consultProjectExpert(
      role,
      project.idea,
      JSON.parse(project.blueprint) as Blueprint,
      question,
      history
    );
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("expert consultation failed", error);
    return NextResponse.json({ error: "Эксперт временно недоступен" }, { status: 502 });
  }
}
