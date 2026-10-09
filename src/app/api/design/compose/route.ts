import {NextResponse} from "next/server";
import {requireApiUser} from "@/backend/api-auth";
import {reserveGenerationQuota} from "@/backend/generation-quota";
import {composeWithLocalAI, localDesignEndpoint, parseCompositionRequest} from "@/backend/design/local-ai";
import {DesignError} from "@/shared/design/validation";

export const runtime = "nodejs";
export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  return NextResponse.json({localAI: Boolean(localDesignEndpoint())});
}
export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 100_000) return NextResponse.json({error: "Запрос слишком большой"}, {status: 413});
    body = JSON.parse(raw); parseCompositionRequest(body);
  } catch (e) {return NextResponse.json({error: e instanceof DesignError ? e.message : "Некорректный запрос"}, {status: 400});}
  const quota = await reserveGenerationQuota(auth.userId);
  if (!quota.ok) return NextResponse.json({error: quota.error, code: quota.code}, {status: quota.status});
  try {
    const result = await composeWithLocalAI(body, {signal: req.signal});
    if (result.kind === "clarification") await quota.refund();
    return NextResponse.json(result);
  } catch (e) {
    await quota.refund();
    return NextResponse.json({error: e instanceof DesignError ? e.message : "Не удалось составить сцену", code: e instanceof DesignError ? e.code : "DESIGN_FAILED"}, {status: e instanceof DesignError ? e.status : 500});
  }
}
