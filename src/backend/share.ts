import { SignJWT, jwtVerify } from "jose";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return new TextEncoder().encode(value);
}

export const SHARE_TOKEN_DAYS = 30;

export async function createProjectShareToken(projectId: string) {
  return new SignJWT({ projectId, purpose: "project-share" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SHARE_TOKEN_DAYS}d`)
    .sign(secret());
}

export async function readProjectShareToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "project-share" || typeof payload.projectId !== "string") {
      return null;
    }
    return payload.projectId;
  } catch {
    return null;
  }
}
