import {parseScene} from "@/shared/interior/scene";
import {detailedScene, disposeDetailed} from "@/shared/interior/detailed";
import {detailedGlb} from "@/backend/interior/detailed-glb";

export async function exportSceneGlb(raw: unknown): Promise<Response> {
  const model = detailedScene(parseScene(raw));
  try {return new Response(await detailedGlb(model) as BodyInit, {headers: {"Content-Type": "model/gltf-binary", "Content-Disposition": 'attachment; filename="atrion-interior.glb"', "Cache-Control": "private, no-store"}});}
  finally {disposeDetailed(model);}
}
