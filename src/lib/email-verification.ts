import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const VERIFICATION_TTL_MINUTES = 10;
export const RESEND_COOLDOWN_SECONDS = 60;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return value;
}

export function createVerificationCode() {
  return randomInt(100000, 1000000).toString();
}

export function hashVerificationCode(email: string, code: string) {
  return createHash("sha256")
    .update(`${email.toLowerCase()}:${code}:${secret()}`)
    .digest("hex");
}

export function isVerificationCodeValid(email: string, code: string, storedHash: string) {
  const actual = Buffer.from(hashVerificationCode(email, code), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verificationExpiry() {
  return new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60_000);
}

export function canReturnDevVerificationCode() {
  return process.env.RESEND_DEV_RETURN_CODE === "true";
}

export async function sendVerificationEmail(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY не настроен в Vercel. Добавьте ключ Resend в Environment Variables."
    );
  }

  const from = process.env.EMAIL_FROM || "Atrion <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${code} — код подтверждения Atrion`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#17171f">
          <h1 style="margin:0 0 12px">Подтвердите email</h1>
          <p style="color:#666">Введите этот код в Atrion. Он действует ${VERIFICATION_TTL_MINUTES} минут.</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;padding:24px 0">${code}</div>
          <p style="font-size:12px;color:#888">Если вы не регистрировались в Atrion, проигнорируйте письмо.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("Resend email failed", response.status, details);
    const lower = details.toLowerCase();
    if (lower.includes("only send testing emails") || lower.includes("verify a domain")) {
      throw new Error(
        "Resend тестовый режим: письма с onboarding@resend.dev приходят только на email аккаунта Resend. Зарегистрируйся этой же почтой или подтверди свой домен в Resend."
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Неверный RESEND_API_KEY. Создай новый ключ в Resend и обнови его в Vercel.");
    }
    throw new Error("Resend отклонил письмо. Проверь EMAIL_FROM и RESEND_API_KEY в Vercel.");
  }
}
