import type { ThreeDConcept } from "@/shared/types";
import { scoreParts } from "@/backend/gen/validate";
import {
  describeBlueprint,
  planFromPrompt,
  type Blueprint,
  type ObjectKind,
} from "@/backend/gen/blueprint";
import { buildFromBlueprint } from "@/backend/gen/build";

export type { Blueprint };

/**
 * What the described thing is — building, character, appliance… It drives the
 * AI detail brief, the clarifying interview and the prompt-match check.
 */
export type ConceptCategory = ObjectKind;

export function detectCategory(prompt: string): ConceptCategory {
  return planFromPrompt(prompt).kind;
}

/**
 * Parametric model for a prompt.
 *
 * Every generator is seeded from the prompt text, so the same words reproduce a
 * model and different words change it. There are no object templates: the text
 * becomes a feature vector and one builder renders it.
 */
export function buildFromPrompt(prompt: string, variant = ""): ThreeDConcept {
  return buildFromPlan(planFromPrompt(prompt, variant));
}

/** Same as `buildFromPrompt`, for callers that already hold the blueprint. */
export function buildFromPlan(blueprint: Blueprint): ThreeDConcept {
  try {
    return buildFromBlueprint(blueprint);
  } catch (error) {
    console.error(
      "Procedural build failed",
      { prompt: blueprint.prompt, plan: describeBlueprint(blueprint) },
      error
    );
    // A blank plan still produces a body — better than failing the request.
    return buildFromBlueprint(planFromPrompt("объект"));
  }
}

/** The blueprint behind a prompt, for logging and for the AI geometry brief. */
/** `variant` gives the same words a different take — each generation passes a fresh one. */
export function planFor(prompt: string, variant = "") {
  const blueprint = planFromPrompt(prompt, variant);
  return { blueprint, summary: describeBlueprint(blueprint) };
}

/** True when the parts read as one connected object rather than a pile. */
export function isCoherentConcept(concept: ThreeDConcept): boolean {
  if (!concept.parts?.length || concept.parts.length < 4) return false;
  return scoreParts(concept.parts) >= 0.55;
}
