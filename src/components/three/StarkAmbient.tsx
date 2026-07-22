"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import * as THREE from "three";

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
            color="#4dd6ff"
            emissive="#0a3a4d"
            emissiveIntensity={0.45}
            transparent
            opacity={0.35}
            metalness={0.7}
            roughness={0.25}
          />
        </mesh>
      ))}
      <mesh position={[0, 1.2, -6]}>
        <boxGeometry args={[4.2, 2.4, 0.2]} />
        <meshStandardMaterial color="#1a2a38" transparent opacity={0.55} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[2.4, 0.8, -5.2]}>
        <boxGeometry args={[1.6, 1.4, 1.2]} />
        <meshStandardMaterial color="#243447" transparent opacity={0.5} metalness={0.5} roughness={0.4} />
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
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.15 + t * 0.2;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, -4]}>
      <ringGeometry args={[3.2, 3.45, 64]} />
      <meshBasicMaterial color="#4dd6ff" transparent opacity={0.25} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function StarkAmbient({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(77,214,255,0.14),transparent_45%),radial-gradient(ellipse_at_90%_80%,rgba(80,90,200,0.12),transparent_40%),linear-gradient(180deg,#02060c_0%,#061018_50%,#02060c_100%)]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(77,214,255,0.55)_1px,transparent_1px),linear-gradient(90deg,rgba(77,214,255,0.55)_1px,transparent_1px)] [background-size:48px_48px]" />
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 2.5, 8], fov: 42 }} gl={{ alpha: true }}>
        <ambientLight intensity={0.35} />
        <pointLight position={[4, 6, 2]} intensity={40} color="#4dd6ff" />
        <pointLight position={[-5, 2, 4]} intensity={18} color="#7c6cff" />
        <FloatingModules />
        <PulseRing />
      </Canvas>
      <div className="absolute inset-0 bg-gradient-to-t from-[#02060c] via-transparent to-[#02060c]/70" />
    </div>
  );
}
