"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Html, Line, OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { StackLayer } from "@/lib/types";

const LAYER_COLORS: Record<string, string> = {
  Frontend: "#4dd6ff",
  Backend: "#7c6cff",
  Database: "#34d399",
  AI: "#f472b6",
  Storage: "#f59e0b",
  Deployment: "#f59e0b",
};

function colorFor(layer: string, i: number) {
  const fallback = ["#4dd6ff", "#7c6cff", "#34d399", "#f472b6", "#f59e0b", "#a3e635"];
  return LAYER_COLORS[layer] ?? fallback[i % fallback.length];
}

function Node({
  position,
  color,
  label,
  sub,
}: {
  position: [number, number, number];
  color: string;
  label: string;
  sub: string;
}) {
  return (
    <Float speed={1.6} floatIntensity={0.35} rotationIntensity={0}>
      <group position={position}>
        <mesh>
          <sphereGeometry args={[0.42, 32, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} roughness={0.3} metalness={0.6} />
        </mesh>
        <Html center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div
            style={{
              transform: "translateY(46px)",
              textAlign: "center",
              whiteSpace: "nowrap",
              fontFamily: "ui-sans-serif, system-ui",
            }}
          >
            <div style={{ color: "#ededf2", fontSize: 13, fontWeight: 600 }}>{label}</div>
            <div style={{ color: "#8b8b9e", fontSize: 10, maxWidth: 180, whiteSpace: "normal" }}>{sub}</div>
          </div>
        </Html>
      </group>
    </Float>
  );
}

function Graph({ layers }: { layers: StackLayer[] }) {
  const group = useRef<THREE.Group>(null);

  const positions = useMemo<[number, number, number][]>(() => {
    const n = layers.length;
    return layers.map((_, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const radius = 2.6;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.7, Math.sin(angle * 2) * 0.5];
    });
  }, [layers]);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.05;
  });

  return (
    <group ref={group}>
      {/* central core */}
      <mesh>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshBasicMaterial color="#7c6cff" wireframe transparent opacity={0.7} />
      </mesh>
      {positions.map((p, i) => (
        <group key={layers[i].layer + i}>
          <Line points={[[0, 0, 0], p]} color={colorFor(layers[i].layer, i)} transparent opacity={0.35} lineWidth={1.5} />
          <Node
            position={p}
            color={colorFor(layers[i].layer, i)}
            label={layers[i].layer}
            sub={layers[i].technologies.slice(0, 3).join(" · ")}
          />
        </group>
      ))}
    </group>
  );
}

export default function ArchGraph({ layers }: { layers: StackLayer[] }) {
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-2xl border border-line bg-[#08080d]">
      <Canvas camera={{ position: [0, 0, 7], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[5, 5, 5]} intensity={30} color="#7c6cff" />
        <pointLight position={[-5, -3, 4]} intensity={20} color="#4dd6ff" />
        <Graph layers={layers} />
        <OrbitControls enablePan={false} minDistance={4} maxDistance={12} />
      </Canvas>
    </div>
  );
}
