import {Group, Mesh, MeshStandardMaterial} from "three";
import {GLTFExporter} from "three/examples/jsm/exporters/GLTFExporter.js";
import {buildConceptScene} from "./export-3d";
import {detailedAsset,disposeDetailed,surfaceTexture} from "@/shared/interior/detailed";
import type {LocalModelResult} from "@/shared/design/result";
import {prepareExportTangents} from "@/shared/interior/export-tangents";
export type HouseView = {floor: number | null; plan?: boolean; roomId?: string | null};

/** The same detailed furniture is used in the house viewer and its full GLB. */
export function buildFurnishedHouse(result: LocalModelResult, view: HouseView = {floor:null}): Group {
  const doc=result.document!;
  const floor=view.floor===null?undefined:doc.floors[view.floor];
  const elevation=view.floor===null?0:view.floor*(doc.floorHeight+.2);
  const parts=result.concept.parts.filter(p=>p.role!=="furniture"&&(!floor||p.group===floor.id)).flatMap(p=>{
    const bottom=p.position[1]-elevation-p.size[1]/2;
    const trim=floor&&["wall","opening-frame","window","door","door-detail","door-hardware","facade","porch"].includes(p.role??"");
    const height=trim?Math.min(p.size[1],(view.plan ? .4 : 1.2)-bottom):p.size[1];
    return height<=0?[]:[{...p,position:[p.position[0],bottom+height/2,p.position[2]] as [number,number,number],size:[p.size[0],height,p.size[2]] as [number,number,number]}];
  });
  const root=buildConceptScene({...result.concept,parts});
  const floorMap=surfaceTexture("floor");floorMap.repeat.set(doc.width/1.1,doc.depth/2.4);
  let floorMapUsed=false;
  root.traverse(n=>{if(n instanceof Mesh&&n.userData.role==="floor-finish") {const m=n.material as MeshStandardMaterial;m.map=floorMap;m.roughness=.7;floorMapUsed=true;}});
  if(!floorMapUsed)floorMap.dispose();
  const cache=new Map<string,Group>();
  for(const room of result.interiors??[]) {
    if(floor&&room.floorId!==floor.id)continue;
    const holder=new Group();holder.name=`${room.floorId} · ${room.name}`;holder.userData.roomId=room.roomId;
    holder.position.set(room.origin[0],room.origin[1]-elevation,room.origin[2]);
    for(const item of room.scene.objects) {
      const key=`${item.assetId}:${item.color}`;
      let template=cache.get(key);if(!template){template=detailedAsset(item.assetId,item.color);cache.set(key,template);}
      const model=new Group();model.add(template.clone(true));model.name=item.id;model.userData.objectId=item.id;
      model.position.set(item.position.x,item.position.y,item.position.z);model.rotation.y=item.rotation.y;model.scale.set(item.scale.x,item.scale.y,item.scale.z);
      model.traverse(n=>{if(n instanceof Mesh){n.castShadow=n.receiveShadow=true;}});holder.add(model);
    }
    root.add(holder);
  }
  root.updateMatrixWorld(true);
  return root;
}
export async function exportFurnishedHouse(result: LocalModelResult): Promise<Blob> {
  const root=buildFurnishedHouse(result);
  try {
    await prepareExportTangents(root);
    const data=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});
    if(!(data instanceof ArrayBuffer))throw new Error("Invalid GLB");
    return new Blob([data],{type:"model/gltf-binary"});
  } finally {disposeDetailed(root);}
}
