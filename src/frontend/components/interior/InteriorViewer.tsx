"use client";
import {Canvas, useFrame, useThree} from "@react-three/fiber";
import {OrbitControls, ContactShadows, Environment, Lightformer} from "@react-three/drei";
import {ACESFilmicToneMapping, Mesh, MeshStandardMaterial, type Group, type Object3D} from "three";
import {useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject} from "react";
import type {InteriorScene} from "@/shared/interior/scene";
import {detailedScene, disposeDetailed} from "@/shared/interior/detailed";
import ObjectGizmo, {type PlacementMode, type ObjectPose} from "./ObjectGizmo";
import {syncInteriorObjects} from "@/frontend/interior-render-sync";

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
  const walls=useMemo(()=>{const nodes:Object3D[]=[];model.traverse(n=>{if(n.userData.wallSide)nodes.push(n);});return nodes;},[model]);
  useFrame(() => walls.forEach(node => {
    const wall = node.userData.wallSide;
    if (wall) node.visible = node.userData.keepInCutaway || !enabled || !(wall === "south" && camera.position.z > 0 || wall === "north" && camera.position.z < 0 || wall === "east" && camera.position.x > 0 || wall === "west" && camera.position.x < 0);
  }));
  return null;
}
type Vec3 = [number, number, number];
/**
 * Where daylight enters: the sun stands outside the room's first window and shines in,
 * a weak fill comes from the opposite side, and the window glows in reflections.
 * The room is centred on the origin; openings are measured along their wall.
 */
function windowDaylight(scene: InteriorScene): {sun: Vec3; fill: Vec3; window: Vec3; facing: number} {
  const w = scene.openings.find(o => o.kind === "window");
  const hw = scene.width / 2, hl = scene.length / 2;
  if (!w) return {sun: [4, 8, 5], fill: [-4, 5, -5], window: [-hw - .2, 1.6, 0], facing: Math.PI / 2};
  const along = w.offset + w.width / 2, y = w.bottom + w.height / 2;
  const at: Vec3 = w.wall === "north" ? [along - hw, y, -hl] : w.wall === "south" ? [along - hw, y, hl] : w.wall === "west" ? [-hw, y, along - hl] : [hw, y, along - hl];
  const out: Vec3 = w.wall === "north" ? [0, 0, -1] : w.wall === "south" ? [0, 0, 1] : w.wall === "west" ? [-1, 0, 0] : [1, 0, 0];
  return {
    sun: [at[0] + out[0] * 6, at[1] + 4.5, at[2] + out[2] * 6],
    fill: [-out[0] * 6, 4, -out[2] * 6],
    window: [at[0] + out[0] * .3, at[1], at[2] + out[2] * .3],
    facing: out[0] !== 0 ? Math.PI / 2 : 0,
  };
}

function Refresh({revision}:{revision:unknown}) {
  const invalidate=useThree(s=>s.invalidate);
  useEffect(()=>invalidate(),[invalidate,revision]);
  return null;
}
export default function InteriorViewer({scene, selected, onSelect, ghostWalls, capture, resetKey = 0, mode = "select", disabled, onCommit}: {
  scene: InteriorScene; selected: string | null; onSelect: (id: string | null) => void; ghostWalls: boolean; capture: MutableRefObject<(() => Promise<Blob>) | null>; resetKey?: number;
  mode?: PlacementMode; disabled?: boolean; onCommit?: (id:string,pose:ObjectPose)=>Promise<boolean>;
}) {
  const dragging=useRef(false);
  const openingKey=JSON.stringify(scene.openings);
  const model = useMemo(() => detailedScene({...scene,objects:[]}), [scene.width,scene.length,scene.height,scene.wallColor,scene.floorColor,openingKey]);
  useLayoutEffect(()=>syncInteriorObjects(model,scene.objects.map(object=>({object,offset:[-scene.width/2,0,-scene.length/2]}))),[model,scene.objects,scene.width,scene.length]);
  useEffect(() => () => disposeDetailed(model), [model]);
  useEffect(() => {model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const m = node.material as MeshStandardMaterial;
    let owner: Object3D | null = node;
    while (owner && !owner.userData.objectId) owner = owner.parent;
    m.emissive.set(owner?.userData.objectId === selected ? "#8165c4" : "#000000");m.emissiveIntensity = .14;
  });}, [model, selected, scene.objects]);
  const extent = Math.max(scene.width, scene.length);
  const daylight = useMemo(() => windowDaylight(scene), [scene]);
  return <Canvas key={`${scene.width}/${scene.length}/${resetKey}`} frameloop="demand" shadows dpr={[1, 1.5]} gl={{antialias:true,preserveDrawingBuffer:true,toneMapping:ACESFilmicToneMapping,toneMappingExposure:1}} camera={{position:[extent*.95,extent*.85,extent*1.15],fov:38}} onPointerMissed={() => {if(!dragging.current)onSelect(null);}} aria-label="3D-модель интерьера: вращайте мышью, приближайте колёсиком">
    <Refresh revision={scene}/>
    <color attach="background" args={["#17151d"]}/>
    {/* Sky and warm floor bounce instead of a flat ambient fill. */}
    <hemisphereLight args={["#dfe8f2", "#a08a70", .55]}/>
    <ambientLight intensity={.12}/>
    {/* Daylight comes in through the room's own window and casts its shadows across the floor. */}
    <directionalLight position={daylight.sun} color="#fff1da" intensity={2.6} castShadow shadow-mapSize={[2048,2048]} shadow-bias={-.00015} shadow-normalBias={.02} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent}/>
    <directionalLight position={daylight.fill} color="#e8eef7" intensity={.35}/>
    <Environment resolution={128}>
      <Lightformer intensity={1.2} position={[0,6,0]} rotation-x={Math.PI/2} scale={[8,8,1]}/>
      <Lightformer intensity={3} color="#fff4e2" position={daylight.window} rotation-y={daylight.facing} scale={[3,2.4,1]}/>
    </Environment>
    {scene.lights.map(l => <pointLight key={l.id} position={[l.position.x-scene.width/2,l.position.y,l.position.z-scene.length/2]} color={l.color} intensity={l.intensity*2.2} distance={extent*1.8} decay={1.4}/>) }
    <primitive object={model} onClick={(e:{stopPropagation:()=>void;object:Object3D}) => {e.stopPropagation();if(dragging.current)return;let owner:Object3D|null=e.object;while(owner&&!owner.userData.objectId)owner=owner.parent;onSelect(owner?.userData.objectId??null);}}/>
    <Cutaway model={model} enabled={ghostWalls}/>
    {onCommit && <ObjectGizmo model={model} selected={selected} mode={mode} disabled={disabled} locked={scene.objects.find(o=>o.id===selected)?.locked} offset={[-scene.width/2,0,-scene.length/2]} onCommit={onCommit} onDragState={active=>{dragging.current=active;}}/>}
    <ContactShadows key={JSON.stringify(scene)} position={[0,-.14,0]} scale={extent*2.5} opacity={.45} blur={2.8} far={5} resolution={256} frames={1} color="#000000"/>
    <OrbitControls makeDefault target={[0,.8,0]} minDistance={1.5} maxDistance={extent*4} maxPolarAngle={Math.PI/2-.025}/>
    <Capture capture={capture}/>
  </Canvas>;
}
