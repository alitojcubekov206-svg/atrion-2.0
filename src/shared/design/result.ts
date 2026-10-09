import type {ThreeDConcept} from "../types";
import type {InteriorScene} from "../interior/scene";
import type {HouseDocument} from "../house/document";
import type {Clarification} from "./brief";
import type {HouseRoomInterior} from "../house/furnishing";

export type LocalModelResult = {
  kind: "model"; concept: ThreeDConcept; source: "procedural" | "local-ai";
  composition?: import("./composition").Composition;
  recognized: string[]; missing: string[];
  document?: HouseDocument; brief?: string[]; notes?: string[];
  interiors?: HouseRoomInterior[];
};
export type DesignPreviewResult = Clarification | LocalModelResult | {kind: "interior"; scene: InteriorScene; source: "local" | "ai"};
