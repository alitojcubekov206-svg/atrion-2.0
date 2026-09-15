import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/backend/db";
import { createSession } from "@/backend/auth";
import { clientIp, rateLimit, rateLimitedResponse } from "@/backend/rate-limit";

export async function POST(req: Request) {
  const ipLimit = rateLimit(`login:ip:${clientIp(req)}`, 20, 15 * 60_000);
  if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const rawEmail = body.email;
  const password = typeof body.password === "string" ? body.password : "";
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Введите email и пароль" }, { status: 400 });
  }

  const emailLimit = rateLimit(`login:email:${email}`, 8, 15 * 60_000);
  if (!emailLimit.ok) return rateLimitedResponse(emailLimit.retryAfterSec);

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
