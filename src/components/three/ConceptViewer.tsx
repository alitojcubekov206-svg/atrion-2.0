"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Center,
  ContactShadows,
  Environment,
  Edges,
  Grid,
  Html,
  OrbitControls,
  TransformControls,
  useGLTF,
} from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Group } from "three";
import * as THREE from "three";
import type { ModelPart, ThreeDConcept } from "@/lib/types";
import type { CadTool } from "@/components/CadToolbar";

export type DrawingView = "perspective" | "top" | "front" | "side";

export type MeshTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

function explodeOffset(part: ModelPart, amount: number, index = 0): [number, number, number] {
  const px = part.position[0];
  const py = part.position[1];
  const pz = part.position[2];
  let len = Math.hypot(px, py * 0.45, pz);
  let dirX = px;
  let dirY = py;
  let dirZ = pz;
  if (len < 0.35) {
    const a = index * 2.399;
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

function snapValue(n: number, step: number) {
  return Math.round(n / step) * step;
}

function CameraRig({ view, maxDimension }: { view: DrawingView; maxDimension: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const distance = Math.max(14, maxDimension * 1.55);
    const lookY = Math.max(1.2, maxDimension * 0.22);
    const positions: Record<DrawingView, [number, number, number]> = {
      perspective: [distance * 0.9, distance * 0.48, distance * 1.05],
      top: [0, distance * 1.35, 0.01],
      front: [0, lookY, distance * 1.2],
      side: [distance * 1.2, lookY, 0],
    };
    camera.position.set(...positions[view]);
    camera.up.set(0, view === "top" ? 0 : 1, view === "top" ? -1 : 0);
    camera.lookAt(0, lookY * 0.7, 0);
    if (view !== "perspective" && "zoom" in camera) {
      (camera as THREE.OrthographicCamera).zoom = Math.max(
        8,
        Math.min(100, 420 / Math.max(1, maxDimension))
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
    ref.current.rotation.y += delta * 0.035;
  });
  return <group ref={ref}>{children}</group>;
}

function EditablePart({
  part,
  index,
  selected,
  exploded,
  assembling,
  cadTool,
  snap,
  snapStep,
  onSelect,
  onPartChange,
}: {
  part: ModelPart;
  index: number;
  selected: boolean;
  exploded: boolean;
  assembling: boolean;
  cadTool: CadTool;
  snap: boolean;
  snapStep: number;
  onSelect: () => void;
  onPartChange?: (id: string, patch: Partial<ModelPart>) => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const progress = useRef(exploded ? 0 : 1);

  useEffect(() => {
    if (assembling) progress.current = 0;
  }, [assembling, part.id]);

  useFrame((_, delta) => {
    if (!mesh.current || (selected && cadTool !== "select" && !exploded && !assembling)) return;
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

  const glass = /стекл|glass|витраж/i.test(part.material);
  const metal = /стал|металл|алюмин|metal|трос/i.test(part.material);
  const showGizmo = selected && cadTool !== "select" && !exploded && !assembling && onPartChange;

  return (
    <>
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
          <cylinderGeometry args={[part.size[0], part.size[2], part.size[1], 32]} />
        ) : (
          <boxGeometry args={part.size} />
        )}
        <meshStandardMaterial
          color={part.color}
          emissive={selected ? "#a78bfa" : glass ? part.color : "#000000"}
          emissiveIntensity={selected ? 0.35 : glass ? 0.2 : 0}
          roughness={glass ? 0.12 : metal ? 0.35 : 0.62}
          metalness={metal ? 0.55 : glass ? 0.15 : 0.08}
          transparent={glass}
          opacity={glass ? 0.55 : 1}
          envMapIntensity={glass ? 1.4 : metal ? 1.1 : 0.55}
        />
        <Edges color={selected ? "#a78bfa" : "#3a3a3a"} threshold={22} />
        {selected && (
          <Html center position={[0, Math.max(0.5, part.size[1] / 2 + 0.45), 0]} distanceFactor={12}>
            <div className="pointer-events-none whitespace-nowrap rounded-md border border-violet-400/50 bg-black/75 px-3 py-1.5 text-[11px] text-violet-50">
              <span className="font-semibold">{part.name}</span>
            </div>
          </Html>
        )}
      </mesh>
      {showGizmo && mesh.current && (
        <TransformControls
          object={mesh.current}
          mode={cadTool === "rotate" ? "rotate" : cadTool === "scale" ? "scale" : "translate"}
          onObjectChange={() => {
            if (!mesh.current || !onPartChange) return;
            let px = mesh.current.position.x;
            let py = mesh.current.position.y;
            let pz = mesh.current.position.z;
            if (snap) {
              px = snapValue(px, snapStep);
              py = snapValue(py, snapStep);
              pz = snapValue(pz, snapStep);
              mesh.current.position.set(px, py, pz);
            }
            if (cadTool === "scale") {
              const sx = Math.max(0.05, Math.abs(mesh.current.scale.x) * part.size[0]);
              const sy = Math.max(0.05, Math.abs(mesh.current.scale.y) * part.size[1]);
              const sz = Math.max(0.05, Math.abs(mesh.current.scale.z) * part.size[2]);
              onPartChange(part.id, {
                position: [px, py, pz],
                size: [
                  snap ? snapValue(sx, snapStep) : sx,
                  snap ? snapValue(sy, snapStep) : sy,
                  snap ? snapValue(sz, snapStep) : sz,
                ],
                rotation: [
                  mesh.current.rotation.x,
                  mesh.current.rotation.y,
                  mesh.current.rotation.z,
                ],
              });
              mesh.current.scale.set(1, 1, 1);
            } else {
              onPartChange(part.id, {
                position: [px, py, pz],
                rotation: [
                  mesh.current.rotation.x,
                  mesh.current.rotation.y,
                  mesh.current.rotation.z,
                ],
              });
            }
          }}
        />
      )}
    </>
  );
}

function GlbModel({
  url,
  transform,
  cadTool,
  snap,
  snapStep,
  onTransform,
}: {
  url: string;
  transform: MeshTransform;
  cadTool: CadTool;
  snap: boolean;
  snapStep: number;
  onTransform?: (next: MeshTransform) => void;
}) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const group = useRef<Group>(null);

  useEffect(() => {
    if (!group.current) return;
    group.current.position.set(...transform.position);
    group.current.rotation.set(...transform.rotation);
    group.current.scale.set(...transform.scale);
  }, [transform]);

  const showGizmo = cadTool !== "select" && onTransform;

  return (
    <>
      <group ref={group}>
        <Center>
          <primitive object={cloned} scale={1.2} />
        </Center>
      </group>
      {showGizmo && group.current && (
        <TransformControls
          object={group.current}
          mode={cadTool === "rotate" ? "rotate" : cadTool === "scale" ? "scale" : "translate"}
          onObjectChange={() => {
            if (!group.current || !onTransform) return;
            let { x, y, z } = group.current.position;
            if (snap) {
              x = snapValue(x, snapStep);
              y = snapValue(y, snapStep);
              z = snapValue(z, snapStep);
              group.current.position.set(x, y, z);
            }
            onTransform({
              position: [x, y, z],
              rotation: [
                group.current.rotation.x,
                group.current.rotation.y,
                group.current.rotation.z,
              ],
              scale: [
                Math.max(0.05, group.current.scale.x),
                Math.max(0.05, group.current.scale.y),
                Math.max(0.05, group.current.scale.z),
              ],
            });
          }}
        />
      )}
    </>
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
  cadTool = "select",
  snap = true,
  snapStep = 0.1,
  meshTransform,
  onMeshTransform,
  onPartChange,
  meshProviderLabel,
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
  cadTool?: CadTool;
  snap?: boolean;
  snapStep?: number;
  meshTransform?: MeshTransform;
  onMeshTransform?: (next: MeshTransform) => void;
  onPartChange?: (id: string, patch: Partial<ModelPart>) => void;
  meshProviderLabel?: string;
}) {
  const hasMesh = Boolean(showMesh && concept.meshUrl);
  const transform = meshTransform ?? {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  };
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

  const fogNear = Math.max(18, maxDimension * 1.8);
  const fogFar = Math.max(45, maxDimension * 4.5);
  const groundY = -Math.max(1.2, maxDimension * 0.02);
  const orbitEnabled = view === "perspective" && cadTool === "select";

  return (
    <div className={`relative h-full min-h-[420px] overflow-hidden bg-[#2b2d33] ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.12),transparent_60%)]" />
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded border border-white/15 bg-black/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/80 backdrop-blur">
        {assembling
          ? "ASSEMBLING…"
          : hasMesh
            ? `${meshProviderLabel || "MESH"} · CAD`
            : exploded
              ? "EXPLODED · IRON MAN"
              : cadTool !== "select"
                ? `CAD · ${cadTool.toUpperCase()}`
                : "ORBIT · ZOOM · SELECT"}
      </div>
      <Canvas
        key={`${view}-${hasMesh ? "mesh" : "parts"}-${concept.name}`}
        shadows={view === "perspective"}
        orthographic={view !== "perspective"}
        dpr={[1, 1.6]}
        camera={
          view === "perspective"
            ? { position: [14, 8, 16], fov: 40, near: 0.1, far: 500 }
            : { position: [0, 0, 20], zoom: 32, near: -400, far: 400 }
        }
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.55,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        onPointerMissed={() => onSelect(null)}
      >
        <CameraRig view={view} maxDimension={hasMesh ? 8 : maxDimension} />
        <color attach="background" args={["#32353c"]} />
        <fog attach="fog" args={["#32353c", fogNear, fogFar]} />

        <hemisphereLight args={["#ffffff", "#8a909a", 1.35]} />
        <ambientLight intensity={1.25} />
        <directionalLight
          position={[maxDimension * 0.8, maxDimension * 1.4, maxDimension * 0.6]}
          intensity={2.8}
          castShadow
          color="#fff7ea"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight
          position={[-maxDimension * 0.7, maxDimension * 0.6, -maxDimension * 0.5]}
          intensity={1.35}
          color="#d8e4ff"
        />
        <directionalLight position={[0, maxDimension * 0.4, maxDimension]} intensity={1.1} color="#ffffff" />

        <Suspense fallback={null}>
          <Environment preset="city" />
        </Suspense>

        <SoftSpin
          enabled={
            autoRotate &&
            view === "perspective" &&
            !exploded &&
            !assembling &&
            cadTool === "select"
          }
        >
          {hasMesh && concept.meshUrl ? (
            <Suspense fallback={null}>
              <GlbModel
                url={concept.meshUrl}
                transform={transform}
                cadTool={cadTool}
                snap={snap}
                snapStep={snapStep}
                onTransform={onMeshTransform}
              />
            </Suspense>
          ) : (
            <group position={[0, 0.05, 0]}>
              {concept.parts.map((part, index) => (
                <EditablePart
                  key={part.id}
                  part={part}
                  index={index}
                  selected={part.id === selectedId}
                  exploded={exploded}
                  assembling={assembling}
                  cadTool={cadTool}
                  snap={snap}
                  snapStep={snapStep}
                  onSelect={() => onSelect(part.id)}
                  onPartChange={onPartChange}
                />
              ))}
            </group>
          )}
        </SoftSpin>

        {view === "perspective" && (
          <>
            <Grid
              position={[0, groundY, 0]}
              args={[Math.max(40, maxDimension * 4), Math.max(40, maxDimension * 4)]}
              cellSize={Math.max(snapStep, maxDimension / 24)}
              cellThickness={0.6}
              cellColor="#4a4e56"
              sectionSize={Math.max(2, maxDimension / 6)}
              sectionThickness={1.1}
              sectionColor="#6a707a"
              fadeDistance={Math.max(28, maxDimension * 3)}
              fadeStrength={1}
              infiniteGrid
            />
            <ContactShadows
              position={[0, groundY + 0.02, 0]}
              opacity={0.45}
              scale={Math.max(24, maxDimension * 2.5)}
              blur={2.5}
              far={Math.max(10, maxDimension)}
            />
          </>
        )}
        <OrbitControls
          makeDefault
          enabled={orbitEnabled}
          enablePan
          minDistance={2}
          maxDistance={Math.max(40, maxDimension * 3.5)}
          maxPolarAngle={Math.PI * 0.495}
          target={[0, Math.max(1, maxDimension * 0.2), 0]}
        />
      </Canvas>
    </div>
  );
}
