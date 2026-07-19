import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE_NAME = "atrion_session";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set. Copy .env.example to .env");
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());

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
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

export function isProPlanActive(plan: string, planExpiresAt: Date | null) {
  return plan === "pro" && planExpiresAt !== null && planExpiresAt.getTime() > Date.now();
}

export async function getUserPlan(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true },
  });
  if (!user) return "free";
  if (user.plan === "pro" && !isProPlanActive(user.plan, user.planExpiresAt)) {
    const expired = await db.user.updateMany({
      where: { id: userId, plan: "pro", planExpiresAt: user.planExpiresAt },
      data: { plan: "free", planExpiresAt: null },
    });
    if (expired.count > 0) return "free";
    const current = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true },
    });
    return current && isProPlanActive(current.plan, current.planExpiresAt)
      ? "pro"
      : "free";
  }
  return user.plan;
}

export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      plan: true,
      planExpiresAt: true,
      createdAt: true,
    },
  });
  if (!user) return null;
  if (user.plan === "pro" && !isProPlanActive(user.plan, user.planExpiresAt)) {
    const expired = await db.user.updateMany({
      where: { id: user.id, plan: "pro", planExpiresAt: user.planExpiresAt },
      data: { plan: "free", planExpiresAt: null },
    });
    if (expired.count > 0) {
      return { ...user, plan: "free", planExpiresAt: null };
    }
    const current = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        planExpiresAt: true,
        createdAt: true,
      },
    });
    if (!current) return null;
    return isProPlanActive(current.plan, current.planExpiresAt)
      ? current
      : { ...current, plan: "free", planExpiresAt: null };
  }
  return user;
}
