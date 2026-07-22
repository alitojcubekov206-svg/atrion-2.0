"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import * as THREE from "three";

const VIOLET = "#a78bfa";
const MAGENTA = "#e879f9";

function FloatingModules() {
  const group = useRef<Group>(null);
  const modules = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => ({
        id: index,
        position: [
          (Math.sin(index * 1.7) * 6 + (index % 3) * 1.2) * (index % 2 === 0 ? 1 : -0.85),
          0.4 + (index % 5) * 0.55,
          -4 - (index % 4) * 1.4,
        ] as [number, number, number],
        size: [0.35 + (index % 4) * 0.18, 0.12 + (index % 3) * 0.08, 0.5 + (index % 5) * 0.12] as [
          number,
          number,
          number,
        ],
        speed: 0.15 + (index % 5) * 0.04,
        phase: index * 0.7,
      })),
    []
  );

  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = state.clock.elapsedTime * 0.04;
    group.current.children.forEach((child, index) => {
      const mesh = child as Mesh;
      const item = modules[index];
      if (!item) return;
      mesh.position.y = item.position[1] + Math.sin(state.clock.elapsedTime * item.speed + item.phase) * 0.35;
      mesh.rotation.y = state.clock.elapsedTime * 0.2 + item.phase;
    });
  });

  return (
    <group ref={group} position={[0, -0.5, 0]}>
      {modules.map((item) => (
        <mesh key={item.id} position={item.position}>
          <boxGeometry args={item.size} />
          <meshStandardMaterial
            color={VIOLET}
            emissive={VIOLET}
            emissiveIntensity={0.7}
            transparent
            opacity={0.5}
            metalness={0.25}
            roughness={0.35}
          />
        </mesh>
      ))}
      <mesh position={[0, 1.2, -6]}>
        <boxGeometry args={[4.2, 2.4, 0.2]} />
        <meshStandardMaterial color="#4a3f5c" transparent opacity={0.65} metalness={0.25} roughness={0.4} emissive="#2a1f3a" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[2.4, 0.8, -5.2]}>
        <boxGeometry args={[1.6, 1.4, 1.2]} />
        <meshStandardMaterial color="#5b4a72" transparent opacity={0.6} metalness={0.2} roughness={0.45} emissive={MAGENTA} emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

function PulseRing() {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = (Math.sin(state.clock.elapsedTime * 1.2) + 1) / 2;
    ref.current.scale.setScalar(1 + t * 0.15);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.25 + t * 0.35;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, -4]}>
      <ringGeometry args={[3.2, 3.45, 64]} />
      <meshBasicMaterial color={VIOLET} transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function StarkAmbient({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(167,139,250,0.22),transparent_45%),radial-gradient(ellipse_at_90%_80%,rgba(232,121,249,0.16),transparent_40%),linear-gradient(180deg,#09060f_0%,#140e1f_50%,#09060f_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(167,139,250,0.55)_1px,transparent_1px),linear-gradient(90deg,rgba(167,139,250,0.55)_1px,transparent_1px)] [background-size:48px_48px]" />
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 2.5, 8], fov: 42 }}
        gl={{ alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.25 }}
      >
        <hemisphereLight args={["#e9d5ff", "#1a1028", 0.9]} />
        <ambientLight intensity={0.85} />
        <pointLight position={[4, 6, 2]} intensity={90} color={VIOLET} distance={28} decay={1.5} />
        <pointLight position={[-5, 2, 4]} intensity={60} color={MAGENTA} distance={24} decay={1.5} />
        <FloatingModules />
        <PulseRing />
      </Canvas>
      <div className="absolute inset-0 bg-gradient-to-t from-[#09060f] via-transparent to-[#09060f]/60" />
    </div>
  );
}
