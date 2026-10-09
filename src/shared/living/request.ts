import type {ThreeDConcept} from "../types";
export const isLivingConcept=(concept:ThreeDConcept)=>concept.category==="character"||concept.category==="animal";
export const requestedMotion=(prompt:string):"idle"|"walk"=>/ид[её]т|идут|идущ|идти|ход[ия]т|ходьб|шага|бег|беж|движени|двига|walk|run/i.test(prompt)?"walk":"idle";
