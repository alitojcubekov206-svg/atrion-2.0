import { DesignError, check, choice, finiteMatrix, hierarchy, id, integer, list, number, parent, record, text, unique, vector2, version } from "./validation";
import { deformerChain, deformPoint, parseDeformers, type Deformer2D } from "./deformers";
import { applyParameters, parameterValues, parseParameters, parseParameterTracks, type Parameter2D, type ParameterTrack2D } from "./parameters";

export type Transform2D = { position: [number, number]; rotation: number; scale: [number, number] };
export type Matrix2D = [number, number, number, number, number, number];
export type Bone2D = { id: string; parentId: string | null; length: number; bind: Transform2D };
export type Skin2D = {
  /** Rest geometry in asset pixels, +y up; placement comes from the layer. */
  vertices: [number, number][];
  /** Independent texture coordinates; absent in legacy documents (use vertices). */
  uv?: [number, number][];
  triangles: [number, number, number][];
  weights: { boneId: string; weight: number }[][];
};
export type Rig2DDocument = {
  kind: "rig2d"; schemaVersion: 1; canvas: { width: number; height: number };
  assets: { id: string; uri: string; mime: "image/png" | "image/webp"; width: number; height: number }[];
  layers: { id: string; assetId: string; zIndex: number; visible: boolean; pivot: [number, number]; transform: Transform2D; skin?: Skin2D; deformerId?:string }[];
  deformers?:Deformer2D[];
  parameters?:Parameter2D[];
  bones: Bone2D[];
  attachments: { layerId: string; boneId: string; offset: Transform2D }[];
  clips: { id: string; name?:string; duration: number; loop: boolean; parameterTracks?:ParameterTrack2D[]; tracks: {
    boneId: string; rotationMode: "shortest" | "unwrapped";
    keys: { time: number; transform: Transform2D; interpolation: "linear" | "step" }[];
  }[] }[];
  pose?: Record<string, Transform2D>;
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
    const uri = text(asset.uri, "asset.uri", typeof asset.uri === "string" && asset.uri.startsWith("data:") ? 350000 : 2048);
    if (uri.startsWith("data:")) {
      const match = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
      check(match && match[1] === asset.mime, "Допустимы только встроенные PNG/WebP с согласованным MIME");
      let bytes: string;
      try { bytes = atob(match[2]); } catch { throw new DesignError("Некорректный base64 ассета"); }
      check(bytes.length <= 262144, "Изображение превышает 256 KiB");
      check(match[1] === "image/png" ? bytes.startsWith("\x89PNG\r\n\x1a\n") : bytes.startsWith("RIFF") && bytes.slice(8,12) === "WEBP", "Сигнатура изображения не совпадает с MIME");
    } else {
      let url: URL;
      try { url = new URL(uri); } catch { throw new DesignError("Некорректный asset URI"); }
      check(url.protocol === "https:" && !url.username && !url.password, "Ассеты должны иметь HTTPS URL без учётных данных или встроенный PNG/WebP");
    }
    return { id: id(asset.id, "asset.id"), uri, mime: choice(asset.mime, ["image/png", "image/webp"] as const, "mime"),
      width: integer(asset.width, "asset.width", 1, 8192), height: integer(asset.height, "asset.height", 1, 8192) };
  });
  const assetMap = unique(assets, "assets");
  const deformers=value.deformers===undefined?undefined:parseDeformers(value.deformers);
  const deformerIds=new Set(deformers?.map(d=>d.id));
  const parameters=value.parameters===undefined?undefined:parseParameters(value.parameters,deformers??[]);
  let vertexCount=0,triangleCount=0;
  const layers = list(value.layers, "layers", 256).map((item) => {
    const layer = record(item, "layer");
    const assetId = id(layer.assetId, "assetId");
    check(assetMap.has(assetId), `Неизвестный asset ${assetId}`);
    check(typeof layer.visible === "boolean", "visible: ожидается boolean");
    let skin:Skin2D|undefined;
    if(layer.skin!==undefined){
      const input=record(layer.skin,"skin"),asset=assetMap.get(assetId)!;
      const vertices=list(input.vertices,"skin.vertices",4096,3).map((p)=>{
        const point=vector2(p,"skin.vertex");
        check(point[0]>=0&&point[0]<=asset.width&&point[1]>=0&&point[1]<=asset.height,"Вершина выходит за границы ассета");return point;
      });
      const triangles=list(input.triangles,"skin.triangles",8192,1).map((p):[number,number,number]=>{
        check(Array.isArray(p)&&p.length===3,"Треугольник должен иметь три индекса");
        const indices=p.map((i)=>integer(i,"skin.index",0,vertices.length-1)) as [number,number,number];
        const [a,b,c]=indices.map((i)=>vertices[i]);
        check(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))>1e-6,"Вырожденный треугольник");return indices;
      });
      const weights=list(input.weights,"skin.weights",4096).map((entry)=>{
        const seen=new Set<string>();const values=list(entry,"skin.influences",4,1).map((raw)=>{
          const item=record(raw,"skin.influence"),boneId=id(item.boneId,"skin.boneId");
          check(!seen.has(boneId),"Повторная кость в весах");seen.add(boneId);
          return {boneId,weight:number(item.weight,"skin.weight",0.000001,1)};
        });
        check(Math.abs(values.reduce((sum,item)=>sum+item.weight,0)-1)<1e-6,"Сумма весов должна быть 1");return values;
      });
      check(weights.length===vertices.length,"Каждой вершине нужны веса");
      vertexCount+=vertices.length;triangleCount+=triangles.length;
      check(vertexCount<=8192&&triangleCount<=16384,"Превышен общий бюджет сеток");
      const uv=input.uv===undefined?undefined:list(input.uv,"skin.uv",4096,3).map((p)=>{
        const point=vector2(p,"skin.uv");
        check(point[0]>=0&&point[0]<=asset.width&&point[1]>=0&&point[1]<=asset.height,"UV выходит за границы ассета");return point;
      });
      if(uv){
        check(uv.length===vertices.length,"Каждой вершине нужна UV-координата");
        for(const [i,j,k] of triangles){const [a,b,c]=[uv[i],uv[j],uv[k]];check(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))>1e-6,"Вырожденный UV-треугольник");}
      }
      skin={vertices,triangles,weights,...(uv?{uv}:{})};
    }
    const deformerId=layer.deformerId===undefined?undefined:id(layer.deformerId,"layer.deformerId");
    if(deformerId){check(deformerIds.has(deformerId),"Неизвестный деформер слоя");check(skin,"Для деформера сначала создайте сетку слоя");}
    return { id: id(layer.id, "layer.id"), assetId, visible: layer.visible, ...(skin?{skin}:{}),...(deformerId?{deformerId}:{}),
      zIndex: integer(layer.zIndex, "zIndex", -10000, 10000), pivot: vector2(layer.pivot, "pivot"), transform: transform2D(layer.transform) };
  });
  const layerMap = unique(layers, "layers");
  const bones = list(value.bones, "bones", 256, 1).map((item) => {
    const bone = record(item, "bone");
    return { id: id(bone.id, "bone.id"), parentId: parent(bone.parentId), length: number(bone.length, "length", 0.01, 10000), bind: transform2D(bone.bind) };
  });
  hierarchy(bones);
  const boneMap = unique(bones, "bones");
  for(const layer of layers)for(const weights of layer.skin?.weights??[])for(const item of weights)check(boneMap.has(item.boneId),"Вес ссылается на неизвестную кость");
  const attached = new Set<string>();
  const attachments = list(value.attachments, "attachments", 256).map((item) => {
    const attachment = record(item, "attachment");
    const layerId = id(attachment.layerId, "layerId");
    const boneId = id(attachment.boneId, "boneId");
    check(layerMap.has(layerId) && boneMap.has(boneId), "Привязка ссылается на неизвестный слой/кость");
    check(!layerMap.get(layerId)!.skin,"Слой с весами не допускает жёсткую привязку");
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
    const parameterTracks=clip.parameterTracks===undefined?undefined:parseParameterTracks(clip.parameterTracks,parameters??[],duration);
    keyCount+=parameterTracks?.reduce((n,t)=>n+t.keys.length,0)??0;check(keyCount<=8192,"Слишком много ключевых кадров");
    return { id: id(clip.id, "clip.id"), ...(clip.name===undefined?{}:{name:text(clip.name,"clip.name")}), duration, loop: clip.loop, tracks,...(parameterTracks?{parameterTracks}:{}) };
  });
  unique(clips, "clips");
  const pose:Record<string,Transform2D>={};
  if(value.pose!==undefined)for(const [boneId,transform] of Object.entries(record(value.pose,"pose"))) {
    check(boneMap.has(boneId),"Неизвестная кость pose");
    Object.defineProperty(pose,boneId,{value:transform2D(transform),enumerable:true,writable:true,configurable:true});
  }
  return { kind: "rig2d", schemaVersion: 1, canvas: {
    width: integer(canvas.width, "canvas.width", 1, 16384), height: integer(canvas.height, "canvas.height", 1, 16384)
  }, assets, layers, bones, attachments, clips, ...(deformers?{deformers}:{}), ...(parameters?{parameters}:{}), ...(value.pose===undefined?{}:{pose}) };
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

