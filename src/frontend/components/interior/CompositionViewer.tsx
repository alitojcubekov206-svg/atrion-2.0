"use client";
import {useEffect, useMemo} from "react";
import {Canvas, useThree} from "@react-three/fiber";
import {Environment, Lightformer, OrbitControls} from "@react-three/drei";
import {ACESFilmicToneMapping, Box3, Vector3, type Group} from "three";
import {buildComposition} from "@/frontend/composition-model";
import {disposeDetailed} from "@/shared/interior/detailed";
import type {LocalModelResult} from "@/shared/design/result";

function Scene({model}: {model: Group}) {
  const {camera, size} = useThree();
  const bounds = useMemo(() => new Box3().setFromObject(model), [model]);
  const center = useMemo(() => bounds.getCenter(new Vector3()), [bounds]);
  const extent = Math.max(...bounds.getSize(new Vector3()).toArray(), 1);
  useEffect(() => {camera.position.copy(center).add(new Vector3(.8, .9, 1).normalize().multiplyScalar(extent * 1.6 * Math.max(1, size.height / size.width))); camera.lookAt(center); camera.updateProjectionMatrix();}, [camera, size, center, extent]);
  return <><primitive object={model}/><OrbitControls makeDefault target={center} minDistance={.2} maxDistance={extent * 8}/>
    <directionalLight position={[extent, extent * 2, extent]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-normalBias={.03} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent} shadow-camera-far={extent * 6}/></>;
}
export default function CompositionViewer({result}: {result: LocalModelResult}) {
  const model = useMemo(() => buildComposition(result), [result]);
  useEffect(() => () => disposeDetailed(model), [model]);
  return <Canvas shadows dpr={[1, 1.5]} camera={{fov: 42, near: .02, far: 1500}} gl={{antialias: true, toneMapping: ACESFilmicToneMapping}} aria-label="Сцена по тексту: вращайте мышью и приближайте колёсиком">
    <color attach="background" args={["#19171f"]}/><ambientLight intensity={.6}/><hemisphereLight args={["#fff6df", "#96948e", .8]}/>
    <Environment resolution={64}><Lightformer intensity={2} position={[0, 15, 0]} rotation-x={Math.PI / 2} scale={[16, 16, 1]}/></Environment><Scene model={model}/>
  </Canvas>;
}
