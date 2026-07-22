"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Float, Grid, Stars } from "@react-three/drei";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";

function HoloBuilding() {
  const group = useRef<Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.18) * 0.35 + 0.4;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.08;
  });

  return (
    <group ref={group} position={[0, -0.2, 0]} scale={1.15}>
      {/* Foundation */}
      <mesh position={[0, -0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.4, 0.28, 2.8]} />
        <meshStandardMaterial color="#1a2332" metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Main volume */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[3.6, 2.2, 2.2]} />
        <meshStandardMaterial
          color="#0d1520"
          emissive="#123047"
          emissiveIntensity={0.35}
          metalness={0.7}
          roughness={0.25}
        />
      </mesh>
      {/* Glass facade */}
      <mesh position={[0, 1.15, 1.12]}>
        <boxGeometry args={[2.8, 1.6, 0.06]} />
        <meshStandardMaterial
          color="#4dd6ff"
          emissive="#4dd6ff"
          emissiveIntensity={0.55}
          transparent
          opacity={0.35}
          metalness={0.1}
          roughness={0.05}
        />
      </mesh>
      {/* Roof plate */}
      <mesh position={[0, 2.35, 0]} castShadow>
        <boxGeometry args={[3.9, 0.18, 2.5]} />
        <meshStandardMaterial color="#152033" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Side wing */}
      <mesh position={[2.55, 0.75, 0]} castShadow>
        <boxGeometry args={[1.2, 1.4, 1.8]} />
        <meshStandardMaterial
          color="#101820"
          emissive="#7c6cff"
          emissiveIntensity={0.12}
          metalness={0.65}
          roughness={0.3}
        />
      </mesh>
      {/* Antenna / mast */}
      <mesh position={[-1.2, 3.1, -0.4]}>
        <cylinderGeometry args={[0.04, 0.05, 1.2, 12]} />
        <meshStandardMaterial color="#4dd6ff" emissive="#4dd6ff" emissiveIntensity={0.8} />
      </mesh>
      {/* Floating rings */}
      <Float speed={1.4} floatIntensity={0.6} rotationIntensity={0.2}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 1.2, 0]}>
          <torusGeometry args={[3.2, 0.015, 12, 96]} />
          <meshBasicMaterial color="#4dd6ff" transparent opacity={0.45} />
        </mesh>
      </Float>
      <Float speed={1.1} floatIntensity={0.4} rotationIntensity={0.15}>
        <mesh rotation={[Math.PI / 2.4, 0.2, 0.1]} position={[0, 1.2, 0]}>
          <torusGeometry args={[3.7, 0.01, 12, 96]} />
          <meshBasicMaterial color="#7c6cff" transparent opacity={0.28} />
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
          <meshBasicMaterial color={i % 2 ? "#4dd6ff" : "#a99cff"} />
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
        color="#4dd6ff"
        emissive="#4dd6ff"
        emissiveIntensity={1.4}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

export default function HeroScene() {
  return (
    <div className="absolute inset-0 -z-10">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [5.5, 3.2, 7.2], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={["#03060c"]} />
        <fog attach="fog" args={["#03060c", 10, 28]} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[8, 12, 6]}
          intensity={2.4}
          castShadow
          color="#eafcff"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[-6, 4, -2]} intensity={55} color="#4dd6ff" />
        <pointLight position={[5, 2, 6]} intensity={28} color="#7c6cff" />
        <HoloBuilding />
        <PulseCore />
        <OrbitPoints />
        <Grid
          position={[0, -1.35, 0]}
          args={[40, 40]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#0f2a3a"
          sectionSize={2.5}
          sectionThickness={1}
          sectionColor="#1d5f78"
          fadeDistance={22}
          fadeStrength={1}
          infiniteGrid
        />
        <ContactShadows position={[0, -1.3, 0]} opacity={0.55} scale={24} blur={2.6} far={8} />
        <Stars radius={70} depth={40} count={2200} factor={2.6} saturation={0} fade speed={0.5} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(3,6,12,0.55)_70%,#03060c_95%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#03060c] to-transparent" />
    </div>
  );
}
