import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/backend/db";
import { sendPasswordResetEmail } from "@/backend/mail";
import { clientIp, rateLimit, rateLimitedResponse } from "@/backend/rate-limit";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export async function POST(req: Request) {
  const ipLimit = rateLimit(`forgot:ip:${clientIp(req)}`, 6, 15 * 60_000);
  if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec);

  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM_ADDRESS) {
    return NextResponse.json(
      { error: "Сброс пароля временно недоступен. Напишите нам в поддержку." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Введите корректный email" }, { status: 400 });
  }

  const emailLimit = rateLimit(`forgot:email:${email}`, 4, 15 * 60_000);
  if (!emailLimit.ok) return rateLimitedResponse(emailLimit.retryAfterSec);

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordResetSentAt: true },
  });
  // Identical response whether or not the account exists, so this endpoint
  // can't be used to find out which emails are registered.
  if (!user) return NextResponse.json({ ok: true });
  if (
    user.passwordResetSentAt &&
    Date.now() - user.passwordResetSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    return NextResponse.json({ ok: true });
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordResetCode: code,
      passwordResetExpires: new Date(Date.now() + CODE_TTL_MS),
      passwordResetSentAt: new Date(),
      passwordResetAttempts: 0,
    },
  });
  const sent = await sendPasswordResetEmail(email, code);
  const devCode = !sent && process.env.EMAIL_DEV_RETURN_CODE === "true" ? code : undefined;
  return NextResponse.json({ ok: true, devCode });
}
