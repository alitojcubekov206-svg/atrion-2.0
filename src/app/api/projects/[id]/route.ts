import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

async function findOwnProject(id: string) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) return null;
  return project;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await findOwnProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await findOwnProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.project.delete({ where: { id: project.id } });
  return NextResponse.json({ ok: true });
}
