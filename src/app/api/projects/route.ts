import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { isProPlanActive } from "@/backend/auth";
import { requireApiUser } from "@/backend/api-auth";
import { canCreateProject, FREE_PROJECT_LIMIT } from "@/backend/plans";

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
      data: { userId, title, idea, status: "draft" },
    });
  });
  if (!result) {
    return NextResponse.json(
      {
        error: `Бесплатный лимит - ${FREE_PROJECT_LIMIT} проектов. Перейдите на Pro для безлимита.`,
        code: "LIMIT_REACHED",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ project: result });
}
