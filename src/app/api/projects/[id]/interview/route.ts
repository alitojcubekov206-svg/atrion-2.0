import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { generateInterview } from "@/lib/ai";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const questions = await generateInterview(project.idea);
    await db.project.update({
      where: { id },
      data: { interview: JSON.stringify({ questions, answers: {} }), status: "interview" },
    });
    return NextResponse.json({ questions });
  } catch (e) {
    console.error("interview generation failed", e);
    return NextResponse.json({ error: "AI недоступен, попробуйте ещё раз" }, { status: 502 });
  }
}
