import {resolveDesignBrief} from "./brief";
import {buildBriefModel} from "./brief-model";
import {prepareInteriorScene} from "@/backend/interior/request";
import {designWithPlanner} from "@/shared/interior/engine";
import {designPromptTarget} from "@/shared/interior/request";
import {text} from "@/shared/design/validation";
import {parseScene, type InteriorScene} from "@/shared/interior/scene";
import type {ReadyBrief, Clarification} from "@/shared/design/brief";
import type {DesignPreviewResult} from "@/shared/design/result";

type RoomPlan = {kind: "room"; prompt: string; scene: InteriorScene; editing: boolean};
export function prepareDesignPreview(body: Record<string, unknown>): ReadyBrief | Clarification | RoomPlan {
  let prompt = text(body.prompt, "Описание", 1500);
  const editing = body.editing === true;
  if (!editing) {
    const brief = resolveDesignBrief(prompt, body.answers);
    if (brief.kind === "clarification") return brief;
    prompt = brief.prompt;
    if (brief.house || designPromptTarget(prompt) === "model") return brief;
  }
  return {kind: "room", prompt, editing, scene: prepareInteriorScene(parseScene(body.scene), prompt, editing)};
}
export async function renderDesignPreview(plan: ReadyBrief | RoomPlan): Promise<DesignPreviewResult> {
  if (plan.kind === "ready") return buildBriefModel(plan, crypto.randomUUID());
  return {kind: "interior", ...await designWithPlanner(plan.scene, plan.prompt, plan.editing, 0)};
}
