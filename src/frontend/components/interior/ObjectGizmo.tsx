"use client";
import {useMemo, useRef} from "react";
import {useThree} from "@react-three/fiber";
import {TransformControls} from "@react-three/drei";
import {type Euler, type Vector3, type Group, type Object3D} from "three";
export type PlacementMode = "select" | "translate" | "rotate";
export type ObjectPose = {position: {x:number;y:number;z:number}; angle:number};
export default function ObjectGizmo({model, selected, mode, locked, disabled, offset, onCommit,onDragState}: {
  model: Group; selected: string | null; mode: PlacementMode; locked?: boolean; disabled?: boolean;
  offset: [number,number,number]; onCommit: (id:string, pose:ObjectPose) => Promise<boolean>;
  onDragState?:(active:boolean)=>void;
}) {
  const {invalidate} = useThree();
  const before = useRef<{position:Vector3;rotation:Euler} | null>(null);
  const object = useMemo(() => {
    let found: Object3D | undefined;
    model.traverse(node => {if (selected && node.userData.objectId === selected) found = node;});
    return found;
  }, [model, selected]);
  if (!object || !selected || mode === "select" || locked || disabled) return null;
  return <TransformControls object={object} mode={mode} size={.8} showX={mode === "translate"} showY={mode === "rotate"} showZ={mode === "translate"}
    onMouseDown={() => {onDragState?.(true);before.current = {position:object.position.clone(),rotation:object.rotation.clone()};}}
    onMouseUp={() => {
      const snapshot = before.current; before.current = null; if (!snapshot) return;
      requestAnimationFrame(()=>onDragState?.(false));
      if(object.position.distanceToSquared(snapshot.position)<1e-10&&Math.abs(object.rotation.y-snapshot.rotation.y)<1e-7)return;
      const pose = {position:{x:object.position.x-offset[0],y:object.position.y-offset[1],z:object.position.z-offset[2]},angle:object.rotation.y};
      void onCommit(selected, pose).then(ok => {if (!ok) {object.position.copy(snapshot.position);object.rotation.copy(snapshot.rotation);invalidate();}})
        .catch(() => {object.position.copy(snapshot.position);object.rotation.copy(snapshot.rotation);invalidate();});
    }}/>;
}
