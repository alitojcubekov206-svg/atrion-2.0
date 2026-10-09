import {planFor} from "@/backend/procedural-3d";
import {buildFromBlueprint} from "@/backend/gen/build";
import {matchParts} from "@/backend/gen/match";
import {DesignError, text} from "@/shared/design/validation";
import type {LocalModelResult} from "@/shared/design/result";
import {isLivingConcept, requestedMotion} from "@/shared/living/request";

/** CPU only: no provider discovery, paid fallback, credentials or image stage. */
export function generateLocalModel(raw: unknown, variant = ""): LocalModelResult {
  const prompt = text(raw, "Описание", 1500);
  const {blueprint} = planFor(prompt, variant);
  if (blueprint.kind === "product") {
    throw new DesignError("Не распознан основной объект. Уточните, что построить: например, дом, машину, кота или стол. Неизвестный объект не заменяется случайной фигурой.", 422, "DESIGN_SUBJECT_UNKNOWN");
  }
  // Unlike the legacy convenience wrapper, a failed build must not become a random object.
  const concept = buildFromBlueprint(blueprint);
  if (isLivingConcept(concept)) concept.motion = requestedMotion(prompt);
  const verdict = matchParts(blueprint, concept.parts);
  return {kind: "model", concept, source: "procedural", recognized: blueprint.matched, missing: verdict.missing};
}
