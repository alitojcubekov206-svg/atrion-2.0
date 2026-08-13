import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUserId, isProPlanActive } from "@/lib/auth";
import { canCreateProject, FREE_PROJECT_LIMIT } from "@/lib/plans";

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
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true },
    });
    const plan =
      user && isProPlanActive(user.plan, user.planExpiresAt) ? "pro" : "free";
    const count = await tx.project.count({ where: { userId } });
    if (!canCreateProject(plan, count)) return null;
    return tx.project.create({
      data: { userId, title, idea: idea.trim(), status: "draft" },
    });
  });
  if (!result) {
    return NextResponse.json(
      {
        error: `Бесплатный лимит — ${FREE_PROJECT_LIMIT} проектов. Перейдите на Pro для безлимита.`,
        code: "LIMIT_REACHED",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ project: result });
}
