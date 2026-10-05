import OpenAI from "openai";

export type TextProvider={apiKey:string;baseURL?:string;model:string;kind:"compatible"|"cloudflare";name:"primary"|"fallback"};
type Env=Record<string,string|undefined>;
export const CLOUDFLARE_TEXT_MODEL="@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Keep existing text credentials first; the image token is used only at Cloudflare's own endpoint. */
export function primaryTextProvider(env:Env=process.env):TextProvider|null {
  const choice=env.AI_TEXT_PROVIDER?.trim()||"auto";
  if(choice==="disabled")return null;
  if(!["auto","cloudflare","compatible"].includes(choice))throw new Error("Unknown text AI provider");
  const key=env.OPENAI_API_KEY?.trim()||env.GROQ_API_KEY?.trim()||env.AI_API_KEY?.trim();
  if(choice!=="cloudflare"&&key){
    const groq=!env.OPENAI_API_KEY?.trim()&&Boolean(env.GROQ_API_KEY?.trim());
    return {apiKey:key,baseURL:env.OPENAI_BASE_URL?.trim()||(groq?"https://api.groq.com/openai/v1":undefined),
      model:env.OPENAI_MODEL?.trim()||(groq?"llama-3.3-70b-versatile":"gpt-4o"),kind:"compatible",name:"primary"};
  }
  if(choice==="compatible")return null;
  const apiKey=env.CLOUDFLARE_API_TOKEN?.trim(),account=env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if(!apiKey||!account)return null;
  if(!/^[a-f0-9]{32}$/i.test(account))throw new Error("Invalid Cloudflare account configuration");
  return {apiKey,baseURL:`https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`,
    model:env.CLOUDFLARE_TEXT_MODEL?.trim()||CLOUDFLARE_TEXT_MODEL,kind:"cloudflare",name:"primary"};
}

export function fallbackTextProvider(env:Env=process.env):TextProvider|null {
  const apiKey=env.AI_FALLBACK_API_KEY?.trim();
  return apiKey?{apiKey,baseURL:env.AI_FALLBACK_BASE_URL?.trim()||undefined,model:env.AI_FALLBACK_MODEL?.trim()||"gpt-4o-mini",kind:"compatible",name:"fallback"}:null;
}

export type TextRequestOptions={timeoutMs?:number;maxTokens?:number;signal?:AbortSignal;transport?:typeof fetch;jsonSchema?:Record<string,unknown>};
export async function requestTextJSON<T>(provider:TextProvider,system:string,user:string,options:TextRequestOptions={}):Promise<T>{
  const client=new OpenAI({apiKey:provider.apiKey,baseURL:provider.baseURL,maxRetries:0,timeout:options.timeoutMs??45_000,fetch:options.transport});
  // Workers AI takes the JSON Schema directly; OpenAI-compatible providers use a named wrapper.
  const responseFormat = (options.jsonSchema?{type:"json_schema",json_schema:provider.kind==="cloudflare"?options.jsonSchema:{name:"atrion_response",schema:options.jsonSchema,strict:true}}:{type:"json_object"}) as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming["response_format"];
  const res=await client.chat.completions.create({model:provider.model,response_format:responseFormat,
    max_tokens:options.maxTokens??8192,messages:[{role:"system",content:system},{role:"user",content:user}]},{signal:options.signal});
  const choice=res.choices[0];
  if(!choice||choice.finish_reason==="length"||choice.finish_reason==="content_filter")throw new Error("AI response is incomplete");
  const content=choice.message?.content;
  if(typeof content!=="string"||!content.trim())throw new SyntaxError("AI response is empty");
  return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"")) as T;
}
