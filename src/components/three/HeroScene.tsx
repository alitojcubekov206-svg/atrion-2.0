"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Line, Stars } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Wireframe "architecture core" — an icosahedron with orbiting nodes. */
function Core() {
  const group = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.15;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.15;
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1.6, 1]} />
        <meshBasicMaterial color="#7c6cff" wireframe transparent opacity={0.5} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.1, 0]} />
        <meshStandardMaterial
          color="#0d0d14"
          emissive="#4dd6ff"
          emissiveIntensity={0.35}
          roughness={0.2}
          metalness={0.9}
        />
      </mesh>
    </group>
  );
}

function OrbitingNodes({ count = 10, radius = 3 }: { count?: number; radius?: number }) {
  const group = useRef<THREE.Group>(null);
  const nodes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const phi = Math.acos(-1 + (2 * i) / count);
        const theta = Math.sqrt(count * Math.PI) * phi;
        return new THREE.Vector3(
          radius * Math.cos(theta) * Math.sin(phi),
          radius * Math.sin(theta) * Math.sin(phi) * 0.6,
          radius * Math.cos(phi)
        );
      }),
    [count, radius]
  );

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y -= delta * 0.08;
  });

  return (
    <group ref={group}>
      {nodes.map((p, i) => (
        <group key={i}>
          <Line points={[[0, 0, 0], p.toArray()]} color="#7c6cff" transparent opacity={0.18} lineWidth={1} />
          <Float speed={2} floatIntensity={0.4} rotationIntensity={0}>
            <mesh position={p}>
              <sphereGeometry args={[0.07, 16, 16]} />
              <meshBasicMaterial color={i % 3 === 0 ? "#4dd6ff" : "#a99cff"} />
            </mesh>
          </Float>
        </group>
      ))}
    </group>
  );
}

export default function HeroScene() {
  return (
    <div className="absolute inset-0 -z-10">
      <Canvas camera={{ position: [0, 0, 7], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[6, 6, 6]} intensity={40} color="#7c6cff" />
        <pointLight position={[-6, -4, 4]} intensity={25} color="#4dd6ff" />
        <Core />
        <OrbitingNodes />
        <Stars radius={60} depth={40} count={2500} factor={3} saturation={0} fade speed={0.6} />
      </Canvas>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 30%, #060609 85%)" }}
      />
    </div>
  );
}
