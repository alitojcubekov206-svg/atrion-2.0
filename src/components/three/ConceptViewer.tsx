"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Edges, Grid, Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Group } from "three";
import * as THREE from "three";
import type { ModelPart, ThreeDConcept } from "@/lib/types";

export type DrawingView = "perspective" | "top" | "front" | "side";

function CameraRig({ view, maxDimension }: { view: DrawingView; maxDimension: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const distance = Math.max(12, maxDimension * 1.75);
    const positions: Record<DrawingView, [number, number, number]> = {
      perspective: [distance * 0.95, distance * 0.55, distance * 1.05],
      top: [0, distance * 1.45, 0.01],
      front: [0, maxDimension * 0.4, distance * 1.25],
      side: [distance * 1.25, maxDimension * 0.4, 0],
    };
    camera.position.set(...positions[view]);
    camera.up.set(0, view === "top" ? 0 : 1, view === "top" ? -1 : 0);
    camera.lookAt(0, maxDimension * 0.15, 0);
    if (view !== "perspective" && "zoom" in camera) {
      (camera as THREE.OrthographicCamera).zoom = Math.max(
        10,
        Math.min(120, 480 / Math.max(1, maxDimension))
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
    ref.current.rotation.y += delta * 0.04;
  });
  return <group ref={ref}>{children}</group>;
}

function PartMesh({
  part,
  selected,
  onSelect,
}: {
  part: ModelPart;
  selected: boolean;
  onSelect: () => void;
}) {
  const glass = /стекл|glass/i.test(part.material);
  const metal = /стал|металл|алюмин|metal/i.test(part.material);

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
        <cylinderGeometry args={[part.size[0], part.size[2], part.size[1], 32]} />
      ) : (
        <boxGeometry args={part.size} />
      )}
      <meshStandardMaterial
        color={part.color}
        emissive={selected ? part.color : glass ? part.color : "#1a1028"}
        emissiveIntensity={selected ? 0.45 : glass ? 0.35 : 0.08}
        roughness={glass ? 0.08 : metal ? 0.3 : 0.5}
        metalness={metal ? 0.7 : glass ? 0.05 : 0.15}
        transparent={glass}
        opacity={glass ? 0.45 : 1}
      />
      <Edges color={selected ? "#f5e9ff" : "#120a1c"} threshold={16} />
      {selected && (
        <Html center position={[0, Math.max(0.5, part.size[1] / 2 + 0.45), 0]} distanceFactor={10}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-violet-300/40 bg-black/80 px-3 py-1.5 text-[11px] tracking-wide text-violet-50">
            <span className="font-semibold">{part.name}</span>
          </div>
        </Html>
      )}
    </mesh>
  );
}

export default function ConceptViewer({
  concept,
  selectedId,
  onSelect,
  view = "perspective",
  className = "",
  autoRotate = false,
}: {
  concept: ThreeDConcept;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  view?: DrawingView;
  className?: string;
  autoRotate?: boolean;
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
    <div className={`relative h-full min-h-[420px] overflow-hidden bg-[#09060f] ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.14),transparent_55%)]" />
      <Canvas
        key={view}
        shadows={view === "perspective"}
        orthographic={view !== "perspective"}
        dpr={[1, 1.75]}
        camera={
          view === "perspective"
            ? { position: [12, 7, 14], fov: 38 }
            : { position: [0, 0, 18], zoom: 36, near: -200, far: 200 }
        }
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.25,
        }}
        onPointerMissed={() => onSelect(null)}
      >
        <CameraRig view={view} maxDimension={maxDimension} />
        <color attach="background" args={["#09060f"]} />
        <fog attach="fog" args={["#09060f", 22, 52]} />
        <hemisphereLight args={["#e9d5ff", "#1a1028", 0.85]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[12, 18, 10]} intensity={3.2} castShadow color="#faf5ff" />
        <pointLight position={[-10, 8, -6]} intensity={95} color="#a78bfa" distance={40} decay={1.5} />
        <pointLight position={[8, 4, 10]} intensity={70} color="#e879f9" distance={35} decay={1.5} />

        <SoftSpin enabled={autoRotate && view === "perspective"}>
          <group position={[0, 0.05, 0]}>
            {concept.parts.map((part) => (
              <PartMesh
                key={part.id}
                part={part}
                selected={part.id === selectedId}
                onSelect={() => onSelect(part.id)}
              />
            ))}
          </group>
        </SoftSpin>

        {view === "perspective" && (
          <>
            <Grid
              position={[0, -1.5, 0]}
              args={[50, 50]}
              cellSize={0.5}
              cellThickness={0.5}
              cellColor="#2a1f3d"
              sectionSize={2.5}
              sectionThickness={1.1}
              sectionColor="#6d28d9"
              fadeDistance={32}
              fadeStrength={1}
              infiniteGrid
            />
            <ContactShadows position={[0, -1.45, 0]} opacity={0.5} scale={32} blur={2.8} far={12} />
          </>
        )}
        <OrbitControls
          makeDefault
          enabled={view === "perspective"}
          enablePan
          minDistance={4}
          maxDistance={Math.max(28, maxDimension * 3.2)}
          maxPolarAngle={Math.PI * 0.49}
        />
      </Canvas>
    </div>
  );
}
