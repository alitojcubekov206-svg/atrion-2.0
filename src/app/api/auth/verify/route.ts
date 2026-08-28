import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { getSessionUserId } from "@/backend/auth";
import { MAX_VERIFICATION_ATTEMPTS } from "@/backend/verification";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "Введите код" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ ok: true });
  }

  if (user.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    return NextResponse.json(
      { error: "Слишком много попыток. Запросите новый код." },
      { status: 429 }
    );
  }

  const isExpired = !user.verificationExpires || user.verificationExpires.getTime() < Date.now();
  if (isExpired) {
    return NextResponse.json({ error: "Код истёк. Запросите новый." }, { status: 400 });
  }

  if (user.verificationCode !== code) {
    await db.user.update({
      where: { id: userId },
      data: { verificationAttempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "Неверный код" }, { status: 400 });
  }

  await db.user.update({
    where: { id: userId },
    data: {
      emailVerified: true,
      verificationCode: null,
      verificationExpires: null,
      verificationAttempts: 0,
    },
  });

  return NextResponse.json({ ok: true });
}
