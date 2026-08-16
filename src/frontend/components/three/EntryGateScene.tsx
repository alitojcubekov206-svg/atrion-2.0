"use client";

import { Edges, Float } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import * as THREE from "three";
import AmbientCanvas from "@/frontend/components/three/AmbientCanvas";

/**
 * The entry backdrop: a real model, quietly assembling itself.
 *
 * It is deliberately small — around twenty meshes, no shadows, no
 * post-processing — and it renders through `AmbientCanvas`, which caps the
 * frame rate and stops entirely when the tab is hidden. That is what keeps a
 * login screen with live WebGL from costing anything noticeable.
 */

const VIOLET = "#a78bfa";
const VIOLET_SOFT = "#c4b5fd";
const MAGENTA = "#e879f9";
const BG = "#050507";

/** One storey of the holographic tower: a solid slab plus a glowing outline. */
function Storey({
  y,
  width,
  depth,
  height,
  hue,
}: {
  y: number;
  width: number;
  depth: number;
  height: number;
  hue: string;
}) {
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial
        color="#241d33"
        emissive={hue}
        emissiveIntensity={0.22}
        metalness={0.35}
        roughness={0.45}
        transparent
        opacity={0.82}
      />
      <Edges color={hue} threshold={20} />
    </mesh>
  );
}

function Tower() {
  const group = useRef<Group>(null);

  // The silhouette is fixed, so the storeys are computed once.
  const storeys = useMemo(
    () =>
      [
        { y: 0.0, width: 2.6, depth: 2.2, height: 0.24, hue: VIOLET },
        { y: 0.5, width: 2.2, depth: 1.9, height: 0.7, hue: VIOLET_SOFT },
        { y: 1.25, width: 2.0, depth: 1.7, height: 0.72, hue: VIOLET },
        { y: 2.0, width: 1.7, depth: 1.45, height: 0.7, hue: VIOLET_SOFT },
        { y: 2.68, width: 1.15, depth: 1.0, height: 0.6, hue: MAGENTA },
      ] as const,
    []
  );

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = t * 0.12;
    group.current.position.y = Math.sin(t * 0.6) * 0.06 - 0.4;
  });

  return (
    <group ref={group}>
      {storeys.map((storey) => (
        <Storey key={storey.y} {...storey} />
      ))}

      {/* Glazing on the tallest volume — the one detail that reads as a facade. */}
      <mesh position={[0, 1.25, 0.86]}>
        <boxGeometry args={[1.5, 0.44, 0.04]} />
        <meshStandardMaterial
          color={VIOLET_SOFT}
          emissive={VIOLET}
          emissiveIntensity={1.1}
          transparent
          opacity={0.5}
          roughness={0.1}
        />
      </mesh>

      {/* Mast */}
      <mesh position={[0, 3.25, 0]}>
        <cylinderGeometry args={[0.02, 0.03, 0.8, 8]} />
        <meshBasicMaterial color={MAGENTA} />
      </mesh>
      <mesh position={[0, 3.68, 0]}>
        <sphereGeometry args={[0.07, 12, 10]} />
        <meshBasicMaterial color={MAGENTA} />
      </mesh>

      {/* Orbiting guides */}
      <Float speed={1.2} floatIntensity={0.5} rotationIntensity={0.15}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 1.4, 0]}>
          <torusGeometry args={[2.5, 0.012, 8, 72]} />
          <meshBasicMaterial color={VIOLET_SOFT} transparent opacity={0.6} />
        </mesh>
      </Float>
      <Float speed={0.9} floatIntensity={0.35} rotationIntensity={0.12}>
        <mesh rotation={[Math.PI / 2.6, 0.3, 0.15]} position={[0, 1.5, 0]}>
          <torusGeometry args={[2.95, 0.008, 8, 72]} />
          <meshBasicMaterial color={MAGENTA} transparent opacity={0.4} />
        </mesh>
      </Float>
    </group>
  );
}

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
    <lineSegments geometry={lines} position={[0, -1.55, 0]}>
      <lineBasicMaterial color="#3b2f5c" transparent opacity={0.55} />
    </lineSegments>
  );
}

export default function EntryGateScene() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#050507]">
      {/* Painted instantly, before WebGL has produced a single frame. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_35%,rgba(167,139,250,0.18),transparent_55%),radial-gradient(ellipse_at_15%_85%,rgba(232,121,249,0.08),transparent_45%)]" />

      <AmbientCanvas
        fps={30}
        camera={{ position: [5.4, 2.6, 6.4], fov: 40 }}
        className="absolute inset-0"
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 9, 22]} />
        <hemisphereLight args={["#e9d5ff", BG, 0.85]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[6, 9, 5]} intensity={1.8} color="#faf5ff" />
        <pointLight position={[-5, 3, -2]} intensity={40} color={VIOLET} distance={22} decay={1.6} />
        <Tower />
        <GridFloor />
        <Motes />
      </AmbientCanvas>

      {/* The form sits on the left, so the scene is faded out under it. */}
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#050507] via-[#050507]/85 to-transparent md:w-[62%]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#050507] to-transparent" />
    </div>
  );
}
