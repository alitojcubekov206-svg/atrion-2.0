import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/backend/db";
import { destroySession, getSessionUserId } from "@/backend/auth";
import { clientIp, rateLimit, rateLimitedResponse } from "@/backend/rate-limit";

const MIN_PASSWORD_LENGTH = 8;

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function PATCH(req: Request) {
  const ipLimit = rateLimit(`account:ip:${clientIp(req)}`, 10, 15 * 60_000);
  if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec);

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Новый пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов` },
      { status: 400 }
    );
  }
  if (newPassword.length > 128) {
    return NextResponse.json({ error: "Пароль слишком длинный" }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "Новый пароль совпадает с текущим" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return NextResponse.json({ error: "Неверный текущий пароль" }, { status: 400 });
  }

  await db.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(newPassword, 10) },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ipLimit = rateLimit(`account:ip:${clientIp(req)}`, 10, 15 * 60_000);
  if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec);

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const body = await readBody(req);
  const password = typeof body?.password === "string" ? body.password : "";

  const user = await db.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 400 });
  }

  await db.user.delete({ where: { id: userId } });
  await destroySession();
  return NextResponse.json({ ok: true });
}
