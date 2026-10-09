import {NextResponse} from "next/server";
import {generationApi} from "@/backend/generation-http";
import {readDesignBody} from "@/backend/design/body";
import {reserveGenerationQuota} from "@/backend/generation-quota";
import {composeWithLocalAI, localDesignEndpoint, parseCompositionRequest} from "@/backend/design/local-ai";

export const runtime = "nodejs";
export async function GET() {
  return generationApi(async()=>NextResponse.json({localAI: Boolean(localDesignEndpoint())}));
}
export async function POST(req: Request) {
  return generationApi(async userId=>{
  const body=await readDesignBody(req);parseCompositionRequest(body);
  const quota = await reserveGenerationQuota(userId);
  if (!quota.ok) return NextResponse.json({error: quota.error, code: quota.code}, {status: quota.status});
  try {
    const result = await composeWithLocalAI(body, {signal: req.signal});
    if (result.kind === "clarification") await quota.refund();
    return NextResponse.json(result);
  } catch (e) {
    await quota.refund();
    throw e;
  }
  });
}
