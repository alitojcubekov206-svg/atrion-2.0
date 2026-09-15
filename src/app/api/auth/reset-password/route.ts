import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/backend/db";
import { createSession } from "@/backend/auth";
import { clientIp, rateLimit, rateLimitedResponse } from "@/backend/rate-limit";

const MAX_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 8;

function invalidCode() {
  return NextResponse.json({ error: "Неверный код или он истёк" }, { status: 400 });
}

export async function POST(req: Request) {
  const ipLimit = rateLimit(`reset:ip:${clientIp(req)}`, 12, 15 * 60_000);
  if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !/^\d{6}$/.test(code)) return invalidCode();
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов` },
      { status: 400 }
    );
  }
  if (password.length > 128) {
    return NextResponse.json({ error: "Пароль слишком длинный" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordResetCode || !user.passwordResetExpires) return invalidCode();
  if (user.passwordResetAttempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Слишком много попыток. Запросите новый код." },
      { status: 429 }
    );
  }
  if (user.passwordResetExpires.getTime() < Date.now()) return invalidCode();
  if (user.passwordResetCode !== code) {
    await db.user.update({
      where: { id: user.id },
      data: { passwordResetAttempts: { increment: 1 } },
    });
    return invalidCode();
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(password, 10),
      passwordResetCode: null,
      passwordResetExpires: null,
      passwordResetAttempts: 0,
    },
  });

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
