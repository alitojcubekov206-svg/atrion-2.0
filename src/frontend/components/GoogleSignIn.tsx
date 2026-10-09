"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type GoogleAPI = { accounts: { id: {
  initialize: (options: {client_id: string; nonce: string; callback: (response: {credential: string}) => void; auto_select: boolean}) => void;
  renderButton: (element: HTMLElement, options: {type: string; theme: string; size: string; text: string; shape: string; width: number; locale: string}) => void;
} } };
declare global { interface Window { google?: GoogleAPI } }
let sdk: Promise<GoogleAPI> | undefined;
function loadGoogle() {
  if(window.google) return Promise.resolve(window.google);
  if(!sdk) sdk=new Promise<GoogleAPI>((resolve,reject)=>{
    const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.async=true;
    script.onload=()=>window.google?resolve(window.google):reject(new Error("SDK"));
    script.onerror=()=>{sdk=undefined;script.remove();reject(new Error("SDK"));};
    document.head.appendChild(script);
  });
  return sdk;
}

export default function GoogleSignIn({onSuccess}:{onSuccess:()=>void}) {
  const host=useRef<HTMLDivElement>(null), success=useRef(onSuccess);
  const [state,setState]=useState<"loading"|"ready"|"unconfigured"|"signing"|"error">("loading");
  const [error,setError]=useState(""), [attempt,setAttempt]=useState(0);
  useEffect(()=>{success.current=onSuccess;},[onSuccess]);
  useEffect(()=>{
    let active=true;const controller=new AbortController();setState("loading");setError("");
    async function setup() {
      try {
        const response=await fetch("/api/auth/google",{cache:"no-store",signal:controller.signal});
        if(!response.ok) throw new Error("Вход через Google временно недоступен");
        const config=await response.json();
        if(!active) return;
        if(!config.configured) {setState("unconfigured");return;}
        const google=await loadGoogle();if(!active||!host.current)return;
        google.accounts.id.initialize({client_id:config.clientId,nonce:config.nonce,auto_select:false,callback:async({credential})=>{
          if(!active)return;setState("signing");setError("");
          try {
            const result=await fetch("/api/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({credential,csrfToken:config.csrfToken}),signal:controller.signal});
            const data=await result.json();if(!active)return;
            if(!result.ok) throw new Error(data.error??"Не удалось войти через Google");
            success.current();
          } catch(err) {if(active){setState("error");setError(err instanceof Error?err.message:"Не удалось войти через Google");}}
        }});
        host.current.replaceChildren();
        google.accounts.id.renderButton(host.current,{type:"standard",theme:"filled_black",size:"large",text:"signin_with",shape:"pill",width:Math.min(360,host.current.clientWidth||320),locale:"ru"});
        setState("ready");
      } catch(err) {if(active){setState("error");setError(err instanceof Error?err.message:"Не удалось подключить Google");}}
    }
    void setup();return()=>{active=false;controller.abort();};
  },[attempt]);
  return <div className="w-full text-center">
    <div ref={host} className={`flex min-h-11 justify-center ${state!=="ready"?"hidden":""}`} aria-label="Вход через Google" />
    {state!=="ready"&&<button type="button" disabled={state!=="error"} onClick={()=>setAttempt(v=>v+1)} className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm text-white disabled:opacity-50">{state==="signing"?"Входим через Google…":state==="loading"?"Подключаем Google…":"Войти через Google"}</button>}
    {state==="unconfigured"&&<p className="mt-2 text-xs text-muted">Вход через Google ещё не подключён</p>}
    {(state==="ready"||state==="signing")&&<p className="mt-2 text-xs leading-relaxed text-muted">Для входа Atrion использует имя, email и идентификатор Google-аккаунта. <Link href="/legal#privacy" className="text-accent hover:underline">Конфиденциальность</Link></p>}
    {error&&<p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    <div className="my-4 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-white/10"/>или через email<span className="h-px flex-1 bg-white/10"/></div>
  </div>;
}
