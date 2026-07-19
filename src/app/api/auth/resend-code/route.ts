import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createVerificationCode,
  hashVerificationCode,
  RESEND_COOLDOWN_SECONDS,
  sendVerificationEmail,
  verificationExpiry,
} from "@/lib/email-verification";

export async function POST(req: Request) {
  let email = "";
  try {
    const body = await req.json();
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (!email) return NextResponse.json({ error: "Введите email" }, { status: 400 });

  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) {
    return NextResponse.json({ ok: true });
  }

  if (
    user.verificationSentAt &&
    Date.now() - user.verificationSentAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000
  ) {
    return NextResponse.json(
      { error: `Повторная отправка доступна через ${RESEND_COOLDOWN_SECONDS} секунд` },
      { status: 429 }
    );
  }

  const code = createVerificationCode();
  await db.user.update({
    where: { id: user.id },
    data: {
      verificationCode: hashVerificationCode(email, code),
      verificationExpires: verificationExpiry(),
      verificationSentAt: new Date(),
      verificationAttempts: 0,
    },
  });

  try {
    await sendVerificationEmail(email, code);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("verification email resend failed", error);
    return NextResponse.json({ error: "Не удалось отправить письмо" }, { status: 502 });
  }
}
