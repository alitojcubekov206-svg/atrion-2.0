"use client";
import {Canvas, useFrame, useThree} from "@react-three/fiber";
import {OrbitControls, ContactShadows, Environment, Lightformer} from "@react-three/drei";
import {ACESFilmicToneMapping, Mesh, MeshStandardMaterial, type Group, type Object3D} from "three";
import {useEffect, useMemo, useRef, type MutableRefObject} from "react";
import type {InteriorScene} from "@/shared/interior/scene";
import {detailedScene, disposeDetailed} from "@/shared/interior/detailed";
import ObjectGizmo, {type PlacementMode, type ObjectPose} from "./ObjectGizmo";

function Capture({capture}: {capture: MutableRefObject<(() => Promise<Blob>) | null>}) {
  const {gl, scene, camera} = useThree();
  useEffect(() => {
    capture.current = () => {gl.render(scene, camera); return new Promise((resolve, reject) => gl.domElement.toBlob(b => b ? resolve(b) : reject(new Error("Не удалось сохранить PNG")), "image/png"));};
    return () => {capture.current = null;};
  }, [capture, gl, scene, camera]);
  return null;
}
function Cutaway({model, enabled}: {model: Group; enabled: boolean}) {
  const {camera} = useThree();
  useFrame(() => model.traverse(node => {
    const wall = node.userData.wallSide;
    if (wall) node.visible = node.userData.keepInCutaway || !enabled || !(wall === "south" && camera.position.z > 0 || wall === "north" && camera.position.z < 0 || wall === "east" && camera.position.x > 0 || wall === "west" && camera.position.x < 0);
  }));
  return null;
}
export default function InteriorViewer({scene, selected, onSelect, ghostWalls, capture, resetKey = 0, mode = "select", disabled, onCommit}: {
  scene: InteriorScene; selected: string | null; onSelect: (id: string | null) => void; ghostWalls: boolean; capture: MutableRefObject<(() => Promise<Blob>) | null>; resetKey?: number;
  mode?: PlacementMode; disabled?: boolean; onCommit?: (id:string,pose:ObjectPose)=>Promise<boolean>;
}) {
  const dragging=useRef(false);
  const model = useMemo(() => detailedScene(scene), [scene]);
  useEffect(() => () => disposeDetailed(model), [model]);
  useEffect(() => {model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const m = node.material as MeshStandardMaterial;
    let owner: Object3D | null = node;
    while (owner && !owner.userData.objectId) owner = owner.parent;
    m.emissive.set(owner?.userData.objectId === selected ? "#8165c4" : "#000000");m.emissiveIntensity = .14;
  });}, [model, selected]);
  const extent = Math.max(scene.width, scene.length);
  return <Canvas key={`${scene.width}/${scene.length}/${resetKey}`} shadows dpr={[1, 1.75]} gl={{antialias:true,preserveDrawingBuffer:true,toneMapping:ACESFilmicToneMapping,toneMappingExposure:1}} camera={{position:[extent*.95,extent*.85,extent*1.15],fov:38}} onPointerMissed={() => {if(!dragging.current)onSelect(null);}} aria-label="3D-модель интерьера: вращайте мышью, приближайте колёсиком">
    <color attach="background" args={["#17151d"]}/>
    <ambientLight intensity={.35}/>
    <directionalLight position={[4,8,5]} color="#fff2df" intensity={2.4} castShadow shadow-mapSize={[2048,2048]} shadow-bias={-.00015} shadow-normalBias={.02} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent}/>
    <Environment resolution={128}>
      <Lightformer intensity={2.5} position={[0,6,0]} rotation-x={Math.PI/2} scale={[8,8,1]}/>
      <Lightformer intensity={2} position={[-6,3,0]} rotation-y={Math.PI/2} scale={[4,5,1]}/>
    </Environment>
    {scene.lights.map(l => <pointLight key={l.id} position={[l.position.x-scene.width/2,l.position.y,l.position.z-scene.length/2]} color={l.color} intensity={l.intensity*2}/>) }
    <primitive object={model} onClick={(e:{stopPropagation:()=>void;object:Object3D}) => {e.stopPropagation();if(dragging.current)return;let owner:Object3D|null=e.object;while(owner&&!owner.userData.objectId)owner=owner.parent;onSelect(owner?.userData.objectId??null);}}/>
    <Cutaway model={model} enabled={ghostWalls}/>
    {onCommit && <ObjectGizmo model={model} selected={selected} mode={mode} disabled={disabled} locked={scene.objects.find(o=>o.id===selected)?.locked} offset={[-scene.width/2,0,-scene.length/2]} onCommit={onCommit} onDragState={active=>{dragging.current=active;}}/>}
    <ContactShadows key={JSON.stringify(scene)} position={[0,-.14,0]} scale={extent*2.5} opacity={.45} blur={2.8} far={5} resolution={256} frames={1} color="#000000"/>
    <OrbitControls makeDefault target={[0,.8,0]} minDistance={1.5} maxDistance={extent*4} maxPolarAngle={Math.PI/2-.025}/>
    <Capture capture={capture}/>
  </Canvas>;
}
