"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Edges, Grid, Html, OrbitControls } from "@react-three/drei";
import { useEffect } from "react";
import type { ModelPart, ThreeDConcept } from "@/lib/types";

function Part({
  part,
  selected,
  onSelect,
}: {
  part: ModelPart;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <mesh
      position={part.position}
      rotation={part.rotation}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      castShadow
      receiveShadow
    >
      {part.shape === "cylinder" ? (
        <cylinderGeometry args={[part.size[0], part.size[2], part.size[1], 24]} />
      ) : (
        <boxGeometry args={part.size} />
      )}
      <meshStandardMaterial
        color={part.color}
        emissive={selected ? part.color : "#000000"}
        emissiveIntensity={selected ? 0.35 : 0}
        roughness={0.45}
        metalness={part.material.toLowerCase().includes("стал") ? 0.65 : 0.15}
      />
      <Edges color={selected ? "#ffffff" : "#141420"} threshold={15} />
      {selected && (
        <Html center position={[0, Math.max(0.4, part.size[1] / 2 + 0.35), 0]} distanceFactor={8}>
          <div className="pointer-events-none whitespace-nowrap rounded-lg border border-accent/40 bg-bg/90 px-3 py-1.5 text-xs shadow-xl backdrop-blur">
            <span className="font-semibold">{part.name}</span>
            <span className="ml-2 text-muted">{part.material}</span>
          </div>
        </Html>
      )}
    </mesh>
  );
}

type DrawingView = "perspective" | "top" | "front" | "side";

function CameraRig({
  view,
  maxDimension,
}: {
  view: DrawingView;
  maxDimension: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    const positions: Record<DrawingView, [number, number, number]> = {
      perspective: [8, 6, 9],
      top: [0, 14, 0.01],
      front: [0, 1, 14],
      side: [14, 1, 0],
    };
    camera.position.set(...positions[view]);
    camera.up.set(0, view === "top" ? 0 : 1, view === "top" ? -1 : 0);
    camera.lookAt(0, 0, 0);
    if (view !== "perspective" && "zoom" in camera) {
      (camera as typeof camera & { zoom: number }).zoom = Math.max(
        14,
        Math.min(90, 360 / Math.max(1, maxDimension))
      );
    }
    camera.updateProjectionMatrix();
  }, [camera, maxDimension, view]);

  return null;
}

export default function ConceptViewer({
  concept,
  selectedId,
  onSelect,
  view = "perspective",
}: {
  concept: ThreeDConcept;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  view?: DrawingView;
}) {
  const maxDimension = Math.max(
    concept.dimensions.width,
    concept.dimensions.height,
    concept.dimensions.depth
  );

  return (
    <div className="relative h-[520px] overflow-hidden rounded-2xl border border-line bg-[#07070c]">
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border border-line bg-bg/70 px-3 py-1.5 text-xs text-muted backdrop-blur">
        {view === "perspective"
          ? "Drag to rotate · Scroll to zoom · Click a part"
          : "Ортографический чертёж · Click a part"}
      </div>
      <Canvas
        key={view}
        shadows={view === "perspective"}
        orthographic={view !== "perspective"}
        camera={
          view === "perspective"
            ? { position: [8, 6, 9], fov: 42 }
            : { position: [0, 0, 14], zoom: 50, near: -100, far: 100 }
        }
        onPointerMissed={() => onSelect(null)}
      >
        <CameraRig view={view} maxDimension={maxDimension} />
        <color attach="background" args={["#07070c"]} />
        <fog attach="fog" args={["#07070c", 12, 30]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[8, 12, 6]} intensity={2.5} castShadow color="#ffffff" />
        <pointLight position={[-6, 4, -4]} intensity={25} color="#7c6cff" />

        <group position={[0, 0.15, 0]}>
          {concept.parts.map((part) => (
            <Part
              key={part.id}
              part={part}
              selected={part.id === selectedId}
              onSelect={() => onSelect(part.id)}
            />
          ))}
        </group>

        {view === "perspective" && (
          <>
            <Grid
              position={[0, -1.2, 0]}
              args={[30, 30]}
              cellSize={0.5}
              cellThickness={0.6}
              cellColor="#252538"
              sectionSize={2.5}
              sectionThickness={1}
              sectionColor="#4f46a5"
              fadeDistance={20}
              fadeStrength={1}
              infiniteGrid
            />
            <ContactShadows position={[0, -1.15, 0]} opacity={0.45} scale={20} blur={2.5} far={8} />
          </>
        )}
        <OrbitControls
          makeDefault
          enabled={view === "perspective"}
          enablePan
          minDistance={3}
          maxDistance={22}
        />
      </Canvas>
    </div>
  );
}
