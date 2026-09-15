import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { getSessionUserId } from "@/backend/auth";
import { cooldownRemainingMs, issueVerificationCode } from "@/backend/verification";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ ok: true });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // No body means a plain resend to the current email — that's fine.
  }
  const requestedEmail =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

  let targetEmail = user.email;
  if (requestedEmail && requestedEmail !== user.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
      return NextResponse.json({ error: "Введите корректный email" }, { status: 400 });
    }
    const taken = await db.user.findUnique({ where: { email: requestedEmail } });
    if (taken) {
      return NextResponse.json({ error: "Этот email уже используется" }, { status: 409 });
    }
    await db.user.update({ where: { id: userId }, data: { email: requestedEmail } });
    targetEmail = requestedEmail;
  } else {
    const remaining = cooldownRemainingMs(user.verificationSentAt);
    if (remaining > 0) {
      return NextResponse.json(
        { error: `Подождите ${Math.ceil(remaining / 1000)} сек. перед повторной отправкой` },
        { status: 429 }
      );
    }
  }

  const { devCode } = await issueVerificationCode(user.id, targetEmail);
  return NextResponse.json({ ok: true, email: targetEmail, devCode });
}
