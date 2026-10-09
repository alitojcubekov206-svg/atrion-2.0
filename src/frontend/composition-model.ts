import {Group, Mesh, Quaternion, Vector3} from "three";
import {GLTFExporter} from "three/examples/jsm/exporters/GLTFExporter.js";
import {ASSETS} from "@/shared/interior/catalog";
import {detailedAsset, disposeDetailed} from "@/shared/interior/detailed";
import {buildConceptScene} from "./export-3d";
import type {LocalModelResult} from "@/shared/design/result";

/** Display and export use exactly the same meshes, with center-based transforms. */
export function buildComposition(result: LocalModelResult): Group {
  const nodes = result.composition!.nodes;
  const root = buildConceptScene({...result.concept, parts: result.concept.parts.filter((_, i) => !ASSETS.some(a => a.id === nodes[i]?.shape))});
  for (const [i, n] of nodes.entries()) {
    const asset = ASSETS.find(a => a.id === n.shape);
    if (!asset) continue;
    const holder = new Group(), centered = new Group();
    const mesh = detailedAsset(asset.id, n.color);
    // Keep the normalized scale supplied by detailedAsset on its own node.
    centered.add(mesh); centered.scale.set(n.s[0] / asset.width, n.s[1] / asset.height, n.s[2] / asset.depth);
    holder.add(centered); holder.rotation.set(...n.r.map(d => d * Math.PI / 180) as [number, number, number]);
    const bottom = new Vector3(0, -n.s[1] / 2, 0).applyQuaternion(new Quaternion().setFromEuler(holder.rotation));
    holder.position.set(...n.p).add(bottom); holder.name = n.name; holder.userData.nodeId = `node_${i}`;
    holder.traverse(o => {if (o instanceof Mesh) o.castShadow = o.receiveShadow = true;}); root.add(holder);
  }
  root.updateMatrixWorld(true);
  return root;
}
export async function exportComposition(result: LocalModelResult): Promise<Blob> {
  const root = buildComposition(result);
  try {
    const data = await new GLTFExporter().parseAsync(root, {binary: true});
    if (!(data instanceof ArrayBuffer)) throw new Error("Invalid GLB");
    return new Blob([data], {type: "model/gltf-binary"});
  } finally {disposeDetailed(root);}
}
