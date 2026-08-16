import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { getSessionUserId } from "@/backend/auth";
import { generateStarterKit } from "@/backend/ai";
import type { Blueprint } from "@/shared/types";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId || !project.blueprint) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const kit = await generateStarterKit(
      project.idea,
      JSON.parse(project.blueprint) as Blueprint
    );
    return NextResponse.json({ kit });
  } catch (error) {
    console.error("starter kit generation failed", error);
    return NextResponse.json({ error: "Не удалось создать стартовый код" }, { status: 502 });
  }
}
