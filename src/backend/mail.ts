const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Atrion <onboarding@resend.dev>";

  if (!apiKey) return false;

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: `${code} — код подтверждения Atrion`,
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 12px">Подтвердите email</h2>
          <p style="color:#555">Ваш код подтверждения:</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:0.15em;margin:16px 0">${code}</p>
          <p style="color:#888;font-size:13px">Код действителен 10 минут. Если вы не запрашивали его, проигнорируйте это письмо.</p>
        </div>
      `,
    }),
  });

  return res.ok;
}
