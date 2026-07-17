import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await db.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, idea: true, status: true, updatedAt: true },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { idea } = await req.json();
  if (!idea || typeof idea !== "string" || idea.trim().length < 10) {
    return NextResponse.json({ error: "Опишите идею подробнее (минимум 10 символов)" }, { status: 400 });
  }

  const title = idea.trim().length > 60 ? idea.trim().slice(0, 57) + "..." : idea.trim();
  const project = await db.project.create({
    data: { userId, title, idea: idea.trim(), status: "draft" },
  });

  return NextResponse.json({ project });
}
