import { NextResponse } from "next/server";
import { requireApiUser } from "../api-auth";
import { rateLimit, rateLimitedResponse } from "../rate-limit";
import { DesignError } from "./validation";

export { readDesignBody } from "./body";

type DesignAuth = {userId:string;response?:undefined} | {userId?:undefined;response:NextResponse};

export async function designAuth(): Promise<DesignAuth> {
  const auth = await requireApiUser();
  if (auth.response) return auth;
  const limit = rateLimit(`design:user:${auth.userId}`,60,60_000);
  if (!limit.ok) return {response:rateLimitedResponse(limit.retryAfterSec)};
  return {userId:auth.userId};
}

export function designFailure(error: unknown) {
  if (error instanceof DesignError) return NextResponse.json({error:error.message,code:error.code},{status:error.status});
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  if (code === "P2021" || code === "P2022") return NextResponse.json({
    error:"Схема хранилища дизайн-документов ещё не применена",code:"DATABASE_SCHEMA_NOT_READY"
  },{status:503});
  console.error("Design API failed",{code});
  return NextResponse.json({error:"Сервис документов временно недоступен",code:"DESIGN_SERVICE_ERROR"},{status:500});
}
