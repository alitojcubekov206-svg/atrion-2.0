import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { chatAboutConcept } from "@/lib/ai";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let message: unknown;
  let concept: unknown;
  let prompt: unknown;
  try {
    const body = await req.json();
    message = body?.message;
    concept = body?.concept ?? null;
    prompt = body?.prompt ?? "";
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (typeof message !== "string" || message.trim().length < 1) {
    return NextResponse.json({ error: "Пустое сообщение." }, { status: 400 });
  }

  try {
    const reply = await chatAboutConcept({
      message: message.trim().slice(0, 800),
      prompt: typeof prompt === "string" ? prompt.slice(0, 500) : "",
      concept:
        concept && typeof concept === "object"
          ? (concept as {
              name?: string;
              description?: string;
              parts?: { name: string }[];
              dimensions?: { width: number; height: number; depth: number };
            })
          : null,
    });
    return NextResponse.json(reply);
  } catch (error) {
    console.error("3D voice chat failed", error);
    return NextResponse.json(
      { error: "Не удалось ответить голосом. Попробуй ещё раз." },
      { status: 502 }
    );
  }
}
