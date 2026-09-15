import { NextResponse } from "next/server";
import { db } from "./db";
import { getSessionUserId } from "./auth";
import { isEmailVerificationEnabled } from "./verification";

type ApiUser =
  | { userId: string; response?: undefined }
  | { userId?: undefined; response: NextResponse };

function unauthorized() {
  return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
}

export async function requireApiUser(): Promise<ApiUser> {
  const userId = await getSessionUserId();
  if (!userId) return { response: unauthorized() };

  if (isEmailVerificationEnabled()) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });
    if (!user) return { response: unauthorized() };
    if (!user.emailVerified) {
      return {
        response: NextResponse.json(
          { error: "Подтвердите email, чтобы продолжить", code: "EMAIL_NOT_VERIFIED" },
          { status: 403 }
        ),
      };
    }
  }
  return { userId };
}
