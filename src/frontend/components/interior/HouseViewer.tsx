"use client";
import {useEffect,useMemo} from "react";
import {Canvas,useThree} from "@react-three/fiber";
import {Environment,Lightformer,OrbitControls,Html} from "@react-three/drei";
import {ACESFilmicToneMapping,Vector3} from "three";
import type {LocalModelResult} from "@/shared/design/result";
import {buildFurnishedHouse,type HouseView} from "@/frontend/house-model";
import {disposeDetailed} from "@/shared/interior/detailed";

function Fit({extent,target,plan}:{extent:number;target:[number,number,number];plan:boolean}) {
  const {camera,size}=useThree();
  useEffect(()=>{
    const distance=extent*1.5*Math.max(1,size.height/size.width);
    const direction=plan?new Vector3(0,1,.0001):new Vector3(.85,1.15,1).normalize();
    camera.position.copy(new Vector3(...target).addScaledVector(direction,distance));camera.lookAt(...target);camera.updateProjectionMatrix();
  },[camera,size.width,size.height,extent,target,plan]);
  return null;
}
export default function HouseViewer({result,view}:{result:LocalModelResult;view:HouseView}) {
  const model=useMemo(()=>buildFurnishedHouse(result,view),[result,view.floor,view.plan]);
  useEffect(()=>()=>disposeDetailed(model),[model]);
  const doc=result.document!,floor=view.floor===null?undefined:doc.floors[view.floor],room=floor?.rooms.find(r=>r.id===view.roomId);
  const extent=room?Math.max(room.width,room.depth)*1.25:Math.max(doc.width,doc.depth,view.floor===null?result.concept.dimensions.height:0);
  const target=useMemo<[number,number,number]>(()=>room?[room.x+room.width/2-doc.width/2,.6,room.z+room.depth/2-doc.depth/2]:[0,view.floor===null?doc.floors.length*doc.floorHeight/3:.4,0],[room,doc,view.floor]);
  return <Canvas key={`${view.floor}/${view.plan}/${view.roomId??"all"}`} shadows dpr={[1,1.5]} gl={{antialias:true,preserveDrawingBuffer:true,toneMapping:ACESFilmicToneMapping,toneMappingExposure:1}} camera={{position:[15,18,20],fov:42,near:.05,far:800}} aria-label="Дом с обстановкой: вращайте мышью, приближайте колёсиком">
    <color attach="background" args={["#19171f"]}/>
    <ambientLight intensity={.65}/>
    <hemisphereLight args={["#fff6df","#96948e",.85]}/>
    <directionalLight position={[8,16,10]} color="#fff3de" intensity={2.2} castShadow shadow-mapSize={[2048,2048]} shadow-normalBias={.03} shadow-camera-left={-doc.width} shadow-camera-right={doc.width} shadow-camera-top={doc.depth} shadow-camera-bottom={-doc.depth}/>
    <Environment resolution={64}><Lightformer intensity={2} position={[0,15,0]} rotation-x={Math.PI/2} scale={[16,16,1]}/></Environment>
    <primitive object={model}/>
    {floor?.rooms.filter(r=>!room||r.id===room.id).map(r=><Html key={r.id} center position={[r.x+r.width/2-doc.width/2,.27,r.z+r.depth/2-doc.depth/2]} style={{pointerEvents:"none"}}><span className="whitespace-nowrap rounded-md bg-black/60 px-2 py-1 text-[10px] text-white">{r.name}</span></Html>)}
    <OrbitControls makeDefault target={target} minDistance={1} maxDistance={Math.max(doc.width,doc.depth)*5} maxPolarAngle={Math.PI/2-.02}/>
    <Fit extent={extent} target={target} plan={view.plan===true}/>
  </Canvas>;
}
