import {Mesh, MeshStandardMaterial, type BufferGeometry, type Object3D} from "three";
import {computeMikkTSpaceTangents} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as MikkTSpace from "three/examples/jsm/libs/mikktspace.module.js";

/** Bake glTF tangent space once per geometry so importers keep normal maps consistent. */
export async function prepareExportTangents(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(m => m instanceof MeshStandardMaterial && m.normalMap) && !object.geometry.hasAttribute("tangent")) geometries.add(object.geometry);
  });
  if (!geometries.size) return;
  await MikkTSpace.ready;
  for (const geometry of geometries) computeMikkTSpaceTangents(geometry, MikkTSpace);
}
