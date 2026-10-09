import {Box3, BoxGeometry, CylinderGeometry, SphereGeometry, DataTexture, Group, Mesh, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector3} from "three";
import {createFurniture} from "../forma/furniture.js";
import {findAsset} from "./catalog";
import {sceneParts} from "./geometry";
import type {InteriorScene, Opening} from "./scene";
import {fixtureParts} from "./fixtures";

const mapping: Record<string, string> = {bed_double:"bed",bed_single:"bed",sofa_compact:"sofa",desk_work:"desk",table_dining:"table",chair_simple:"chair",wardrobe_double:"wardrobe",lamp_floor:"lamp",plant_pot:"plant",decor_cube:"nightstand"};
type Surface = "wood" | "fabric" | "floor";
/** Deterministic, embedded material textures; no external texture service. */
export function surfaceTexture(kind: Surface) {
  const size = 256, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const noise = ((x * 73 + y * 151 + x * y * 13) % 101) / 100 - .5;
    const grain = Math.sin(x * .72 + Math.sin(y * .025) * 2) * 5 + Math.sin(x * 2.2 + y * .02) * 2;
    let value = kind === "fabric" ? 229 + ((x % 4 < 2) !== (y % 4 < 2) ? 5 : -5) + noise * 6 : 234 + grain + noise * 3;
    if (kind === "floor") {
      const plank = Math.floor(x / 64), joint = (y + (plank % 2) * 128) % 256;
      value += [-9, 2, -3, 6][plank];
      if (x % 64 < 1 || joint < 1) value -= 34;
    }
    const v = Math.max(0, Math.min(255, Math.round(value)));
    pixels.set([v, v, v, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.colorSpace = SRGBColorSpace; texture.wrapS = texture.wrapT = RepeatWrapping; texture.needsUpdate = true;
  return texture;
}
function normalFrom(texture: DataTexture, strength: number) {
  const {data, width, height} = texture.image, pixels = new Uint8Array(width * height * 4);
  const sample = (x: number, y: number) => (data as Uint8Array)[(((y + height) % height) * width + (x + width) % width) * 4];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const normal = new Vector3((sample(x - 1, y) - sample(x + 1, y)) / 255 * strength, (sample(x, y - 1) - sample(x, y + 1)) / 255 * strength, 1).normalize();
    pixels.set([Math.round((normal.x + 1) * 127.5), Math.round((normal.y + 1) * 127.5), Math.round((normal.z + 1) * 127.5), 255], (y * width + x) * 4);
  }
  const map = new DataTexture(pixels, width, height, RGBAFormat);
  map.wrapS = map.wrapT = RepeatWrapping; map.needsUpdate = true;
  return map;
}
export function detailedAsset(assetId: string, color = "#81959b") {
  const asset = findAsset(assetId), source = asset.template ?? mapping[assetId];
  const fixture = fixtureParts(assetId, color);
  if (!source && !fixture) throw new Error("No furniture template");
  const model = fixture ? new Group() : createFurniture(source, color).root;
  for (const part of fixture ?? []) {
    const geometry = part.shape === "sphere" ? new SphereGeometry(.5,24,16) : part.shape === "cylinder" ? new CylinderGeometry(.5,.5,1,24) : new BoxGeometry(1,1,1);
    geometry.scale(...part.size);
    const mesh = new Mesh(geometry, new MeshStandardMaterial({color:part.color, roughness:part.roughness, metalness:part.metalness, opacity:part.opacity, transparent:(part.opacity ?? 1)<1}));
    mesh.position.set(...part.position);mesh.name=part.name;mesh.castShadow=mesh.receiveShadow=true;model.add(mesh);
  }
  const bounds = new Box3().setFromObject(model), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
  const root = new Group(); root.name = asset.name; root.add(model);
  root.scale.set(asset.width / size.x, asset.height / size.y, asset.depth / size.z);
  const wood = surfaceTexture("wood"), fabric = surfaceTexture("fabric"), woodNormal = normalFrom(wood, .6), fabricNormal = normalFrom(fabric, 1.8);
  const used = new Set<DataTexture>();
  model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const mat = node.material as MeshStandardMaterial;
    if (mat.metalness > .3 || mat.transparent) return;
    const timber = mat.color.getHexString() === "97764f" || ["table", "desk", "coffee", "console"].includes(source);
    const textile = !timber && ["bed", "sofa", "chair", "armchair", "ottoman", "bench"].includes(source);
    mat.map = timber ? wood : textile ? fabric : null;
    mat.normalMap = timber ? woodNormal : textile ? fabricNormal : null;
    mat.roughness = textile ? .94 : timber ? .58 : .72;
    if (mat.map) used.add(mat.map as DataTexture);
    if (mat.normalMap) used.add(mat.normalMap as DataTexture);
  });
  for (const map of [wood, fabric, woodNormal, fabricNormal]) if (!used.has(map)) map.dispose();
  return root;
}
function wallMesh(root: Group, side: Opening["wall"], size: [number,number,number], position: [number,number,number], material: MeshStandardMaterial, name: string) {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.position.set(...position); mesh.name = name; mesh.userData.wallSide = side;
  mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  return mesh;
}
export function detailedScene(scene: InteriorScene) {
  const root = new Group(); root.name = "Atrion Interior";
  for (const part of sceneParts({...scene, objects: []})) {
    const material = new MeshStandardMaterial({color: part.color, roughness: part.role === "window" ? .12 : .8, transparent: (part.opacity ?? 1) < 1, opacity: part.opacity ?? 1});
    const geometry = new BoxGeometry(...part.size);
    if (part.id === "floor") {
      material.map = surfaceTexture("floor"); material.normalMap = normalFrom(material.map as DataTexture, 1.2); material.roughness = .52;
      const uv = geometry.getAttribute("uv"), pos = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
      for (let i = 0; i < uv.count; i++) if (Math.abs(normals.getY(i)) > .9) uv.setXY(i, (pos.getX(i) + scene.width / 2) / 1.1, (pos.getZ(i) + scene.length / 2) / 2.4);
    }
    const mesh = new Mesh(geometry, material); mesh.name = part.id;
    mesh.position.set(...part.position); mesh.rotation.set(...part.rotation);
    mesh.userData.role = part.role;
    const side = part.role === "wall" ? part.id.split("_")[1] as Opening["wall"] : scene.openings.find(o => o.id === part.id||o.id===part.group)?.wall;
    mesh.userData.keepInCutaway=part.role?.startsWith("door")===true;
    mesh.userData.wallSide = side; mesh.receiveShadow = true; mesh.castShadow = part.role === "wall"; root.add(mesh);
    // Skirting follows actual solid wall segments and never crosses a doorway.
    if (part.role === "wall" && part.position[1] - part.size[1] / 2 < .001 && side) {
      const horizontal = side === "north" || side === "south";
      const p: [number,number,number] = [part.position[0], .045, part.position[2]];
      if (horizontal) p[2] += side === "north" ? .075 : -.075; else p[0] += side === "west" ? .075 : -.075;
      wallMesh(root, side, horizontal ? [part.size[0], .09, .025] : [.025, .09, part.size[2]], p, new MeshStandardMaterial({color: scene.wallColor, roughness: .6}), "Skirting");
    }
  }
  for (const o of scene.openings.filter(o => o.kind === "window")) {
    const horizontal = o.wall === "north" || o.wall === "south";
    const depth = (horizontal ? scene.length : scene.width) / 2 + .06;
    const trim = new MeshStandardMaterial({color: "#dedbd3", roughness: .45, metalness: .08});
    const add = (x: number, y: number, w: number, h: number) => wallMesh(root, o.wall, horizontal ? [w,h,.075] : [.075,h,w], horizontal ? [x,y,(o.wall === "north" ? -1 : 1)*depth] : [(o.wall === "west" ? -1 : 1)*depth,y,x], trim, "Window frame");
    const center = o.offset + o.width / 2 - (horizontal ? scene.width : scene.length) / 2;
    for (const sign of [-1,1]) {add(center + sign * (o.width / 2 - .025), o.bottom + o.height / 2, .05, o.height);add(center, o.bottom + o.height / 2 + sign * (o.height / 2 - .025), o.width, .05);}
    add(center, o.bottom + o.height / 2, .035, o.height);
  }
  for (const item of scene.objects) {
    const holder = new Group(); holder.name = item.id; holder.userData.objectId = item.id;
    holder.position.set(item.position.x - scene.width / 2, item.position.y, item.position.z - scene.length / 2);
    holder.rotation.y = item.rotation.y; holder.scale.set(item.scale.x,item.scale.y,item.scale.z);
    holder.add(detailedAsset(item.assetId,item.color)); root.add(holder);
  }
  return root;
}
export function disposeDetailed(root: Group) {
  const materials = new Set<MeshStandardMaterial>(), textures = new Set<DataTexture>();
  root.traverse(node => {if (node instanceof Mesh) {node.geometry.dispose();for (const m of Array.isArray(node.material) ? node.material : [node.material]) materials.add(m);}});
  for (const m of materials) {for (const t of [m.map,m.normalMap]) if (t) textures.add(t as DataTexture);m.dispose();}
  for (const t of textures) t.dispose();
}
