import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { requireApiUser } from "@/backend/api-auth";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const projects = await db.project.findMany({
    where: { userId: auth.userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, idea: true, status: true, updatedAt: true },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  if (idea.length < 10) {
    return NextResponse.json({ error: "Опишите идею подробнее (минимум 10 символов)" }, { status: 400 });
  }
  if (idea.length > 2000) {
    return NextResponse.json({ error: "Описание слишком длинное (максимум 2000 символов)" }, { status: 400 });
  }

  const title = idea.length > 60 ? idea.slice(0, 57) + "..." : idea;
  const result = await db.project.create({data: {userId, title, idea, status: "draft"}});

  return NextResponse.json({ project: result });
}
