"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Center,
  ContactShadows,
  Edges,
  Grid,
  Html,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Group } from "three";
import * as THREE from "three";
import type { ModelPart, ThreeDConcept } from "@/lib/types";

export type DrawingView = "perspective" | "top" | "front" | "side";

function explodeOffset(part: ModelPart, amount: number, index = 0): [number, number, number] {
  const px = part.position[0];
  const py = part.position[1];
  const pz = part.position[2];
  let len = Math.hypot(px, py * 0.45, pz);
  // Parts at center must still fly out in different directions (Iron Man)
  let dirX = px;
  let dirY = py;
  let dirZ = pz;
  if (len < 0.35) {
    const a = index * 2.399; // golden-angle spread
    dirX = Math.cos(a);
    dirY = 0.55 + (index % 3) * 0.25;
    dirZ = Math.sin(a);
    len = 1;
  }
  const boost = 0.7 + Math.min(2, Math.max(...part.size) * 0.4);
  return [
    (dirX / len) * amount * boost * 2.6,
    (dirY / len) * amount * boost * 1.6 + amount * 0.55,
    (dirZ / len) * amount * boost * 2.6,
  ];
}

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
    ref.current.rotation.y += delta * 0.045;
  });
  return <group ref={ref}>{children}</group>;
}

function AnimatedPart({
  part,
  index,
  selected,
  exploded,
  assembling,
  onSelect,
}: {
  part: ModelPart;
  index: number;
  selected: boolean;
  exploded: boolean;
  assembling: boolean;
  onSelect: () => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const progress = useRef(exploded ? 0 : 1);

  useEffect(() => {
    if (assembling) progress.current = 0;
  }, [assembling, part.id]);

  useFrame((_, delta) => {
    if (!mesh.current) return;
    const target = exploded ? 0 : 1;
    progress.current = THREE.MathUtils.damp(
      progress.current,
      target,
      assembling ? 0.9 : 2.4,
      delta
    );
    const [ox, oy, oz] = explodeOffset(part, 1 - progress.current, index);
    mesh.current.position.set(
      part.position[0] + ox,
      part.position[1] + oy,
      part.position[2] + oz
    );
  });

  const glass = /стекл|glass/i.test(part.material);
  const metal = /стал|металл|алюмин|metal/i.test(part.material);

  return (
    <mesh
      ref={mesh}
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
        <cylinderGeometry args={[part.size[0], part.size[2], part.size[1], 28]} />
      ) : (
        <boxGeometry args={part.size} />
      )}
      <meshStandardMaterial
        color={part.color}
        emissive={selected ? part.color : glass ? part.color : "#1a1408"}
        emissiveIntensity={selected ? 0.5 : glass ? 0.3 : 0.08}
        roughness={glass ? 0.08 : metal ? 0.28 : 0.48}
        metalness={metal ? 0.72 : glass ? 0.05 : 0.18}
        transparent={glass}
        opacity={glass ? 0.45 : 1}
      />
      <Edges color={selected ? "#ffe566" : "#120e08"} threshold={16} />
      {selected && (
        <Html center position={[0, Math.max(0.5, part.size[1] / 2 + 0.45), 0]} distanceFactor={10}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-amber-400/40 bg-black/80 px-3 py-1.5 text-[11px] text-amber-50">
            <span className="font-semibold">{part.name}</span>
          </div>
        </Html>
      )}
    </mesh>
  );
}

function GlbModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  return (
    <Center>
      <primitive object={cloned} scale={1.2} />
    </Center>
  );
}

export default function ConceptViewer({
  concept,
  selectedId,
  onSelect,
  view = "perspective",
  exploded = false,
  assembling = false,
  className = "",
  autoRotate = false,
  showMesh = true,
}: {
  concept: ThreeDConcept;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  view?: DrawingView;
  exploded?: boolean;
  assembling?: boolean;
  className?: string;
  autoRotate?: boolean;
  showMesh?: boolean;
}) {
  const hasMesh = Boolean(showMesh && concept.meshUrl);
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
    <div className={`relative h-full min-h-[420px] overflow-hidden bg-[#07060a] ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,197,24,0.12),transparent_55%)]" />
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded border border-amber-400/25 bg-black/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100/80 backdrop-blur">
        {assembling
          ? "ASSEMBLING…"
          : exploded
            ? "EXPLODED · IRON MAN MODE"
            : hasMesh
              ? "MESH · ORBIT"
              : "ORBIT · SELECT"}
      </div>
      <Canvas
        key={`${view}-${hasMesh ? "mesh" : "parts"}`}
        shadows={view === "perspective"}
        orthographic={view !== "perspective"}
        dpr={[1, 1.5]}
        camera={
          view === "perspective"
            ? { position: [12, 7, 14], fov: 38 }
            : { position: [0, 0, 18], zoom: 36, near: -200, far: 200 }
        }
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        onPointerMissed={() => onSelect(null)}
      >
        <CameraRig view={view} maxDimension={hasMesh ? 8 : maxDimension} />
        <color attach="background" args={["#07060a"]} />
        <fog attach="fog" args={["#07060a", 22, 52]} />
        <hemisphereLight args={["#fff4d6", "#1a1408", 0.85]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[12, 18, 10]} intensity={3} castShadow color="#fff8e8" />
        <pointLight position={[-8, 6, -4]} intensity={80} color="#f5c518" distance={36} decay={1.5} />
        <pointLight position={[6, 3, 8]} intensity={45} color="#a78bfa" distance={30} decay={1.5} />

        <SoftSpin
          enabled={autoRotate && view === "perspective" && !exploded && !assembling}
        >
          {hasMesh && concept.meshUrl ? (
            <Suspense fallback={null}>
              <GlbModel url={concept.meshUrl} />
            </Suspense>
          ) : (
            <group position={[0, 0.05, 0]}>
              {concept.parts.map((part, index) => (
                <AnimatedPart
                  key={part.id}
                  part={part}
                  index={index}
                  selected={part.id === selectedId}
                  exploded={exploded}
                  assembling={assembling}
                  onSelect={() => onSelect(part.id)}
                />
              ))}
            </group>
          )}
        </SoftSpin>

        {view === "perspective" && (
          <>
            <Grid
              position={[0, -1.5, 0]}
              args={[50, 50]}
              cellSize={0.5}
              cellThickness={0.45}
              cellColor="#2a2418"
              sectionSize={2.5}
              sectionThickness={1}
              sectionColor="#8a7010"
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
          minDistance={3}
          maxDistance={Math.max(28, maxDimension * 3.2)}
          maxPolarAngle={Math.PI * 0.49}
        />
      </Canvas>
    </div>
  );
}
