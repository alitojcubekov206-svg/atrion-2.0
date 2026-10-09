"use client";
import {useEffect,useMemo} from "react";
import {Canvas,useFrame} from "@react-three/fiber";
import {OrbitControls} from "@react-three/drei";
import {AnimationMixer,Box3,Vector3,ACESFilmicToneMapping,type Group,type AnimationClip} from "three";
import type {ThreeDConcept} from "@/shared/types";
import {buildConceptScene} from "@/frontend/export-3d";
import {attachLivingMotion} from "@/shared/living/motion";
import {disposeDetailed} from "@/shared/interior/detailed";

function Actor({model,clip,playing}:{model:Group;clip:AnimationClip;playing:boolean}) {
  const mixer = useMemo(() => new AnimationMixer(model),[model]);
  useEffect(() => {mixer.clipAction(clip).reset().play();return () => {mixer.stopAllAction();mixer.uncacheRoot(model);};},[mixer,model,clip]);
  useFrame((_,delta) => {if (playing) mixer.update(Math.min(delta,.05));});
  return <primitive object={model}/>;
}
export default function LivingViewer({concept,playing=true,motion=concept.motion??"idle"}:{concept:ThreeDConcept;playing?:boolean;motion?:"idle"|"walk"}) {
  const value = useMemo(() => {
    const model=buildConceptScene(concept),clips=attachLivingMotion(model,concept);
    const bounds=new Box3().setFromObject(model),center=bounds.getCenter(new Vector3());
    const extent=Math.max(...bounds.getSize(new Vector3()).toArray(),.3);
    return {model,clips,center,extent};
  },[concept]);
  useEffect(() => () => disposeDetailed(value.model),[value]);
  const {model,clips,center,extent}=value;
  return <Canvas shadows dpr={[1,1.5]} camera={{position:center.clone().add(new Vector3(.8,.6,1).normalize().multiplyScalar(extent*1.8)).toArray(),fov:42,near:.01,far:1000}} gl={{antialias:true,toneMapping:ACESFilmicToneMapping}} aria-label="Анимированная 3D-модель">
    <color attach="background" args={["#19171f"]}/><ambientLight intensity={1.2}/><hemisphereLight args={["#fff5df","#888894",1]}/><directionalLight position={[extent,extent*2,extent]} intensity={2}/>
    <Actor model={model} clip={clips[motion==="walk"?1:0]} playing={playing}/><gridHelper args={[extent*5,20,"#5c5668","#38333e"]}/>
    <OrbitControls makeDefault target={center} minDistance={extent*.3} maxDistance={extent*8}/>
  </Canvas>;
}
