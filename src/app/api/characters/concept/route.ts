import { NextResponse } from "next/server";
import { requireApiUser } from "@/backend/api-auth";
import { consumeAiQuota, refundAiQuota } from "@/backend/ai-quota";
import { readDesignBody } from "@/backend/design/body";
import { DesignError } from "@/backend/design/validation";
import { createCharacterConcept, imageConfiguration, openAIImageGenerator } from "@/backend/characters/concept";

// Image generation can take two minutes. On Vercel this route requires Fluid
// compute (or another environment allowing at least 180 seconds).
export const maxDuration = 180;
export const runtime = "nodejs";
const headers = {"Cache-Control":"private, no-store"};

function failure(error: unknown) {
  if (error instanceof DesignError) return NextResponse.json({error:error.message,code:error.code},{status:error.status,headers});
  return NextResponse.json({error:"Сервис генерации временно недоступен",code:"CHARACTER_SERVICE_ERROR"},{status:500,headers});
}

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  try {
    const config = imageConfiguration();
    return NextResponse.json({configured:Boolean(config.apiKey),stage:"concept",rigReady:false},{headers});
  } catch(error) { return failure(error); }
}

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  try {
    const body = await readDesignBody(req), config = imageConfiguration();
    const result = await createCharacterConcept(body.prompt, {
      configured: Boolean(config.apiKey),
      reserve: () => consumeAiQuota(auth.userId),
      refund: () => refundAiQuota(auth.userId),
      generate: openAIImageGenerator(config),
    }, req.signal);
    return NextResponse.json(result,{headers});
  } catch(error) { return failure(error); }
}
