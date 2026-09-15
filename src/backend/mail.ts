const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_FROM_ADDRESS;
  const senderName = process.env.EMAIL_FROM_NAME || "Atrion";

  if (!apiKey || !senderEmail) return false;

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  return res.ok;
}

function codeTemplate(title: string, intro: string, code: string, note: string) {
  return `
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 12px">${title}</h2>
      <p style="color:#555">${intro}</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:0.15em;margin:16px 0">${code}</p>
      <p style="color:#888;font-size:13px">${note}</p>
    </div>
  `;
}

export function sendVerificationEmail(email: string, code: string) {
  return sendEmail(
    email,
    `${code} - код подтверждения Atrion`,
    codeTemplate(
      "Подтвердите email",
      "Ваш код подтверждения:",
      code,
      "Код действителен 10 минут. Если вы не запрашивали его, проигнорируйте это письмо."
    )
  );
}

export function sendPasswordResetEmail(email: string, code: string) {
  return sendEmail(
    email,
    `${code} - сброс пароля Atrion`,
    codeTemplate(
      "Сброс пароля",
      "Код для смены пароля:",
      code,
      "Код действителен 10 минут. Если вы не запрашивали сброс, просто проигнорируйте это письмо - пароль не изменится."
    )
  );
}
