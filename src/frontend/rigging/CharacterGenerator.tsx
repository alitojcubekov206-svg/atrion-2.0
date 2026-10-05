"use client";

import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/frontend/export-3d";
import { characterImageFormat, CHARACTER_PROVIDER_LABELS, MAX_CHARACTER_IMAGE_BYTES, type CharacterImageProvider } from "@/shared/characters";

type Artwork = {url:string;blob:Blob;prompt:string};
const draftKey = "atrion:character-prompt";

export default function CharacterGenerator({preview}:{preview:boolean}) {
  const [prompt,setPrompt] = useState("");
  const [configured,setConfigured] = useState<boolean|null>(null);
  const [provider,setProvider] = useState<CharacterImageProvider|null>(null);
  const [statusError,setStatusError] = useState("");
  const [statusAttempt,setStatusAttempt] = useState(0);
  const [busy,setBusy] = useState(false),[error,setError] = useState("");
  const [art,setArt] = useState<Artwork|null>(null),[downloaded,setDownloaded] = useState(false);
  const controller = useRef<AbortController|null>(null);
  const imageUrl = useRef<string|null>(null);
  const providerName = provider ? CHARACTER_PROVIDER_LABELS[provider] : "Сервис генерации";
  const artFormat = characterImageFormat(art?.blob.type);

  useEffect(() => {
    try {setPrompt(sessionStorage.getItem(draftKey)??"");} catch {/* The form still works without storage. */}
    return () => {
      controller.current?.abort();
      if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);
    };
  },[]);

  useEffect(() => {
    if(preview)return;
    setConfigured(null);setStatusError("");
    const statusController = new AbortController();
    const timer=window.setTimeout(()=>statusController.abort("timeout"),15_000);
    fetch("/api/characters/concept",{signal:statusController.signal,cache:"no-store"})
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error??"Не удалось проверить подключение");
        if(data.provider!=="cloudflare"&&data.provider!=="openai")throw new Error("Не удалось определить сервис генерации");
        setProvider(data.provider);
        setConfigured(data.configured === true);
      }).catch((e) => {
        if(statusController.signal.reason==="timeout")setStatusError("Проверка подключения заняла слишком много времени.");
        else if(!statusController.signal.aborted)setStatusError(e instanceof Error?e.message:"Не удалось проверить подключение");
      }).finally(()=>clearTimeout(timer));
    return () => {clearTimeout(timer);statusController.abort();};
  },[preview,statusAttempt]);

  useEffect(() => {
    if (!busy && (!art || downloaded)) return;
    const handler = (event:BeforeUnloadEvent) => {event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",handler);
    return () => window.removeEventListener("beforeunload",handler);
  },[busy,art,downloaded]);

  async function generate() {
    if (controller.current || preview) return;
    const requestController = new AbortController();controller.current=requestController;
    const timer = window.setTimeout(()=>requestController.abort("timeout"),165_000);
    setBusy(true);setError("");
    const requestPrompt=prompt.trim();let nextUrl:string|undefined;
    try {
      const response=await fetch("/api/characters/concept",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt:requestPrompt}),signal:requestController.signal,
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Не удалось создать рисунок");
      const format=characterImageFormat(data.image?.mime);
      if(data.stage!=="concept"||data.rigReady!==false||!format||typeof data.image?.base64!=="string"||data.image.base64.length>Math.ceil(MAX_CHARACTER_IMAGE_BYTES/3)*4)throw new Error("Некорректный ответ генератора");
      const bytes=Uint8Array.from(atob(data.image.base64),(char)=>char.charCodeAt(0));
      const blob=new Blob([bytes],{type:format.mime});nextUrl=URL.createObjectURL(blob);
      const image=new Image();image.src=nextUrl;await image.decode();
      if(requestController.signal.aborted)throw new Error("Генерация отменена");
      if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);
      imageUrl.current=nextUrl;setArt({url:nextUrl,blob,prompt:requestPrompt});nextUrl=undefined;setDownloaded(false);
    } catch(e) {
      if(nextUrl)URL.revokeObjectURL(nextUrl);
      setError(requestController.signal.aborted
        ? requestController.signal.reason==="timeout"?"Сервер не ответил вовремя. Предыдущий рисунок сохранён на странице.":"Запрос отменён."
        : (e instanceof Error?e.message:"Не удалось создать рисунок"));
    } finally {clearTimeout(timer);controller.current=null;setBusy(false);}
  }

  return <section id="character-generation" className="space-y-4 rounded-2xl border border-violet-400/25 bg-violet-400/[0.04] p-5">
    <div><h2 className="text-lg font-semibold">Персонаж по описанию</h2>
      <p className="mt-1 text-sm text-white/60">Первый этап — рисунок. Подготовка слоёв, деформация и автоматическая сборка рига ещё не реализованы.</p></div>
    <label className="block text-sm text-violet-200">Описание персонажа
      <textarea aria-label="Описание персонажа" rows={3} maxLength={1500} value={prompt} disabled={busy}
        placeholder="Внешность, причёска, одежда, цвета и стиль рисунка…"
        className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-black/25 p-3 text-white outline-none focus:border-violet-400"
        onChange={(event)=>{setPrompt(event.target.value);try{sessionStorage.setItem(draftKey,event.target.value);}catch{/* Optional draft. */}}}/>
    </label>
    <div className="flex flex-wrap items-center gap-3">
      <button className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium disabled:opacity-40" disabled={busy||preview||configured!==true||prompt.trim().length<10} onClick={()=>void generate()}>{busy?"Рисую персонажа…":"Создать рисунок"}</button>
      {busy&&<button className="rounded-xl border border-white/20 px-4 py-2 text-sm" onClick={()=>controller.current?.abort("cancelled")}>Отменить запрос</button>}
      <p className="text-xs text-white/50">{preview?"Генерация доступна после входа в основной версии сайта.":statusError?"Подключение не проверено.":configured===false?`${providerName} ещё не подключён на сервере.`:configured===null?"Проверяю подключение…":`${providerName} · один рисунок расходует один AI-запрос. Может занять до двух минут.`}</p>
      {statusError&&<button className="rounded-xl border border-white/20 px-4 py-2 text-sm" onClick={()=>setStatusAttempt((attempt)=>attempt+1)}>Проверить подключение</button>}
    </div>
    {statusError&&<p role="alert" className="text-sm text-rose-300">{statusError}</p>}
    {error&&<p role="alert" className="text-sm text-rose-300">{error}</p>}
    {busy&&<p role="status" className="text-sm text-violet-200">Ожидаю изображение. Риг на этом этапе не создаётся.</p>}
    {art&&<div className="grid items-start gap-4 md:grid-cols-[minmax(0,360px)_1fr]">
      {/* An object URL is local to this page and is deliberately not a saved rig asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art.url} alt="Сгенерированный рисунок персонажа" className="max-h-[560px] w-full rounded-xl bg-[#262330] object-contain"/>
      <div className="space-y-3"><h3 className="font-medium">Рисунок готов</h3><p className="text-sm text-white/60">{art.prompt}</p>
        <p className="text-sm text-white/60">Это цельная иллюстрация. Она ещё не разделена на части и не содержит рига. Скачайте результат: изображение не сохраняется в аккаунте.</p>
        {artFormat?.mime==="image/jpeg"&&<p className="text-sm text-white/60">JPEG содержит фон. Удаление фона и подготовка прозрачных частей — следующий этап.</p>}
        {artFormat&&<button className="rounded-xl border border-violet-400/40 px-4 py-2 text-sm" onClick={()=>{downloadBlob(`atrion-character-concept.${artFormat.extension}`,art.blob);setDownloaded(true);}}>Скачать рисунок {artFormat.label}</button>}
      </div>
    </div>}
  </section>;
}
