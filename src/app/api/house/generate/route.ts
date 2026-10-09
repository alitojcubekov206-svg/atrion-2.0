import {NextResponse} from "next/server";
import {designAuth,designFailure,readDesignBody} from "@/backend/design/http";
import {generateHouse} from "@/backend/design/house-generation";
import {primaryTextProvider,requestTextJSON} from "@/backend/text-ai";
import {consumeAiQuota} from "@/backend/ai-quota";

export const maxDuration=60;
export const runtime="nodejs";

export async function POST(req:Request){
  const auth=await designAuth();if(auth.response)return auth.response;
  try{
    const body=await readDesignBody(req),provider=primaryTextProvider(),deadline=Date.now()+50_000;
    let refund: (() => Promise<void>) | undefined;
    const result=await generateHouse(body.prompt,{
      configured:Boolean(provider),
      reserve:async()=>{
        const quota=await consumeAiQuota(auth.userId);
        if(quota.ok)refund=quota.refund;
        return quota;
      },refund:async()=>{await refund?.();},
      request:async(system,user,signal,jsonSchema)=>{
        const remaining=deadline-Date.now();if(!provider||remaining<1000)throw new Error("House deadline reached");
        return requestTextJSON(provider,system,user,{signal,jsonSchema,timeoutMs:Math.min(30_000,remaining),maxTokens:jsonSchema?1024:4096});
      },
    },req.signal);
    return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return designFailure(error);}
}
