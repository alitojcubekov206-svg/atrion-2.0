import { NextResponse } from "next/server";
import { requireApiUser } from "@/backend/api-auth";
import { consumeAiQuota, refundAiQuota } from "@/backend/ai-quota";
import { describeForImage } from "@/backend/ai";
import { generateReferenceImage, imageProviderConfigured } from "@/backend/image-ai";
import { rateLimit, rateLimitedResponse } from "@/backend/rate-limit";

export const maxDuration = 60;

/**
 * First step of the free image-to-3D path that runs in the browser.
 *
 * Returns `{ subject, image }`: the request rewritten as an English picture
 * description, and — when Cloudflare is configured — a JPEG data URL drawn from
 * it. Without an image the browser draws one itself on a free Space.
 */
export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.userId;

  const limit = rateLimit(`3d-image:${userId}`, 12, 60 * 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSec);

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
  if (!quota.ok) return NextResponse.json({ error: quota.error, code: quota.code }, { status: 429 });

  try {
    const subject = await describeForImage(prompt.trim(), safeAnswers);
    let image: string | null = null;
    if (imageProviderConfigured()) {
      try {
        const bytes = await generateReferenceImage(subject, { signal: req.signal });
        image = `data:image/jpeg;base64,${bytes.toString("base64")}`;
      } catch (error) {
        // The free daily allocation can run out; the browser has its own fallback.
        console.warn("Reference image unavailable", error instanceof Error ? error.message : error);
      }
    }
    return NextResponse.json({ subject, image }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await refundAiQuota(userId);
    console.error("Reference image request failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Не удалось подготовить изображение.", code: "IMAGE_FAILED" }, { status: 502 });
  }
}
