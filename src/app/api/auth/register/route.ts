import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  canReturnDevVerificationCode,
  createVerificationCode,
  hashVerificationCode,
  RESEND_COOLDOWN_SECONDS,
  sendVerificationEmail,
  verificationExpiry,
} from "@/lib/email-verification";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Введите корректный email" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Пароль должен быть не короче 6 символов" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.emailVerified) {
    return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
  }
  if (
    existing?.verificationSentAt &&
    Date.now() - existing.verificationSentAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000
  ) {
    return NextResponse.json(
      { error: `Новый код можно отправить через ${RESEND_COOLDOWN_SECONDS} секунд` },
      { status: 429 }
    );
  }

  const code = createVerificationCode();
  const verificationCode = hashVerificationCode(email, code);
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        name,
        password: passwordHash,
        verificationCode,
        verificationExpires: verificationExpiry(),
        verificationSentAt: now,
        verificationAttempts: 0,
      },
    });
  } else {
    await db.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        emailVerified: false,
        verificationCode,
        verificationExpires: verificationExpiry(),
        verificationSentAt: now,
      },
    });
  }

  try {
    await sendVerificationEmail(email, code);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Не удалось отправить письмо. Проверьте настройки почты и попробуйте ещё раз.";
    console.error("verification email failed", message);
    if (canReturnDevVerificationCode()) {
      return NextResponse.json({
        ok: true,
        requiresVerification: true,
        email,
        devCode: code,
        warning: message,
      });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    requiresVerification: true,
    email,
    ...(canReturnDevVerificationCode() ? { devCode: code } : {}),
  });
}
