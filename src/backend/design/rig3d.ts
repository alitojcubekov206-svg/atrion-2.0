import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { ModelPart, PartShape } from "../../shared/types";
import { expandPart } from "../../shared/geometry";
import { check, choice, finiteMatrix, hierarchy, id, integer, list, number, parent, record, text, unique, vector3, version } from "./validation";

export type Transform3D = { position: [number, number, number]; rotation: [number, number, number] };
export type Rig3DDocument = {
  kind: "rig3d"; schemaVersion: 1; units: "m" | "cm" | "mm";
  bones: { id: string; parentId: string | null; length: number; bind: Transform3D }[];
  parts: ModelPart[]; bindings: { partId: string; boneId: string }[];
};

export function transform3D(input: unknown): Transform3D {
  const value = record(input,"transform");
  return { position: vector3(value.position,"position"), rotation: vector3(value.rotation,"rotation") };
}

function matrix(transform: Transform3D) {
  return new Matrix4().compose(new Vector3(...transform.position),
    new Quaternion().setFromEuler(new Euler(...transform.rotation,"XYZ")),new Vector3(1,1,1));
}

export function parseRig3D(input: unknown): Rig3DDocument {
  const value = record(input,"document");
  version(value,"rig3d");
  const bones = list(value.bones,"bones",128,1).map((inputBone) => {
    const bone = record(inputBone,"bone");
    return { id: id(bone.id,"bone.id"), parentId: parent(bone.parentId), length: number(bone.length,"length",0.001,10000), bind: transform3D(bone.bind) };
  });
  hierarchy(bones);
  const boneMap = unique(bones,"bones");
  let totalInstances = 0;
  const parts = list(value.parts,"parts",256,1).map((partInput): ModelPart => {
    const part = record(partInput,"part");
    const size = vector3(part.size,"size");
    check(size.every((n) => n >= 0.0001 && n <= 10000),"Некорректные размеры детали");
    const color = text(part.color,"color");
    check(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color),"Некорректный цвет");
    const result: ModelPart = {
      id: id(part.id,"part.id"), name: text(part.name,"part.name"),
      shape: choice(part.shape,["box","sphere","cylinder","cone","capsule","pyramid","prism","wedge","torus","tube","plane","mesh"] as PartShape[],"shape"),
      size, position: vector3(part.position,"position"), rotation: vector3(part.rotation,"rotation"), color,
      material: part.material === undefined ? "Не задан" : text(part.material,"material"), quantity: 1,
    };
    if (part.group !== undefined) result.group = text(part.group,"group");
    if (part.role !== undefined) result.role = text(part.role,"role");
    if (part.repeat !== undefined) {
      const repeat = record(part.repeat,"repeat");
      result.repeat = { count: integer(repeat.count,"repeat.count",2,64), step: vector3(repeat.step,"repeat.step") };
      if (repeat.rotationStep !== undefined) result.repeat.rotationStep = vector3(repeat.rotationStep,"rotationStep");
    }
    if (part.mirror !== undefined) result.mirror = choice(part.mirror,["x","z","xz"] as const,"mirror");
    for (const key of ["opacity","metalness","roughness","emissive"] as const) {
      if (part[key] !== undefined) result[key] = number(part[key],key,0,1);
    }
    if (part.hole !== undefined) result.hole = number(part.hole,"hole",0,0.95);
    if (part.sides !== undefined) result.sides = integer(part.sides,"sides",3,64);
    if (result.shape === "mesh") {
      const mesh = record(part.mesh,"mesh");
      const positions = list(mesh.position,"mesh.position",90000,9).map((n) => number(n,"mesh.position"));
      check(positions.length % 9 === 0,"Mesh должен содержать полные треугольники");
      result.mesh = { position: positions };
      if (mesh.normal !== undefined) {
        result.mesh.normal = list(mesh.normal,"mesh.normal",positions.length,positions.length).map((n) => number(n,"normal",-1,1));
      }
    }
    const count = (result.repeat?.count ?? 1) * (result.mirror === "xz" ? 4 : result.mirror ? 2 : 1);
    totalInstances += count;
    check(totalInstances <= 4096,"Слишком много экземпляров деталей");
    result.quantity = count;
    return result;
  });
  const partMap = unique(parts,"parts");
  const bound = new Set<string>();
  const bindings = list(value.bindings,"bindings",256).map((bindingInput) => {
    const binding = record(bindingInput,"binding");
    const partId = id(binding.partId,"partId"), boneId = id(binding.boneId,"boneId");
    check(partMap.has(partId) && boneMap.has(boneId),"Неизвестная деталь/кость привязки");
    check(!bound.has(partId),"Деталь уже привязана");
    bound.add(partId);
    return { partId, boneId };
  });
  return { kind: "rig3d", schemaVersion: 1, units: choice(value.units,["m","cm","mm"] as const,"units"), bones, parts, bindings };
}

/** Rigid delta from bind bone to pose bone; no scale, deformation or skinning. */
export function evaluateRig3D(document: Rig3DDocument, poseInput: unknown = {}) {
  const pose = record(poseInput,"pose");
  const boneIds = new Set(document.bones.map((bone) => bone.id));
  for (const key of Object.keys(pose)) check(boneIds.has(key),"Неизвестная кость pose");
  const bindWorld = new Map<string,Matrix4>(), poseWorld = new Map<string,Matrix4>();
  const bones = hierarchy(document.bones).map((bone) => {
    const bind = matrix(bone.bind), current = matrix(Object.hasOwn(pose,bone.id) ? transform3D(pose[bone.id]) : bone.bind);
    if (bone.parentId) {
      bind.premultiply(bindWorld.get(bone.parentId)!);
      current.premultiply(poseWorld.get(bone.parentId)!);
    }
    finiteMatrix(bind.elements); finiteMatrix(current.elements);
    bindWorld.set(bone.id,bind); poseWorld.set(bone.id,current);
    return { id: bone.id, matrix: current.toArray(), head: new Vector3().applyMatrix4(current).toArray(),
      tail: new Vector3(0,bone.length,0).applyMatrix4(current).toArray() };
  });
  const bindings = new Map(document.bindings.map((item) => [item.partId,item.boneId]));
  const parts = document.parts.flatMap((part) => expandPart(part).map((instance,index) => {
    const boneId = bindings.get(part.id);
    const world = matrix(instance);
    if (boneId) world.premultiply(poseWorld.get(boneId)!.clone().multiply(bindWorld.get(boneId)!.clone().invert()));
    finiteMatrix(world.elements);
    const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
    world.decompose(position,rotation,scale);
    const euler = new Euler().setFromQuaternion(rotation,"XYZ");
    const { repeat: _repeat, mirror: _mirror, ...base } = part;
    return { ...base, id: `${part.id}_${index}`, sourcePartId: part.id, quantity: 1,
      position: position.toArray(), rotation: [euler.x,euler.y,euler.z], size: instance.size, matrix: world.toArray() };
  }));
  return { units: document.units, mode: "rigid", bones, parts };
}
