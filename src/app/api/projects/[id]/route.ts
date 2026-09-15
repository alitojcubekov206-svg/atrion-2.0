import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { requireApiUser } from "@/backend/api-auth";

type Params = { params: Promise<{ id: string }> };

async function findOwnProject(id: string) {
  const auth = await requireApiUser();
  if (auth.response) return { response: auth.response };
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== auth.userId) {
    return { response: NextResponse.json({ error: "Проект не найден" }, { status: 404 }) };
  }
  return { project };
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const found = await findOwnProject(id);
  if (found.response) return found.response;
  return NextResponse.json({ project: found.project });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const found = await findOwnProject(id);
  if (found.response) return found.response;
  await db.project.delete({ where: { id: found.project.id } });
  return NextResponse.json({ ok: true });
}
