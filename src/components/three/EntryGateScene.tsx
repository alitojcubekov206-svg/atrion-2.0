"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import * as THREE from "three";

const VIOLET = "#a78bfa";
const VIOLET_HOT = "#c4b5fd";
const MAGENTA = "#e879f9";

function AssemblingTower() {
  const group = useRef<Group>(null);
  const parts = useMemo(
    () => [
      { pos: [0, -0.2, 0] as const, size: [5.2, 0.35, 3.4] as const, color: "#3b3348" },
      { pos: [0, 1.35, 0] as const, size: [4.2, 2.6, 2.6] as const, color: "#4a3f5c" },
      { pos: [2.9, 0.95, 0.2] as const, size: [1.5, 1.8, 2.0] as const, color: "#5b4a72" },
      { pos: [-2.6, 0.85, -0.1] as const, size: [1.1, 1.5, 1.8] as const, color: "#423650" },
      { pos: [0, 2.85, 0] as const, size: [4.6, 0.22, 3.0] as const, color: "#2f2740" },
      { pos: [0, 1.4, 1.34] as const, size: [3.2, 1.8, 0.08] as const, color: VIOLET_HOT, glass: true },
      { pos: [0, 3.55, 0] as const, size: [0.08, 1.1, 0.08] as const, color: MAGENTA, cyl: true },
    ],
    []
  );
  const meshes = useRef<(Mesh | null)[]>([]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = Math.sin(t * 0.22) * 0.28 + 0.55;
    group.current.position.y = Math.sin(t * 0.45) * 0.06;

    meshes.current.forEach((mesh, i) => {
      if (!mesh) return;
      const base = parts[i];
      if (!base) return;
      const breathe = Math.sin(t * 0.7 + i * 0.45) * 0.03;
      mesh.position.set(base.pos[0], base.pos[1] + breathe, base.pos[2]);
    });
  });

  return (
    <group ref={group} position={[1.6, -0.2, -0.6]} scale={1.1}>
      {parts.map((part, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          position={[...part.pos]}
        >
          {"cyl" in part && part.cyl ? (
            <cylinderGeometry args={[0.05, 0.06, part.size[1], 16]} />
          ) : (
            <boxGeometry args={[...part.size]} />
          )}
          <meshStandardMaterial
            color={part.color}
            emissive={"glass" in part && part.glass ? VIOLET : "#2a1840"}
            emissiveIntensity={"glass" in part && part.glass ? 1.1 : 0.35}
            metalness={"glass" in part && part.glass ? 0.05 : 0.25}
            roughness={"glass" in part && part.glass ? 0.1 : 0.45}
            transparent={"glass" in part && part.glass}
            opacity={"glass" in part && part.glass ? 0.55 : 1}
          />
        </mesh>
      ))}

      <Float speed={1.2} floatIntensity={0.5} rotationIntensity={0.25}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 1.4, 0]}>
          <torusGeometry args={[3.6, 0.022, 16, 120]} />
          <meshBasicMaterial color={VIOLET_HOT} transparent opacity={0.75} />
        </mesh>
      </Float>
      <Float speed={0.9} floatIntensity={0.35} rotationIntensity={0.2}>
        <mesh rotation={[Math.PI / 2.3, 0.25, 0.1]} position={[0, 1.4, 0]}>
          <torusGeometry args={[4.2, 0.014, 16, 120]} />
          <meshBasicMaterial color={MAGENTA} transparent opacity={0.45} />
        </mesh>
      </Float>
    </group>
  );
}

function DriftShards() {
  const group = useRef<Group>(null);
  const shards = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        x: (i % 6) * 1.4 - 4.5,
        y: Math.floor(i / 6) * 1.1 - 0.5,
        z: -3 - (i % 5) * 0.7,
        s: [0.25 + (i % 3) * 0.12, 0.08 + (i % 2) * 0.05, 0.4 + (i % 4) * 0.1] as [
          number,
          number,
          number,
        ],
        phase: i * 0.55,
      })),
    []
  );

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = t * 0.05;
    group.current.children.forEach((child, i) => {
      const s = shards[i];
      if (!s) return;
      child.position.y = s.y + Math.sin(t * 0.7 + s.phase) * 0.45;
      child.rotation.y = t * 0.3 + s.phase;
      child.rotation.x = Math.sin(t * 0.4 + s.phase) * 0.2;
    });
  });

  return (
    <group ref={group} position={[-2.2, 0.6, -1.5]}>
      {shards.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, s.z]}>
          <boxGeometry args={s.s} />
          <meshStandardMaterial
            color={i % 2 ? VIOLET : MAGENTA}
            emissive={VIOLET}
            emissiveIntensity={0.85}
            transparent
            opacity={0.55}
            metalness={0.2}
            roughness={0.35}
          />
        </mesh>
      ))}
    </group>
  );
}

function SweepLight() {
  const ref = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.x = Math.sin(t * 0.45) * 5;
    ref.current.position.y = 3 + Math.sin(t * 0.7) * 0.8;
    ref.current.position.z = Math.cos(t * 0.45) * 3;
  });
  return <pointLight ref={ref} intensity={120} color={VIOLET_HOT} distance={40} decay={1.4} />;
}

export default function EntryGateScene() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#09060f]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_35%,rgba(167,139,250,0.35),transparent_55%),radial-gradient(ellipse_at_20%_85%,rgba(232,121,249,0.22),transparent_50%)]" />
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [-1.8, 2.6, 8.8], fov: 42 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.35 }}
      >
        <color attach="background" args={["#09060f"]} />
        <fog attach="fog" args={["#09060f", 16, 38]} />
        <hemisphereLight args={["#d8b4fe", "#1a1028", 1.1]} />
        <ambientLight intensity={0.95} />
        <directionalLight position={[6, 10, 5]} intensity={3.2} color="#f5e9ff" />
        <directionalLight position={[-5, 4, -3]} intensity={1.4} color={MAGENTA} />
        <pointLight position={[3, 5, 4]} intensity={90} color={VIOLET} distance={30} decay={1.5} />
        <pointLight position={[-4, 3, 2]} intensity={70} color={MAGENTA} distance={26} decay={1.5} />
        <SweepLight />
        <Stars radius={80} depth={40} count={1600} factor={3.2} saturation={0} fade speed={0.55} />
        <AssemblingTower />
        <DriftShards />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.55, 0]}>
          <circleGeometry args={[18, 64]} />
          <meshStandardMaterial color="#140e1f" metalness={0.2} roughness={0.9} emissive="#1a0f2a" emissiveIntensity={0.4} />
        </mesh>
      </Canvas>
      {/* Soft vignette only — don't crush the 3D */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#09060f]/75 via-transparent to-transparent md:from-[#09060f]/55 md:via-[#09060f]/15" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#09060f] to-transparent" />
    </div>
  );
}
