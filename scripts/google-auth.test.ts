import "next/dist/server/node-environment-baseline";
import test, {before, mock} from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { googleClientId, issueGoogleChallenge, verifyGoogleChallenge, verifyGoogleCredential, resolveGoogleAccount } from "../src/backend/google-auth";
import {GET,POST} from "../src/app/api/auth/google/route";
import {db} from "../src/backend/db";
import {workAsyncStorage} from "next/dist/server/app-render/work-async-storage.external";
import {workUnitAsyncStorage} from "next/dist/server/app-render/work-unit-async-storage.external";
import {ResponseCookies} from "next/dist/server/web/spec-extension/cookies";
import {verifySessionToken} from "../src/backend/session-token";

const client="fixture.apps.googleusercontent.com",nonce="fixture-nonce",secret=randomBytes(48).toString("hex");
let privateKey: CryptoKey, publicKey: CryptoKey, jwks: ReturnType<typeof createLocalJWKSet>;
before(async()=>{const keys=await generateKeyPair("RS256");privateKey=keys.privateKey;publicKey=keys.publicKey;jwks=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:"test"}]});});
async function credential(claims:Record<string,unknown>={}) {
  return new SignJWT({iss:"https://accounts.google.com",aud:client,sub:"google-stable-sub",email:"person@gmail.com",email_verified:true,nonce,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+120,name:"Person",...claims}).setProtectedHeader({alg:"RS256",kid:"test"}).sign(privateKey);
}
test("Google credentials require the correct signed identity, recipient, issuer, lifetime and nonce",async()=>{
  assert.deepEqual(await verifyGoogleCredential(await credential(),client,nonce,jwks),{subject:"google-stable-sub",email:"person@gmail.com",name:"Person"});
  for(const claims of [{aud:"another-client"},{iss:"https://evil.invalid"},{exp:0},{iat:Math.floor(Date.now()/1000)+3600},{iat:0},{nonce:"other"},{email_verified:false},{sub:""},{email:"broken"},{email:"person@example.org"},{email:"person@example.org",hd:123}]) await assert.rejects(()=>credential(claims).then(token=>verifyGoogleCredential(token,client,nonce,jwks)));
  const token=await credential(),payload=token.split(".");payload[1]=Buffer.from(JSON.stringify({sub:"forged",email:"victim@gmail.com",email_verified:true,nonce})).toString("base64url");
  await assert.rejects(()=>verifyGoogleCredential(payload.join("."),client,nonce,jwks));
  assert.equal((await verifyGoogleCredential(await credential({email:"staff@company.example",hd:"company.example"}),client,nonce,jwks)).email,"staff@company.example");
});
test("Google challenge cannot be forged, swapped, or reused with a different CSRF token",async()=>{
  const challenge=await issueGoogleChallenge(secret);
  assert.equal(await verifyGoogleChallenge(challenge.cookie,challenge.csrfToken,secret),challenge.nonce);
  await assert.rejects(()=>verifyGoogleChallenge(challenge.cookie,"forged",secret));
  await assert.rejects(()=>verifyGoogleChallenge(challenge.cookie,challenge.csrfToken,"another-secret"));
  const expired=await new SignJWT({nonce,csrfToken:"old"}).setProtectedHeader({alg:"HS256"}).setIssuer("atrion").setAudience("google-sign-in").setExpirationTime(0).sign(new TextEncoder().encode(secret));
  await assert.rejects(()=>verifyGoogleChallenge(expired,"old",secret));
  assert.notEqual((await issueGoogleChallenge(secret)).nonce,challenge.nonce);
});
test("OAuth activation is explicit; the unconfigured API neither logs in nor accesses accounts",async()=>{
  const savedId=process.env.GOOGLE_CLIENT_ID,savedEnabled=process.env.GOOGLE_AUTH_ENABLED;
  try {
    delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_AUTH_ENABLED;
    assert.equal(googleClientId(),null);assert.deepEqual(await (await GET()).json(),{configured:false});
    assert.equal((await POST(new Request("https://atrion.example/api/auth/google",{method:"POST",body:"{}"}))).status,503);
    process.env.GOOGLE_CLIENT_ID=client;assert.equal(googleClientId(),null);
    process.env.GOOGLE_AUTH_ENABLED="true";assert.equal(googleClientId(),client);
    assert.equal((await POST(new Request("https://atrion.example/api/auth/google",{method:"POST",headers:{origin:"https://evil.invalid"},body:"{}"}))).status,403);
    assert.equal((await POST(new Request("https://atrion.example/api/auth/google",{method:"POST",headers:{origin:"https://atrion.example"},body:"a".repeat(17000)}))).status,413);
  } finally {
    if(savedId===undefined)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=savedId;
    if(savedEnabled===undefined)delete process.env.GOOGLE_AUTH_ENABLED;else process.env.GOOGLE_AUTH_ENABLED=savedEnabled;
  }
});
test("Google account resolution uses stable sub and retains an existing user's password and ownership",async()=>{
  let emailLookup=0,created=0;const existing={id:"owner",email:"person@gmail.com",name:"Existing",password:"existing-hash",emailVerified:false};
  const linked:{provider:string;subject:string;userId:string}[]=[];
  const tx={authIdentity:{findUnique:async({where}:{where:{provider_subject:{subject:string}}})=>linked.some(i=>i.subject===where.provider_subject.subject)?{user:existing}:null,create:async({data}:{data:typeof linked[number]})=>{linked.push(data);return data;}},user:{findUnique:async()=>{emailLookup++;return existing;},update:async({data}:{data:Partial<typeof existing>})=>Object.assign(existing,data),create:async()=>{created++;throw new Error("Must preserve existing account");}}};
  const identity={subject:"stable",email:"person@gmail.com",name:"Google"};
  assert.equal((await resolveGoogleAccount(identity,tx as unknown as Parameters<typeof resolveGoogleAccount>[1])).id,"owner");
  assert.equal(existing.password,"existing-hash");assert(existing.emailVerified);assert.equal(created,0);assert.equal(linked.length,1);
  const returning=await resolveGoogleAccount({...identity,email:"changed@gmail.com"},tx as unknown as Parameters<typeof resolveGoogleAccount>[1]);
  assert.equal(returning.id,"owner");assert.equal(emailLookup,1);assert.equal(linked.length,1);assert.equal(existing.email,"person@gmail.com");
});

