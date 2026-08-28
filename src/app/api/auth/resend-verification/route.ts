import { NextResponse } from "next/server";
import { db } from "@/backend/db";
import { getSessionUserId } from "@/backend/auth";
import { cooldownRemainingMs, issueVerificationCode } from "@/backend/verification";

export async function POST() {
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

  const remaining = cooldownRemainingMs(user.verificationSentAt);
  if (remaining > 0) {
    return NextResponse.json(
      { error: `Подождите ${Math.ceil(remaining / 1000)} сек. перед повторной отправкой` },
      { status: 429 }
    );
  }

  const { devCode } = await issueVerificationCode(user.id, user.email);
  return NextResponse.json({ ok: true, devCode });
}
