import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {designAuth} from "./design/http";
import {DesignError} from "@/shared/design/validation";

/** Auth and accounting failures must be JSON too, with a safe trace identifier. */
export async function generationApi(run:(userId:string,requestId:string)=>Promise<Response>) {
  const requestId=randomUUID();
  const finish=(response:Response)=>{response.headers.set("X-Request-Id",requestId);response.headers.set("Cache-Control","private, no-store");return response;};
  try {
    const auth=await designAuth();
    return finish(auth.response??await run(auth.userId!,requestId));
  } catch(error) {
    const code=error&&typeof error==="object"&&"code" in error?String(error.code):undefined;
    const known=error instanceof DesignError;
    const unavailable=code&&["P1001","P1002","P1008","P1017","P2024","P2021","P2022"].includes(code);
    if(!known||error.status>=500)console.error("Generation request failed",{requestId,code:known?error.code:code,kind:error instanceof Error?error.name:"UnknownError"});
    return finish(NextResponse.json({error:known?error.message:unavailable?"Хранилище временно недоступно. Повторите запрос позже; предыдущая модель сохранена.":"Не удалось создать модель. Повторите запрос или уточните описание.",code:known?error.code:unavailable?"GENERATION_STORAGE_UNAVAILABLE":"GENERATION_FAILED",requestId},{status:known?error.status:unavailable?503:500}));
  }
}
