import { DesignError, check, choice, finiteMatrix, hierarchy, id, integer, list, number, parent, record, text, unique, vector2, version } from "./validation";

export type Transform2D = { position: [number, number]; rotation: number; scale: [number, number] };
export type Matrix2D = [number, number, number, number, number, number];
export type Bone2D = { id: string; parentId: string | null; length: number; bind: Transform2D };
export type Rig2DDocument = {
  kind: "rig2d"; schemaVersion: 1; canvas: { width: number; height: number };
  assets: { id: string; uri: string; mime: "image/png" | "image/webp"; width: number; height: number }[];
  layers: { id: string; assetId: string; zIndex: number; visible: boolean; pivot: [number, number]; transform: Transform2D }[];
  bones: Bone2D[];
  attachments: { layerId: string; boneId: string; offset: Transform2D }[];
  clips: { id: string; duration: number; loop: boolean; tracks: {
    boneId: string; rotationMode: "shortest" | "unwrapped";
    keys: { time: number; transform: Transform2D; interpolation: "linear" | "step" }[];
  }[] }[];
};

export function transform2D(input: unknown): Transform2D {
  const value = record(input, "transform");
  const scale = vector2(value.scale, "scale");
  check(scale.every((v) => v >= 0.01 && v <= 100), "scale: ожидаются положительные значения 0.01–100");
  return { position: vector2(value.position, "position"), rotation: number(value.rotation, "rotation"), scale };
}

export function parseRig2D(input: unknown): Rig2DDocument {
  const value = record(input, "document");
  version(value, "rig2d");
  const canvas = record(value.canvas, "canvas");
  const assets = list(value.assets, "assets", 256).map((item) => {
    const asset = record(item, "asset");
    const uri = text(asset.uri, "asset.uri", 2048);
    let url: URL;
    try { url = new URL(uri); } catch { throw new DesignError("Некорректный asset URI"); }
    check(url.protocol === "https:" && !url.username && !url.password, "Ассеты должны иметь постоянный HTTPS URL без учётных данных");
    return { id: id(asset.id, "asset.id"), uri, mime: choice(asset.mime, ["image/png", "image/webp"] as const, "mime"),
      width: integer(asset.width, "asset.width", 1, 8192), height: integer(asset.height, "asset.height", 1, 8192) };
  });
  const assetMap = unique(assets, "assets");
  const layers = list(value.layers, "layers", 256).map((item) => {
    const layer = record(item, "layer");
    const assetId = id(layer.assetId, "assetId");
    check(assetMap.has(assetId), `Неизвестный asset ${assetId}`);
    check(typeof layer.visible === "boolean", "visible: ожидается boolean");
    return { id: id(layer.id, "layer.id"), assetId, visible: layer.visible,
      zIndex: integer(layer.zIndex, "zIndex", -10000, 10000), pivot: vector2(layer.pivot, "pivot"), transform: transform2D(layer.transform) };
  });
  const layerMap = unique(layers, "layers");
  const bones = list(value.bones, "bones", 256, 1).map((item) => {
    const bone = record(item, "bone");
    return { id: id(bone.id, "bone.id"), parentId: parent(bone.parentId), length: number(bone.length, "length", 0.01, 10000), bind: transform2D(bone.bind) };
  });
  hierarchy(bones);
  const boneMap = unique(bones, "bones");
  const attached = new Set<string>();
  const attachments = list(value.attachments, "attachments", 256).map((item) => {
    const attachment = record(item, "attachment");
    const layerId = id(attachment.layerId, "layerId");
    const boneId = id(attachment.boneId, "boneId");
    check(layerMap.has(layerId) && boneMap.has(boneId), "Привязка ссылается на неизвестный слой/кость");
    check(!attached.has(layerId), "Слой уже привязан к кости");
    attached.add(layerId);
    return { layerId, boneId, offset: transform2D(attachment.offset) };
  });
  let keyCount = 0;
  const clips = list(value.clips, "clips", 32).map((item) => {
    const clip = record(item, "clip");
    const duration = number(clip.duration, "duration", 0.001, 3600);
    check(typeof clip.loop === "boolean", "loop: ожидается boolean");
    const targeted = new Set<string>();
    const tracks = list(clip.tracks, "tracks", 256).map((trackInput) => {
      const track = record(trackInput, "track");
      const boneId = id(track.boneId, "boneId");
      check(boneMap.has(boneId) && !targeted.has(boneId), "Track ссылается на неизвестную/повторную кость");
      targeted.add(boneId);
      let previousTime = -1;
      const keys = list(track.keys, "keys", 512, 1).map((keyInput) => {
        const key = record(keyInput, "key");
        const time = number(key.time, "key.time", 0, duration);
        check(time > previousTime, "Ключи должны иметь строго возрастающее время");
        previousTime = time;
        check(++keyCount <= 8192, "Слишком много ключевых кадров");
        return { time, transform: transform2D(key.transform), interpolation: choice(key.interpolation, ["linear", "step"] as const, "interpolation") };
      });
      return { boneId, rotationMode: choice(track.rotationMode, ["shortest", "unwrapped"] as const, "rotationMode"), keys };
    });
    return { id: id(clip.id, "clip.id"), duration, loop: clip.loop, tracks };
  });
  unique(clips, "clips");
  return { kind: "rig2d", schemaVersion: 1, canvas: {
    width: integer(canvas.width, "canvas.width", 1, 16384), height: integer(canvas.height, "canvas.height", 1, 16384)
  }, assets, layers, bones, attachments, clips };
}

