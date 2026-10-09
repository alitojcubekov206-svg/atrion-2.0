import type {LocalModelResult} from "@/shared/design/result";

type Draft = {id: string; expires: number; prompt: string; result: LocalModelResult};
// A tab-local handoff: retain one copy, never send geometry through a URL or API.
let draft: Draft | null = null;
const TTL = 30 * 60 * 1000;

export function storeDesignDraft(result: LocalModelResult, prompt: string): string {
  const id = crypto.randomUUID();
  draft = {id, expires: Date.now() + TTL, prompt: prompt.slice(0,1500), result: structuredClone(result)};
  return id;
}

export function readDesignDraft(id: string): {prompt: string; result: LocalModelResult} | null {
  if (!draft || draft.id !== id) return null;
  if (draft.expires <= Date.now()) {draft = null; return null;}
  return {prompt: draft.prompt, result: structuredClone(draft.result)};
}
