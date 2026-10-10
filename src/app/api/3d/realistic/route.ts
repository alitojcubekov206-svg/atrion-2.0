import { NextResponse } from "next/server";
import { requireApiUser } from "@/backend/api-auth";
import { consumeAiQuota } from "@/backend/ai-quota";
import { describeForImage } from "@/backend/ai";
import { rateLimit, rateLimitedResponse } from "@/backend/rate-limit";
import { detectCategory } from "@/backend/procedural-3d";
import { imageSubjectFrom } from "@/backend/realistic-subject";

export const maxDuration = 30;

/** The Modal app from infra/modal_realistic.py, without a trailing slash. */
function modalEndpoint(): { url: string; secret: string } | null {
  const url = process.env.MODAL_REALISTIC_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.MODAL_REALISTIC_SECRET?.trim();
  if (!url || !secret || !/^https:\/\/[a-z0-9.-]+\.modal\.run$/i.test(url)) return null;
  return { url, secret };
}

/**
 * Start a realistic 3D job on Atrion's Modal app. Returns the URL the browser
 * polls for the result: the job id is unguessable and the secret that starts
 * jobs (and spends the Modal credit) never leaves the server.
 */
export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  const endpoint = modalEndpoint();
  if (!endpoint) {
    return NextResponse.json(
      { error: "Реалистичный режим пока не настроен.", code: "REALISTIC_UNAVAILABLE" },
      { status: 503 }
    );
  }

  // Each job costs GPU time from the shared monthly credit.
  const burst = rateLimit(`3d-realistic:${userId}`, 6, 60 * 60_000);
  if (!burst.ok) return rateLimitedResponse(burst.retryAfterSec);

  let prompt: unknown;
  let answers: unknown;
  try {
    const body = await req.json();
    prompt = body?.prompt;
    answers = body?.answers;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  if (typeof prompt !== "string" || prompt.trim().length < 3 || prompt.length > 1500) {
    return NextResponse.json({ error: "Опишите объект — от 3 до 1500 символов." }, { status: 400 });
  }
  const safeAnswers = Array.isArray(answers)
    ? answers
        .filter((item) => item && typeof item.question === "string" && typeof item.answer === "string")
        .slice(0, 10)
    : [];

  const quota = await consumeAiQuota(userId);
  if (!quota.ok) return NextResponse.json({ error: quota.error, code: quota.code }, { status: quota.status });

  // The picture model reads English only, and the 3D model follows the picture.
  const subject = imageSubjectFrom(prompt.trim(), await describeForImage(prompt.trim(), safeAnswers));
  if (!subject) {
    await quota.refund();
    return NextResponse.json(
      { error: "Не получилось понять объект для реалистичного режима. Назовите его проще, например «красное кресло».", code: "REALISTIC_SUBJECT_UNKNOWN" },
      { status: 422 }
    );
  }

  try {
    // People get a straight A-pose front reference and a projected texture. That
    // wording ("arms away from the body, detailed face") turned a cat into a man,
    // so animals take the object view.
    const kind = detectCategory(prompt);
    const mode = kind === "character" ? "figure" : "object";
    const res = await fetch(`${endpoint.url}/jobs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${endpoint.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: subject, seed: Math.floor(Math.random() * 2_000_000_000), mode }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Modal responded ${res.status}`);
    const data = (await res.json()) as { id?: unknown };
    if (typeof data.id !== "string" || !/^fc-[A-Za-z0-9]+$/.test(data.id)) {
      throw new Error("Modal returned no job id");
    }
    return NextResponse.json({ pollUrl: `${endpoint.url}/jobs/${data.id}` });
  } catch (error) {
    await quota.refund();
    console.error("Realistic job failed to start", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json(
      { error: "Не удалось запустить реалистичную модель. Попробуйте позже.", code: "REALISTIC_FAILED" },
      { status: 502 }
    );
  }
}
