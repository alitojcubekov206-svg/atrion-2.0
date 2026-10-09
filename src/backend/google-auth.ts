import { randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
export const GOOGLE_CHALLENGE_COOKIE = "atrion_google_challenge";
export const GOOGLE_CHALLENGE_SECONDS = 600;
export type GoogleIdentity = { subject: string; email: string; name: string };

export function googleClientId(): string | null {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  return process.env.GOOGLE_AUTH_ENABLED === "true" && id && /^[\w.-]+\.apps\.googleusercontent\.com$/.test(id) ? id : null;
}
function secretKey(secret: string) {
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export async function issueGoogleChallenge(secret: string) {
  const nonce = randomBytes(24).toString("base64url"), csrfToken = randomBytes(24).toString("base64url");
  const cookie = await new SignJWT({ nonce, csrfToken }).setProtectedHeader({ alg: "HS256" }).setIssuer("atrion").setAudience("google-sign-in").setIssuedAt().setExpirationTime(`${GOOGLE_CHALLENGE_SECONDS}s`).sign(secretKey(secret));
  return { cookie, nonce, csrfToken };
}
export async function verifyGoogleChallenge(cookie: string, csrfToken: string, secret: string) {
  const { payload } = await jwtVerify(cookie, secretKey(secret), { algorithms: ["HS256"], issuer: "atrion", audience: "google-sign-in" });
  if (typeof payload.nonce !== "string" || typeof payload.csrfToken !== "string" || csrfToken !== payload.csrfToken) throw new Error("Invalid Google challenge");
  return payload.nonce;
}

/** Verify Google signature AND audience, issuer, lifetime, nonce, and email authority. */
export async function verifyGoogleCredential(credential: string, clientId: string, nonce: string, keys: JWTVerifyGetKey = googleKeys): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(credential, keys, { algorithms: ["RS256"], audience: clientId, issuer: ["https://accounts.google.com", "accounts.google.com"], maxTokenAge: "10m", clockTolerance: 5, requiredClaims: ["exp", "iat", "sub", "email", "nonce"] });
  if (payload.nonce !== nonce || payload.email_verified !== true || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255 || typeof payload.email !== "string") throw new Error("Invalid Google identity");
  const email = payload.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid Google email");
  // Google is authoritative for Gmail and verified Workspace accounts only.
  // A third-party email can change owners after it was once verified at Google.
  if (!email.endsWith("@gmail.com") && !(typeof payload.hd === "string" && payload.hd.length > 0)) throw new Error("GOOGLE_EMAIL_NOT_AUTHORITATIVE");
  return { subject: payload.sub, email, name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0,80) : email.split("@")[0] };
}

/** Called inside a transaction: identities use Google's stable sub, never email as their key. */
export async function resolveGoogleAccount(identity: GoogleIdentity, tx: Pick<Prisma.TransactionClient, "user" | "authIdentity">) {
  const linked = await tx.authIdentity.findUnique({ where: { provider_subject: { provider: "google", subject: identity.subject } }, include: { user: true } });
  if (linked) return linked.user;
  let user = await tx.user.findUnique({ where: { email: identity.email } });
  if (user) {
    // Authoritative Google email proves ownership. Keep id, password, projects and sessions.
    if (!user.emailVerified) user = await tx.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  } else {
    // An unknown random password is not sent to the browser. Password reset remains available.
    const password = await bcrypt.hash(randomBytes(48).toString("base64url"),10);
    user = await tx.user.create({ data: { email: identity.email, name: identity.name, password, emailVerified: true } });
  }
  await tx.authIdentity.create({ data: { provider: "google", subject: identity.subject, userId: user.id } });
  return user;
}