test("Google callback verifies JWKS, sets the existing session and clears its challenge; replay fails",async()=>{
  const saved={...process.env},original=db.$transaction;
  const jar=new ResponseCookies(new Headers()), challenge=await issueGoogleChallenge(secret);
  jar.set("atrion_google_challenge",challenge.cookie);
  const user={id:"fixture-owner",password:"fixture-password-hash"};let transactions=0;
  process.env.GOOGLE_CLIENT_ID=client;process.env.GOOGLE_AUTH_ENABLED="true";process.env.AUTH_SECRET=secret;
  const key={...await exportJWK(publicKey),kid:"test",alg:"RS256",use:"sig"};
  const network=mock.method(globalThis,"fetch",async(input: string | URL | Request)=>{assert.equal(String(input),"https://www.googleapis.com/oauth2/v3/certs");return Response.json({keys:[key]});});
  (db as unknown as {$transaction:Function}).$transaction=async(run:Function)=>{transactions++;return run({authIdentity:{findUnique:async()=>({user})}});};
  const work={route:"/api/auth/google",isStaticGeneration:false} as Parameters<typeof workAsyncStorage.run>[0];
  const request={type:"request",phase:"action",cookies:jar,userspaceMutableCookies:jar} as unknown as Parameters<typeof workUnitAsyncStorage.run>[0];
  const token=await credential({nonce:challenge.nonce});
  const call=()=>workAsyncStorage.run(work,()=>workUnitAsyncStorage.run(request,()=>POST(new Request("https://atrion.example/api/auth/google",{method:"POST",headers:{origin:"https://atrion.example"},body:JSON.stringify({credential:token,csrfToken:challenge.csrfToken})}))));
  try {
    assert.equal((await call()).status,200);assert.equal(transactions,1);assert.equal(jar.get("atrion_google_challenge")!.value,"");
    const session=jar.get("atrion_session")!.value;assert.equal(await verifySessionToken(session,secret,async()=>user.password),user.id);
    assert.equal((await call()).status,401);assert.equal(transactions,1);
  } finally {
    db.$transaction=original;network.mock.restore();
    for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);
  }
});
