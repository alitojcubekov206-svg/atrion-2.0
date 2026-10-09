import {AnimationClip, Box3, Group, Mesh, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, type KeyframeTrack} from "three";
import type {ThreeDConcept} from "../types";
import {isLivingConcept} from "./request";
type Joint = {node: Group; kind: "leg" | "arm" | "knee" | "elbow" | "head" | "tail" | "wing"; phase: number};

/** Rigid joint animation for the procedural character/animal parts. No browser or provider dependency. */
export function attachLivingMotion(root: Group, concept: ThreeDConcept): AnimationClip[] {
  if (!isLivingConcept(concept)) return [];
  if (root.userData.livingRig) return root.animations;
  const parts = new Map(concept.parts.map(p => [p.id, p]));
  const meshes: Mesh[] = [];root.traverse(o => {if (o instanceof Mesh) meshes.push(o);});
  const copyIds=new Set(concept.parts.map(p=>/^c\d+-/.exec(p.id)?.[0]).filter((id):id is string=>Boolean(id)));
  if(copyIds.size>1) {
    const clips:AnimationClip[]=[];
    for(const id of copyIds) {
      const copy=new Group();copy.name=`Atrion_${id.slice(0,-1)}`;root.add(copy);root.updateMatrixWorld(true);
      meshes.filter(m=>String(m.userData.partId).startsWith(id)).forEach(m=>copy.attach(m));
      clips.push(...attachLivingMotion(copy,{...concept,parts:concept.parts.filter(p=>p.id.startsWith(id))}));
    }
    root.animations=["Idle","Walk"].map(name=>new AnimationClip(name,name==="Walk"?1.2:3,clips.filter(c=>c.name===name).flatMap(c=>c.tracks)));
    root.userData.livingRig=true;return root.animations;
  }
  const bounds = new Box3().setFromObject(root), center = bounds.getCenter(new Vector3());
  const actor = new Group();actor.name = "Atrion_Motion";
  for (const child of [...root.children]) actor.add(child);
  root.add(actor);root.updateMatrixWorld(true);
  const joints: Joint[] = [];
  const groupOf = (m: Mesh) => parts.get(m.userData.partId)?.group;
  function joint(selected: Mesh[], kind: Joint["kind"], phase: number, pivot?: Vector3, parent = actor) {
    if (!selected.length) return;
    const b = new Box3();selected.forEach(m => b.expandByObject(m));
    const point = pivot ?? b.getCenter(new Vector3());
    if (!pivot) point.y = kind === "head" ? b.min.y : b.max.y;
    const node = new Group();node.name = `Atrion_${kind}_${joints.length}`;
    root.updateMatrixWorld(true);node.position.copy(parent.worldToLocal(point.clone()));
    parent.add(node);root.updateMatrixWorld(true);selected.forEach(m => node.attach(m));
    joints.push({node,kind,phase});
    return node;
  }
  // Attach every lower component to its nearest hip/shoulder, including mirrored/repeated instances.
  for (const [label, anchorName, kind] of [["Ноги","Бедро","leg"],["Руки","Плечо","arm"]] as const) {
    const members = meshes.filter(m => groupOf(m) === label);
    const anchors = members.filter(m => parts.get(m.userData.partId)?.name === anchorName);
    const positions = anchors.map(m => m.getWorldPosition(new Vector3()));
    positions.forEach((point, i) => {
      const selected = members.filter(m => {
        const p = m.getWorldPosition(new Vector3());
        const distances = positions.map(a => (a.x-p.x)**2 + (a.z-p.z)**2 + (kind === "arm" ? (a.y-p.y)**2*.1 : 0));
        return distances.indexOf(Math.min(...distances)) === i;
      });
      const phase = (point.x < center.x ? -1 : 1) * (positions.length > 2 && point.z < center.z ? -1 : 1) * (kind === "arm" ? -1 : 1);
      const pivot=point.clone();if(kind==="leg")pivot.y=new Box3().setFromObject(anchors[i]).max.y;
      const upper=joint(selected,kind,phase,pivot);
      const hinge=selected.find(m=>parts.get(m.userData.partId)?.name===(kind==="leg"?"Колено":"Локоть"));
      if(upper&&hinge) {
        const lowerNames=kind==="leg"?/^(Колено|Голень|Стопа|Лапа|Копыто|Палец лапы)$/:/^(Локоть|Предплечье|Кисть|Палец|Большой палец)$/;
        joint(selected.filter(m=>lowerNames.test(parts.get(m.userData.partId)?.name??"")),kind==="leg"?"knee":"elbow",phase,hinge.getWorldPosition(new Vector3()),upper);
      }
    });
  }
  joint(meshes.filter(m => ["Голова","Волосы"].includes(groupOf(m) ?? "")),"head",1);
  const tail = meshes.filter(m => groupOf(m) === "Хвост");
  joint(tail,"tail",1,tail[0]?.getWorldPosition(new Vector3()));
  const wings = meshes.filter(m => groupOf(m) === "Крылья");
  for (const side of [-1,1]) joint(wings.filter(m => Math.sign(m.getWorldPosition(new Vector3()).x-center.x) === side),"wing",side);
  const height = Math.max(.1,bounds.max.y-bounds.min.y);
  const clips = (["idle","walk"] as const).map(mode => {
    const duration = mode === "walk" ? 1.2 : 3, times = Array.from({length:9},(_,i) => i*duration/8);
    const tracks: KeyframeTrack[] = [];
    for (const {node,kind,phase} of joints) {
      const amplitude = kind === "leg" ? (mode === "walk" ? .32 : 0) : kind === "knee" ? (mode === "walk" ? .48 : 0) : kind === "elbow" ? (mode === "walk" ? .16 : .015) : kind === "arm" ? (mode === "walk" ? .28 : .025) : kind === "head" ? .045 : kind === "tail" ? .22 : .3;
      if (!amplitude) continue;
      const axis = kind === "tail" ? new Vector3(0,1,0) : kind === "wing" ? new Vector3(0,0,1) : new Vector3(1,0,0);
      const values = times.flatMap((_,i) => {
        const wave=Math.sin(i*Math.PI/4)*phase;
        const angle=kind==="knee"?Math.max(0,-wave)*amplitude:kind==="elbow"?-Math.max(0,wave)*amplitude:wave*amplitude;
        return new Quaternion().setFromAxisAngle(axis,angle).toArray();
      });
      tracks.push(new QuaternionKeyframeTrack(`${node.uuid}.quaternion`,times,values));
    }
    tracks.push(new VectorKeyframeTrack(`${actor.uuid}.position`,times,times.flatMap((_,i) => [0,(1-Math.cos(i*Math.PI/2))*height*(mode === "walk" ? .008 : .002),0])));
    return new AnimationClip(mode === "walk" ? "Walk" : "Idle",duration,tracks);
  });
  root.userData.livingRig = true;root.animations = clips;root.updateMatrixWorld(true);
  return clips;
}
