import {NextResponse} from "next/server";
import {requireApiUser} from "@/backend/api-auth";
import {reserveGenerationQuota} from "@/backend/generation-quota";
import {resolveDesignBrief} from "@/backend/design/brief";
import {buildBriefModel} from "@/backend/design/brief-model";
import {DesignError, record, text} from "@/shared/design/validation";

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  let brief;
  try {
    const body = record(await req.json(), "Запрос");
    brief = resolveDesignBrief(text(body.prompt, "Описание", 1500), body.answers);
    if (brief.kind === "clarification") return NextResponse.json(brief);
  } catch (e) {return NextResponse.json({error: e instanceof DesignError ? e.message : "Укажите описание до 1500 символов"}, {status: 400});}
  const quota = await reserveGenerationQuota(auth.userId);
  if (!quota.ok) return NextResponse.json({error: quota.error, code: quota.code}, {status: quota.status});
  try {return NextResponse.json(buildBriefModel(brief, crypto.randomUUID()));}
  catch (e) {
    await quota.refund();
    return NextResponse.json({error: e instanceof DesignError ? e.message : "Не удалось построить модель", code: e instanceof DesignError ? e.code : "DESIGN_FAILED"}, {status: e instanceof DesignError ? e.status : 500});
  }
}
