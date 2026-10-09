import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// Never expose the stored password hash in the JWT. A password change changes
// this keyed tag and revokes every token issued against the previous hash.
function credentialTag(userId: string, passwordHash: string, secret: string) {
  return createHmac("sha256", secret)
    .update(JSON.stringify(["atrion-session-v1", userId, passwordHash]))
    .digest("hex");
}

export async function issueSessionToken(userId: string, passwordHash: string, secret: string) {
  return new SignJWT({ purpose: "session", credential: credentialTag(userId, passwordHash, secret) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(secret));
}

export async function verifySessionToken(
  token: string,
  secret: string,
  passwordForUser: (userId: string) => Promise<string | null>
): Promise<string | null> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] }));
  } catch {
    return null;
  }
  if (!payload.sub || payload.purpose !== "session" || typeof payload.credential !== "string" ||
      !/^[a-f0-9]{64}$/.test(payload.credential)) return null;
  // Database failures propagate as service errors, not as false logouts.
  const passwordHash = await passwordForUser(payload.sub);
  if (!passwordHash) return null;
  const expected = credentialTag(payload.sub, passwordHash, secret);
  return timingSafeEqual(Buffer.from(payload.credential, "hex"), Buffer.from(expected, "hex"))
    ? payload.sub : null;
}
