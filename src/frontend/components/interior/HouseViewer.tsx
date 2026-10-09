"use client";
import {useEffect,useLayoutEffect,useMemo,useRef} from "react";
import {Canvas,useThree} from "@react-three/fiber";
import {Environment,Lightformer,OrbitControls,Html} from "@react-three/drei";
import {ACESFilmicToneMapping,Vector3,type Object3D} from "three";
import type {LocalModelResult} from "@/shared/design/result";
import {buildFurnishedHouse,type HouseView} from "@/frontend/house-model";
import {disposeDetailed} from "@/shared/interior/detailed";
import ObjectGizmo,{type PlacementMode,type ObjectPose} from "./ObjectGizmo";
import {syncInteriorObjects} from "@/frontend/interior-render-sync";

function Refresh({revision}:{revision:unknown}) {
  const invalidate=useThree(s=>s.invalidate);
  useEffect(()=>invalidate(),[invalidate,revision]);
  return null;
}

function Fit({extent,target,plan,side}:{extent:number;target:[number,number,number];plan:boolean;side:string}) {
  const {camera,size}=useThree();
  useEffect(()=>{
    const distance=extent*(plan?1.75:2.2)*Math.max(1,size.height/size.width);
    const direction=plan?new Vector3(0,1,.0001):new Vector3(side==="west"?-1:side==="east"?1:.85,.85,side==="north"?-1:side==="south"?1:.85).normalize();
    camera.position.copy(new Vector3(...target).addScaledVector(direction,distance));camera.lookAt(...target);camera.updateProjectionMatrix();
  },[camera,size.width,size.height,extent,target,plan,side]);
  return null;
}
export default function HouseViewer({result,view,selected=null,onSelect,mode="select",onCommit}:{result:LocalModelResult;view:HouseView;selected?:string|null;onSelect?:(id:string|null)=>void;mode?:PlacementMode;onCommit?:(id:string,pose:ObjectPose)=>Promise<boolean>}) {
  const dragging=useRef(false);
  const model=useMemo(()=>buildFurnishedHouse(result,view,false),[result.document,view.floor,view.plan]);
  useLayoutEffect(()=>{
    const doc=result.document!,elevation=view.floor===null?0:view.floor*(doc.floorHeight+.2);
    syncInteriorObjects(model,(result.interiors??[]).filter(r=>view.floor===null||r.floorId===doc.floors[view.floor]?.id).flatMap(r=>r.scene.objects.map(object=>({object,offset:[r.origin[0],r.origin[1]-elevation,r.origin[2]] as [number,number,number]}))));
  },[model,result.interiors,result.document,view.floor]);
  useEffect(()=>()=>disposeDetailed(model),[model]);
  const doc=result.document!,floor=view.floor===null?undefined:doc.floors[view.floor],room=floor?.rooms.find(r=>r.id===view.roomId);
  const extent=room?Math.max(room.width,room.depth)*1.25:view.floor===null?Math.max(result.concept.dimensions.width,result.concept.dimensions.depth,result.concept.dimensions.height):Math.max(doc.width,doc.depth);
  const height=result.concept.dimensions.height;
  const selectedRoom=result.interiors?.find(r=>r.scene.objects.some(o=>o.id===selected));
  const objectOffset:[number,number,number]=selectedRoom?[selectedRoom.origin[0],selectedRoom.origin[1]-(view.floor===null?0:view.floor*(doc.floorHeight+.2)),selectedRoom.origin[2]]:[0,0,0];
  const target=useMemo<[number,number,number]>(()=>room?[room.x+room.width/2-doc.width/2,.6,room.z+room.depth/2-doc.depth/2]:[0,view.floor===null?height/2:.4,0],[room,doc,view.floor,height]);
  return <Canvas frameloop="demand" shadows dpr={[1,1.5]} gl={{antialias:true,toneMapping:ACESFilmicToneMapping,toneMappingExposure:1}} camera={{position:[15,18,20],fov:42,near:.05,far:800}} aria-label="Дом с обстановкой: вращайте мышью, приближайте колёсиком">
    <Refresh revision={result}/>
    <color attach="background" args={["#19171f"]}/>
    <ambientLight intensity={.65}/>
    <hemisphereLight args={["#fff6df","#96948e",.85]}/>
    <directionalLight position={[8,16,10]} color="#fff3de" intensity={2.2} castShadow shadow-mapSize={[2048,2048]} shadow-normalBias={.03} shadow-camera-left={-doc.width} shadow-camera-right={doc.width} shadow-camera-top={doc.depth} shadow-camera-bottom={-doc.depth}/>
    <Environment resolution={64}><Lightformer intensity={2} position={[0,15,0]} rotation-x={Math.PI/2} scale={[16,16,1]}/></Environment>
    <primitive object={model} onClick={(e:{stopPropagation:()=>void;object:Object3D})=>{if(!onSelect)return;e.stopPropagation();if(dragging.current)return;let owner:Object3D|null=e.object;while(owner&&!owner.userData.objectId)owner=owner.parent;onSelect(owner?.userData.objectId??null);}}/>
    {onCommit&&<ObjectGizmo model={model} selected={selected} mode={mode} locked={selectedRoom?.scene.objects.find(o=>o.id===selected)?.locked} offset={objectOffset} onCommit={onCommit} onDragState={active=>{dragging.current=active;}}/>}
    {floor?.rooms.filter(r=>!room||r.id===room.id).map(r=><Html key={r.id} center position={[r.x+r.width/2-doc.width/2,.27,r.z+r.depth/2-doc.depth/2]} style={{pointerEvents:"none"}}><span className="whitespace-nowrap rounded-md bg-black/60 px-2 py-1 text-[10px] text-white">{r.name}</span></Html>)}
    <OrbitControls makeDefault target={target} minDistance={1} maxDistance={Math.max(doc.width,doc.depth)*5} maxPolarAngle={Math.PI/2-.02}/>
    <Fit extent={extent} target={target} plan={view.plan===true} side={doc.floors[0].openings.find(o=>o.id==="entry")?.side??"south"}/>
  </Canvas>;
}
