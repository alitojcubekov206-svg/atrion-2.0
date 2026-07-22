"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Float, Grid, Stars } from "@react-three/drei";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import * as THREE from "three";

const VIOLET = "#a78bfa";
const VIOLET_HOT = "#c4b5fd";
const MAGENTA = "#e879f9";

function HoloBuilding() {
  const group = useRef<Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.18) * 0.35 + 0.4;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.08;
  });

  return (
    <group ref={group} position={[0, -0.2, 0]} scale={1.15}>
      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[4.4, 0.28, 2.8]} />
        <meshStandardMaterial color="#3a3148" metalness={0.25} roughness={0.45} emissive="#2a1f3a" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[3.6, 2.2, 2.2]} />
        <meshStandardMaterial
          color="#4c3f62"
          emissive="#3b2a55"
          emissiveIntensity={0.45}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, 1.15, 1.12]}>
        <boxGeometry args={[2.8, 1.6, 0.06]} />
        <meshStandardMaterial
          color={VIOLET_HOT}
          emissive={VIOLET}
          emissiveIntensity={1.1}
          transparent
          opacity={0.5}
          metalness={0.05}
          roughness={0.1}
        />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <boxGeometry args={[3.9, 0.18, 2.5]} />
        <meshStandardMaterial color="#2f2740" metalness={0.35} roughness={0.35} emissive="#1f1630" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[2.55, 0.75, 0]}>
        <boxGeometry args={[1.2, 1.4, 1.8]} />
        <meshStandardMaterial
          color="#554066"
          emissive={MAGENTA}
          emissiveIntensity={0.2}
          metalness={0.25}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[-1.2, 3.1, -0.4]}>
        <cylinderGeometry args={[0.04, 0.05, 1.2, 12]} />
        <meshStandardMaterial color={MAGENTA} emissive={MAGENTA} emissiveIntensity={1.2} />
      </mesh>
      <Float speed={1.4} floatIntensity={0.6} rotationIntensity={0.2}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 1.2, 0]}>
          <torusGeometry args={[3.2, 0.018, 12, 96]} />
          <meshBasicMaterial color={VIOLET_HOT} transparent opacity={0.65} />
        </mesh>
      </Float>
      <Float speed={1.1} floatIntensity={0.4} rotationIntensity={0.15}>
        <mesh rotation={[Math.PI / 2.4, 0.2, 0.1]} position={[0, 1.2, 0]}>
          <torusGeometry args={[3.7, 0.012, 12, 96]} />
          <meshBasicMaterial color={MAGENTA} transparent opacity={0.4} />
        </mesh>
      </Float>
    </group>
  );
}

function OrbitPoints() {
  const group = useRef<Group>(null);
  const points = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        return [Math.cos(a) * 4.6, Math.sin(a * 2) * 0.35, Math.sin(a) * 4.6] as [
          number,
          number,
          number,
        ];
      }),
    []
  );

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.12;
  });

  return (
    <group ref={group}>
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color={i % 2 ? VIOLET_HOT : MAGENTA} />
        </mesh>
      ))}
    </group>
  );
}

function PulseCore() {
  const mesh = useRef<Mesh>(null);
  useFrame((state) => {
    if (!mesh.current) return;
    const s = 1 + Math.sin(state.clock.elapsedTime * 1.6) * 0.08;
    mesh.current.scale.setScalar(s);
  });
  return (
    <mesh ref={mesh} position={[0, 1.1, 0]}>
      <sphereGeometry args={[0.22, 24, 24]} />
      <meshStandardMaterial
        color={VIOLET}
        emissive={VIOLET}
        emissiveIntensity={1.6}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

export default function HeroScene() {
  return (
    <div className="absolute inset-0 -z-10">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [5.5, 3.2, 7.2], fov: 42 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.3 }}
      >
        <color attach="background" args={["#09060f"]} />
        <fog attach="fog" args={["#09060f", 12, 30]} />
        <hemisphereLight args={["#e9d5ff", "#1a1028", 1]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[8, 12, 6]} intensity={3} color="#faf5ff" />
        <pointLight position={[-6, 4, -2]} intensity={100} color={VIOLET} distance={32} decay={1.5} />
        <pointLight position={[5, 2, 6]} intensity={70} color={MAGENTA} distance={28} decay={1.5} />
        <HoloBuilding />
        <PulseCore />
        <OrbitPoints />
        <Grid
          position={[0, -1.35, 0]}
          args={[40, 40]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#2a1f3d"
          sectionSize={2.5}
          sectionThickness={1}
          sectionColor="#6d28d9"
          fadeDistance={22}
          fadeStrength={1}
          infiniteGrid
        />
        <ContactShadows position={[0, -1.3, 0]} opacity={0.45} scale={24} blur={2.6} far={8} />
        <Stars radius={70} depth={40} count={2000} factor={2.8} saturation={0} fade speed={0.5} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(9,6,15,0.4)_75%,#09060f_96%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#09060f] to-transparent" />
    </div>
  );
}
