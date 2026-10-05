import { parseRig2D, evaluateRig2D, type Rig2DDocument } from "./rig2d";
import { parseRig3D, evaluateRig3D, type Rig3DDocument } from "./rig3d";
import { parseHouse, buildHouse, type HouseDocument } from "./house";
import { choice, id, number, record } from "./validation";

export const DESIGN_KINDS = ["rig2d","rig3d","house"] as const;
export type DesignKind = typeof DESIGN_KINDS[number];
export type DesignDocument = Rig2DDocument | Rig3DDocument | HouseDocument;

export function parseDesignDocument(input: unknown): DesignDocument {
  const value = record(input,"document");
  const kind = choice(value.kind,DESIGN_KINDS,"kind");
  switch (kind) {
    case "rig2d": return parseRig2D(value);
    case "rig3d": return parseRig3D(value);
    case "house": return parseHouse(value);
  }
}

export function evaluateDesign(document: DesignDocument, optionsInput: unknown = {}) {
  const options = record(optionsInput,"options");
  if (document.kind === "rig2d") return evaluateRig2D(document,{
    ...(options.clipId === undefined ? {} : {clipId:id(options.clipId,"clipId")}),
    time:number(options.time ?? 0,"time",0,1e6),
    ...(options.pose === undefined ? {} : {pose:options.pose}),
    ...(options.parameterValues === undefined ? {} : {parameterValues:options.parameterValues}),
  });
  if (document.kind === "rig3d") return evaluateRig3D(document,options.pose);
  return buildHouse(document);
}
