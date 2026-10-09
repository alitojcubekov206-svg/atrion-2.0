import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/backend/db";
import { createSession } from "@/backend/auth";
import { clientIp, rateLimit, rateLimitedResponse } from "@/backend/rate-limit";
import { googleClientId, GOOGLE_CHALLENGE_COOKIE, GOOGLE_CHALLENGE_SECONDS, issueGoogleChallenge, verifyGoogleChallenge, verifyGoogleCredential, resolveGoogleAccount } from "@/backend/google-auth";

export const runtime = "nodejs";
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/api/auth/google" };

export async function GET() {
  const clientId = googleClientId();
  if (!clientId) return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  const { cookie, nonce, csrfToken } = await issueGoogleChallenge(process.env.AUTH_SECRET ?? "");
  (await cookies()).set(GOOGLE_CHALLENGE_COOKIE, cookie, { ...cookieOptions, maxAge: GOOGLE_CHALLENGE_SECONDS });
  return NextResponse.json({ configured: true, clientId, nonce, csrfToken }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const clientId = googleClientId();
  if (!clientId) return NextResponse.json({ error: "Вход через Google пока не настроен" }, { status: 503 });
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
  const limit = rateLimit(`google-auth:${clientIp(req)}`,20,15*60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSec);
  // Enforce the bound on streamed bodies too, without relying on Content-Length.
  let raw = "", bytes = 0;
  if (!req.body) return NextResponse.json({ error: "Требуется JSON" }, { status: 400 });
  const reader=req.body.getReader(), decoder=new TextDecoder("utf-8",{fatal:true});
  try {
    while(true) { const chunk=await reader.read(); if(chunk.done) break; bytes+=chunk.value.byteLength; if(bytes>16_384) { await reader.cancel(); return NextResponse.json({error:"Запрос слишком большой"},{status:413}); } raw+=decoder.decode(chunk.value,{stream:true}); }
    raw+=decoder.decode();
  } catch { return NextResponse.json({error:"Некорректный запрос"},{status:400}); }
  finally { reader.releaseLock(); }
  let body: { credential?: unknown; csrfToken?: unknown };
  try { body=JSON.parse(raw); if(!body||typeof body!=="object") throw new Error(); } catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }
  if(typeof body.credential!=="string"||typeof body.csrfToken!=="string"||body.csrfToken.length>256) return NextResponse.json({error:"Некорректные данные входа"},{status:400});
  const jar=await cookies(), challenge=jar.get(GOOGLE_CHALLENGE_COOKIE)?.value;
  jar.set(GOOGLE_CHALLENGE_COOKIE,"",{...cookieOptions,maxAge:0});
  let identity;
  try {
    if(!challenge) throw new Error();
    const nonce=await verifyGoogleChallenge(challenge,body.csrfToken,process.env.AUTH_SECRET??"");
    identity=await verifyGoogleCredential(body.credential,clientId,nonce);
  } catch(error) {
    const externalEmail=error instanceof Error&&error.message==="GOOGLE_EMAIL_NOT_AUTHORITATIVE";
    return NextResponse.json({ error: externalEmail ? "Используйте Gmail или Google Workspace. Для другого email доступен вход с паролем." : "Не удалось подтвердить вход через Google. Повторите попытку." },{status:401});
  }
  try {
    let user;
    try { user=await db.$transaction(tx=>resolveGoogleAccount(identity,tx)); }
    catch(error) {
      // Concurrent first sign-in can win the unique sub constraint. Only retry that same sub.
      if(!(error&&typeof error==="object"&&"code" in error&&error.code==="P2002")) throw error;
      const linked=await db.authIdentity.findUnique({where:{provider_subject:{provider:"google",subject:identity.subject}},include:{user:true}});
      if(!linked) throw error; user=linked.user;
    }
    await createSession(user.id,user.password);
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  } catch {
    // No token, email or database diagnostics in logs or the public response.
    return NextResponse.json({error:"Вход через Google временно недоступен. Можно войти по email."},{status:503});
  }
}
