import type { ThreeDConcept } from "@/shared/types";
import { scoreParts } from "@/backend/gen/validate";
import { describeBlueprint, planFromPrompt, type Blueprint } from "@/backend/gen/blueprint";
import { buildFromBlueprint } from "@/backend/gen/build";

export type { Blueprint };

/**
 * Coarse class of the thing being described. There is no per-class geometry —
 * this only tells the AI layer how much detail to ask for and sets the default
 * scale when the prompt gives no numbers.
 */
export type ConceptCategory = Blueprint["sizeClass"];

export function detectCategory(prompt: string): ConceptCategory {
  return planFromPrompt(prompt).sizeClass;
}

/**
 * Parametric model for a prompt.
 *
 * Every generator is seeded from the prompt text, so the same words reproduce a
 * model and different words change it. There are no object templates: the text
 * becomes a feature vector and one builder renders it.
 */
export function buildFromPrompt(prompt: string): ThreeDConcept {
  const blueprint = planFromPrompt(prompt);
  try {
    return buildFromBlueprint(blueprint);
  } catch (error) {
    console.error("Procedural build failed", { prompt, plan: describeBlueprint(blueprint) }, error);
    // A blank plan still produces a body — better than failing the request.
    return buildFromBlueprint(planFromPrompt("объект"));
  }
}

/** The blueprint behind a prompt, for logging and for the AI geometry brief. */
export function planFor(prompt: string) {
  const blueprint = planFromPrompt(prompt);
  return { blueprint, summary: describeBlueprint(blueprint) };
}

/** True when the parts read as one connected object rather than a pile. */
export function isCoherentConcept(concept: ThreeDConcept): boolean {
  if (!concept.parts?.length || concept.parts.length < 4) return false;
  return scoreParts(concept.parts) >= 0.55;
}
