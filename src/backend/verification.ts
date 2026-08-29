import crypto from "crypto";
import { db } from "./db";
import { sendVerificationEmail } from "./mail";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_VERIFICATION_ATTEMPTS = 5;

// Off until a verified sending domain is set up in Resend (test mode can only email the account owner).
export function isEmailVerificationEnabled() {
  return process.env.EMAIL_VERIFICATION_ENABLED === "true";
}

function generateCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function issueVerificationCode(userId: string, email: string) {
  const code = generateCode();
  await db.user.update({
    where: { id: userId },
    data: {
      verificationCode: code,
      verificationExpires: new Date(Date.now() + CODE_TTL_MS),
      verificationSentAt: new Date(),
      verificationAttempts: 0,
    },
  });

  const sent = await sendVerificationEmail(email, code);
  const devReturnCode = process.env.RESEND_DEV_RETURN_CODE === "true";

  return { sent, devCode: !sent && devReturnCode ? code : undefined };
}

export function cooldownRemainingMs(verificationSentAt: Date | null): number {
  if (!verificationSentAt) return 0;
  const elapsed = Date.now() - verificationSentAt.getTime();
  return Math.max(0, RESEND_COOLDOWN_MS - elapsed);
}
