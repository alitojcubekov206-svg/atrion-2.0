import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { isVerificationCodeValid } from "@/lib/email-verification";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Введите шестизначный код" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "Неверный или устаревший код" }, { status: 400 });
  if (user.emailVerified) {
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  }
  if (
    !user.verificationCode ||
    !user.verificationExpires ||
    user.verificationExpires.getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "Код истёк. Запросите новый." }, { status: 400 });
  }
  if (user.verificationAttempts >= 5) {
    return NextResponse.json(
      { error: "Слишком много попыток. Запросите новый код." },
      { status: 429 }
    );
  }

  if (!isVerificationCodeValid(email, code, user.verificationCode)) {
    await db.user.update({
      where: { id: user.id },
      data: { verificationAttempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "Неверный код" }, { status: 400 });
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationCode: null,
      verificationExpires: null,
      verificationSentAt: null,
      verificationAttempts: 0,
    },
  });
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