export function matrix2D(transform: Transform2D): Matrix2D {
  const c = Math.cos(transform.rotation), s = Math.sin(transform.rotation);
  return [c * transform.scale[0], s * transform.scale[0], -s * transform.scale[1], c * transform.scale[1], ...transform.position];
}

export function multiply2D(a: Matrix2D, b: Matrix2D): Matrix2D {
  const result: Matrix2D = [
    a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]
  ];
  finiteMatrix(result);
  return result;
}

function sample(track: Rig2DDocument["clips"][number]["tracks"][number], time: number): Transform2D {
  const keys = track.keys;
  if (time <= keys[0].time) return keys[0].transform;
  for (let i = 1; i < keys.length; i++) {
    if (time < keys[i].time) {
      const a = keys[i-1], b = keys[i];
      if (a.interpolation === "step") return a.transform;
      const t = (time-a.time)/(b.time-a.time);
      const lerp = (x: number,y: number) => x+(y-x)*t;
      let angle = b.transform.rotation-a.transform.rotation;
      if (track.rotationMode === "shortest") angle = Math.atan2(Math.sin(angle),Math.cos(angle));
      return { position: [lerp(a.transform.position[0],b.transform.position[0]),lerp(a.transform.position[1],b.transform.position[1])],
        scale: [lerp(a.transform.scale[0],b.transform.scale[0]),lerp(a.transform.scale[1],b.transform.scale[1])], rotation: a.transform.rotation+angle*t };
    }
  }
  return keys[keys.length-1].transform;
}

/** Exact affine matrices preserve shear from non-uniform ancestor scale. */
export function evaluateRig2D(document: Rig2DDocument, options: { clipId?: string; time?: number; pose?: unknown } = {}) {
  const pose = new Map<string, Transform2D>();
  const time = number(options.time ?? 0, "time", 0, 1e6);
  if (options.clipId !== undefined) {
    const clip = document.clips.find((item) => item.id === options.clipId);
    check(clip, "Неизвестный clipId");
    const clipTime = clip.loop ? time % clip.duration : Math.min(time,clip.duration);
    for (const track of clip.tracks) pose.set(track.boneId,sample(track,clipTime));
  }
  const bonesById = new Set(document.bones.map((bone) => bone.id));
  if (options.pose !== undefined) {
    for (const [boneId,value] of Object.entries(record(options.pose,"pose"))) {
      check(bonesById.has(boneId), "Pose ссылается на неизвестную кость");
      pose.set(boneId,transform2D(value));
    }
  }
  const world = new Map<string,Matrix2D>();
  const bones = hierarchy(document.bones).map((bone) => {
    const local = matrix2D(pose.get(bone.id) ?? bone.bind);
    const matrix = bone.parentId === null ? local : multiply2D(world.get(bone.parentId)!,local);
    finiteMatrix(matrix);
    world.set(bone.id,matrix);
    return { id: bone.id, matrix, head: [matrix[4],matrix[5]], tail: [matrix[4]+matrix[0]*bone.length,matrix[5]+matrix[1]*bone.length] };
  });
  const bindings = new Map(document.attachments.map((item) => [item.layerId,item]));
  const layers = document.layers.map((layer) => {
    const binding = bindings.get(layer.id);
    const model = binding ? multiply2D(world.get(binding.boneId)!,matrix2D(binding.offset)) : matrix2D(layer.transform);
    const matrix = multiply2D(model,[1,0,0,1,-layer.pivot[0],-layer.pivot[1]]);
    return { id: layer.id, assetId: layer.assetId, visible: layer.visible, zIndex: layer.zIndex, matrix };
  }).sort((a,b) => a.zIndex-b.zIndex);
  return { units: "px", coordinates: "x-right-y-up", bones, layers };
}
