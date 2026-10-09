import {NextResponse} from "next/server";
import {generationApi} from "@/backend/generation-http";
import {readDesignBody} from "@/backend/design/body";
import {reserveGenerationQuota} from "@/backend/generation-quota";
import {resolveDesignBrief} from "@/backend/design/brief";
import {buildBriefModel} from "@/backend/design/brief-model";
import {text} from "@/shared/design/validation";

export async function POST(req: Request) {
  return generationApi(async userId=>{
  const body=await readDesignBody(req);
  const brief=resolveDesignBrief(text(body.prompt,"Описание",1500),body.answers);
  if(brief.kind==="clarification")return NextResponse.json(brief);
  const quota = await reserveGenerationQuota(userId);
  if (!quota.ok) return NextResponse.json({error: quota.error, code: quota.code}, {status: quota.status});
  try {return NextResponse.json(buildBriefModel(brief, crypto.randomUUID()));}
  catch (e) {
    await quota.refund();
    throw e;
  }
  });
}
