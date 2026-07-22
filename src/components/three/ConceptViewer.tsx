"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Edges, Grid, Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Group } from "three";
import type { ModelPart, ThreeDConcept } from "@/lib/types";

export type DrawingView = "perspective" | "top" | "front" | "side";

function PartMesh({
  part,
  selected,
  exploded,
  onSelect,
}: {
  part: ModelPart;
  selected: boolean;
  exploded: boolean;
  onSelect: () => void;
}) {
  const explodeFactor = exploded ? 1.35 : 1;
  const position: [number, number, number] = [
    part.position[0] * explodeFactor,
    part.position[1] * (exploded ? 1.15 : 1),
    part.position[2] * explodeFactor,
  ];

  return (
    <mesh
      position={position}
      rotation={part.rotation}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      castShadow
      receiveShadow
    >
      {part.shape === "cylinder" ? (
        <cylinderGeometry args={[part.size[0], part.size[2], part.size[1], 28]} />
      ) : (
        <boxGeometry args={part.size} />
      )}
      <meshStandardMaterial
        color={part.color}
        emissive={selected ? part.color : "#041018"}
        emissiveIntensity={selected ? 0.45 : 0.08}
        roughness={part.material.toLowerCase().includes("стекл") ? 0.08 : 0.42}
        metalness={
          /стал|металл|алюмин/i.test(part.material)
            ? 0.72
            : part.material.toLowerCase().includes("стекл")
              ? 0.05
              : 0.18
        }
        transparent={/стекл/i.test(part.material)}
        opacity={/стекл/i.test(part.material) ? 0.55 : 1}
      />
      <Edges color={selected ? "#ffffff" : "#0b1220"} threshold={18} />
      {selected && (
        <Html center position={[0, Math.max(0.45, part.size[1] / 2 + 0.4), 0]} distanceFactor={9}>
          <div className="pointer-events-none whitespace-nowrap rounded-lg border border-cyan-400/40 bg-[#05080f]/90 px-3 py-1.5 text-xs shadow-[0_0_24px_rgba(77,214,255,0.25)] backdrop-blur">
            <span className="font-semibold text-cyan-100">{part.name}</span>
            <span className="ml-2 text-slate-400">{part.material}</span>
          </div>
        </Html>
      )}
    </mesh>
  );
}

function CameraRig({
  view,
  maxDimension,
}: {
  view: DrawingView;
  maxDimension: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    const distance = Math.max(10, maxDimension * 1.6);
    const positions: Record<DrawingView, [number, number, number]> = {
      perspective: [distance * 0.9, distance * 0.65, distance],
      top: [0, distance * 1.4, 0.01],
      front: [0, maxDimension * 0.35, distance * 1.2],
      side: [distance * 1.2, maxDimension * 0.35, 0],
    };
    camera.position.set(...positions[view]);
    camera.up.set(0, view === "top" ? 0 : 1, view === "top" ? -1 : 0);
    camera.lookAt(0, 0, 0);
    if (view !== "perspective" && "zoom" in camera) {
      (camera as typeof camera & { zoom: number }).zoom = Math.max(
        12,
        Math.min(110, 420 / Math.max(1, maxDimension))
      );
    }
    camera.updateProjectionMatrix();
  }, [camera, maxDimension, view]);

  return null;
}

function SoftSpin({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!enabled || !ref.current) return;
    ref.current.rotation.y += delta * 0.08;
  });
  return <group ref={ref}>{children}</group>;
}

export default function ConceptViewer({
  concept,
  selectedId,
  onSelect,
  view = "perspective",
  exploded = false,
  className = "",
  autoRotate = false,
  showHint = true,
}: {
  concept: ThreeDConcept;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  view?: DrawingView;
  exploded?: boolean;
  className?: string;
  autoRotate?: boolean;
  showHint?: boolean;
}) {
  const maxDimension = useMemo(
    () =>
      Math.max(
        concept.dimensions.width,
        concept.dimensions.height,
        concept.dimensions.depth,
        1
      ),
    [concept.dimensions]
  );

  return (
    <div className={`relative h-full min-h-[420px] overflow-hidden bg-[#03060c] ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,214,255,0.08),transparent_55%)]" />
      {showHint && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border border-cyan-400/20 bg-black/40 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
          {view === "perspective"
            ? exploded
              ? "Exploded view · Drag to orbit"
              : "Free Orbit · Scroll zoom · Click part"
            : "Architectural drawing · Click part"}
        </div>
      )}
      <Canvas
        key={`${view}-${exploded}`}
        shadows={view === "perspective"}
        orthographic={view !== "perspective"}
        dpr={[1, 1.75]}
        camera={
          view === "perspective"
            ? { position: [10, 7, 11], fov: 40 }
            : { position: [0, 0, 16], zoom: 42, near: -200, far: 200 }
        }
        onPointerMissed={() => onSelect(null)}
      >
        <CameraRig view={view} maxDimension={maxDimension} />
        <color attach="background" args={["#03060c"]} />
        <fog attach="fog" args={["#03060c", 18, 42]} />
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[10, 16, 8]}
          intensity={2.2}
          castShadow
          color="#e8fbff"
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-8, 6, -4]} intensity={40} color="#4dd6ff" />
        <pointLight position={[6, 3, 8]} intensity={18} color="#7c6cff" />

        <SoftSpin enabled={autoRotate && view === "perspective" && !exploded}>
          <group position={[0, 0.05, 0]}>
            {concept.parts.map((part) => (
              <PartMesh
                key={part.id}
                part={part}
                selected={part.id === selectedId}
                exploded={exploded}
                onSelect={() => onSelect(part.id)}
              />
            ))}
          </group>
        </SoftSpin>

        {view === "perspective" && (
          <>
            <Grid
              position={[0, -1.4, 0]}
              args={[40, 40]}
              cellSize={0.5}
              cellThickness={0.55}
              cellColor="#123044"
              sectionSize={2.5}
              sectionThickness={1.1}
              sectionColor="#1f6f8a"
              fadeDistance={28}
              fadeStrength={1}
              infiniteGrid
            />
            <ContactShadows
              position={[0, -1.35, 0]}
              opacity={0.5}
              scale={28}
              blur={2.8}
              far={10}
            />
          </>
        )}
        <OrbitControls
          makeDefault
          enabled={view === "perspective"}
          enablePan
          minDistance={3}
          maxDistance={Math.max(24, maxDimension * 3)}
          maxPolarAngle={Math.PI * 0.49}
        />
      </Canvas>
    </div>
  );
}