export function inverseMatrix2D(m:Matrix2D):Matrix2D {
  const det=m[0]*m[3]-m[1]*m[2];check(Math.abs(det)>1e-12,"Преобразование кости необратимо");
  return [m[3]/det,-m[1]/det,-m[2]/det,m[0]/det,(m[2]*m[5]-m[3]*m[4])/det,(m[1]*m[4]-m[0]*m[5])/det];
}
export function point2D(m:Matrix2D,p:readonly number[]):[number,number] {
  return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
}

export function sample2DTrack(track: Rig2DDocument["clips"][number]["tracks"][number], time: number): Transform2D {
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
export function evaluateRig2D(document: Rig2DDocument, options: { clipId?: string; time?: number; pose?: unknown;parameterValues?:unknown } = {}) {
  const pose = new Map<string, Transform2D>();
  const time = number(options.time ?? 0, "time", 0, 1e6);
  let parameterTracks:ParameterTrack2D[]=[],parameterTime=time;
  if (options.clipId !== undefined) {
    const clip = document.clips.find((item) => item.id === options.clipId);
    check(clip, "Неизвестный clipId");
    const clipTime = clip.loop ? time % clip.duration : Math.min(time,clip.duration);
    parameterTracks=clip.parameterTracks??[];parameterTime=clipTime;
    for (const track of clip.tracks) pose.set(track.boneId,sample2DTrack(track,clipTime));
  }
  const bonesById = new Set(document.bones.map((bone) => bone.id));
  const poseInput=options.pose ?? (options.clipId===undefined ? document.pose : undefined);
  if (poseInput !== undefined) {
    for (const [boneId,value] of Object.entries(record(poseInput,"pose"))) {
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
  const values=parameterValues(document.parameters??[],parameterTracks,parameterTime,options.parameterValues??{});
  const deformers=applyParameters(document.deformers??[],document.parameters??[],values);
  const deltas=new Map<string,Matrix2D>(),bindWorld=new Map<string,Matrix2D>();
  if(document.layers.some((layer)=>layer.skin))for(const bone of hierarchy(document.bones)){
    const local=matrix2D(bone.bind),bind=bone.parentId?multiply2D(bindWorld.get(bone.parentId)!,local):local;
    bindWorld.set(bone.id,bind);deltas.set(bone.id,multiply2D(world.get(bone.id)!,inverseMatrix2D(bind)));
  }
  const layers = document.layers.map((layer) => {
    const binding = bindings.get(layer.id);
    const model = binding ? multiply2D(world.get(binding.boneId)!,matrix2D(binding.offset)) : matrix2D(layer.transform);
    const matrix = multiply2D(model,[1,0,0,1,-layer.pivot[0],-layer.pivot[1]]);
    const chain=layer.deformerId?deformerChain(deformers,layer.deformerId):[];
    const skin=layer.skin?{
      uv:layer.skin.uv??layer.skin.vertices,triangles:layer.skin.triangles,
      vertices:layer.skin.vertices.map((p,index):[number,number]=>{
        const rest=chain.reduce((point,d)=>deformPoint(d,point),point2D(matrix,p)),point:[number,number]=[0,0];
        for(const influence of layer.skin!.weights[index]){
          const moved=point2D(deltas.get(influence.boneId)!,rest);point[0]+=moved[0]*influence.weight;point[1]+=moved[1]*influence.weight;
        }
        finiteMatrix(point);return point;
      })
    }:undefined;
    return { id: layer.id, assetId: layer.assetId, visible: layer.visible, zIndex: layer.zIndex, matrix, ...(skin?{skin}:{}) };
  }).sort((a,b) => a.zIndex-b.zIndex);
  return { units: "px", coordinates: "x-right-y-up", bones, layers,...(document.parameters?{parameterValues:values}:{}) };
}
