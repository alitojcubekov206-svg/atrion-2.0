import { cookies } from "next/headers";
import { db } from "./db";
import { issueSessionToken, verifySessionToken } from "./session-token";

const COOKIE_NAME = "atrion_session";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set. Copy .env.example to .env");
  return secret;
}

export async function createSession(userId: string, passwordHash: string) {
  const token = await issueSessionToken(userId, passwordHash, getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token, getSecret(), async (userId) => {
    const user = await db.user.findUnique({ where: { id: userId }, select: { password: true } });
    return user?.password ?? null;
  });
}

export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return db.user.findUnique({where: {id: userId}, select: {id: true, name: true, email: true, emailVerified: true, createdAt: true}});
}
