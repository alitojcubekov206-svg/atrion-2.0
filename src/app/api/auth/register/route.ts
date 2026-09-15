import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/backend/db";
import { createSession } from "@/backend/auth";
import { isEmailVerificationEnabled, issueVerificationCode } from "@/backend/verification";
import { clientIp, rateLimit, rateLimitedResponse } from "@/backend/rate-limit";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  const ipLimit = rateLimit(`register:ip:${clientIp(req)}`, 6, 60 * 60_000);
  if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Введите корректный email" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов` },
      { status: 400 }
    );
  }
  if (password.length > 128) {
    return NextResponse.json({ error: "Пароль слишком длинный" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
  }

  const verificationEnabled = isEmailVerificationEnabled();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: {
      name,
      email,
      password: passwordHash,
      emailVerified: !verificationEnabled,
    },
  });

  const devCode = verificationEnabled
    ? (await issueVerificationCode(user.id, user.email)).devCode
    : undefined;

  await createSession(user.id);
  return NextResponse.json({ ok: true, devCode });
}
