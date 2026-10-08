"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import AmbientCanvas from "@/frontend/components/three/AmbientCanvas";
import BlueprintModel from "@/frontend/components/three/BlueprintModel";
import SideFraming from "@/frontend/components/three/SideFraming";

/**
 * The entry backdrop: the same blueprint house as the landing hero, drawing
 * itself line by line beside the form.
 *
 * It renders through `AmbientCanvas`, which caps the frame rate and stops
 * entirely when the tab is hidden, so a login screen with live WebGL costs
 * next to nothing.
 */

const VIOLET_SOFT = "#c4b5fd";
const BG = "#050507";
const FLOOR_Y = -1.55;

/** Sparse points drifting upward — assembly dust, one draw call. */
function Motes() {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = 140;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 9;
      positions[i * 3 + 1] = Math.random() * 6 - 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 9;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return buffer;
  }, []);

  useFrame((state) => {
    if (points.current) points.current.rotation.y = state.clock.elapsedTime * 0.03;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial color={VIOLET_SOFT} size={0.035} transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

function GridFloor() {
  const lines = useMemo(() => {
    const points: number[] = [];
    const span = 7;
    const step = 0.7;
    for (let i = -span; i <= span; i += step) {
      points.push(-span, 0, i, span, 0, i);
      points.push(i, 0, -span, i, 0, span);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, []);

  return (
    <lineSegments geometry={lines} position={[0, FLOOR_Y - 0.01, 0]}>
      <lineBasicMaterial color="#3b2f5c" transparent opacity={0.55} />
    </lineSegments>
  );
}

/** `lite` trades a few frames and the antialiasing for a lighter GPU load. */
export default function EntryGateScene({ lite = false }: { lite?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#050507]">
      {/* Painted instantly, before WebGL has produced a single frame. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_35%,rgba(167,139,250,0.18),transparent_55%),radial-gradient(ellipse_at_15%_85%,rgba(232,121,249,0.08),transparent_45%)]" />

      <AmbientCanvas
        fps={lite ? 24 : 30}
        camera={{ position: [6.0, 1.7, 7.0], fov: 40 }}
        gl={{ antialias: !lite }}
        className="absolute inset-0"
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 9, 22]} />
        <SideFraming desktopShift={0.2} phoneLift={0.3} />
        <BlueprintModel position={[-0.45, FLOOR_Y, -0.1]} scale={0.52} yaw={0.1} />
        <GridFloor />
        <Motes />
      </AmbientCanvas>

      {/* The form sits on the left, so the scene is faded out under it. */}
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#050507] via-[#050507]/85 to-transparent md:w-[62%]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#050507] to-transparent" />
    </div>
  );
}
