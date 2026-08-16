"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Edges,
  Grid,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Group } from "three";
import * as THREE from "three";
import type { ModelPart, PartShape, ThreeDConcept } from "@/lib/types";
import { expandPart, primitiveCount } from "@/lib/gen/kit";
import type { CadTool } from "@/components/CadToolbar";

export type DrawingView = "perspective" | "top" | "front" | "side";

/** Above this many rendered instances the wireframe overlay is dropped for speed. */
const EDGE_INSTANCE_LIMIT = 120;

/**
 * Explode direction for a single rendered instance — repeated rows fly apart
 * instead of collapsing on the authored part position.
 */
function explodeOffset(
  position: [number, number, number],
  size: [number, number, number],
  amount: number,
  index = 0
): [number, number, number] {
  const px = position[0];
  const py = position[1];
  const pz = position[2];
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
  const boost = 0.7 + Math.min(2, Math.max(size[0], size[1], size[2]) * 0.4);
  return [
    (dirX / len) * amount * boost * 2.6,
    (dirY / len) * amount * boost * 1.6 + amount * 0.55,
    (dirZ / len) * amount * boost * 2.6,
  ];
}

function snapValue(n: number, step: number) {
  return Math.round(n / step) * step;
}

/* ---------------- primitive vocabulary ---------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Triangle profiles in the xy plane; extruded along z, so the ridge runs along z. */
const PRISM_PROFILE: readonly [number, number][] = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0, 0.5],
];

const WEDGE_PROFILE: readonly [number, number][] = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
];

/** Closed 2D profile extruded 1 unit along z and centred on the origin. */
function extrudedProfile(points: readonly [number, number][]): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -0.5);
  return geometry;
}

/** Unit hollow cylinder (pipe, railing, ring frame) with its axis along +y. */
function hollowCylinder(holeRatio: number, segments: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
  const inner = new THREE.Path();
  inner.absarc(0, 0, 0.5 * holeRatio, 0, Math.PI * 2, true);
  shape.holes.push(inner);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    bevelEnabled: false,
    curveSegments: clamp(segments, 6, 64),
  });
  geometry.translate(0, 0, -0.5);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * Every `PartShape` under the bounding-box contract: `size` is always the full
 * extent [x, y, z]. The real size is baked into the geometry so the mesh scale
 * stays 1 — the CAD scale gizmo and the exporter both rely on that.
 */
function buildPartGeometry(
  shape: PartShape,
  size: [number, number, number],
  sides?: number,
  hole?: number,
  mesh?: ModelPart["mesh"]
): THREE.BufferGeometry {
  const sx = Math.max(0.001, Math.abs(size[0]));
  const sy = Math.max(0.001, Math.abs(size[1]));
  const sz = Math.max(0.001, Math.abs(size[2]));
  const radial = clamp(Math.round(sides ?? 32), 3, 64);

  switch (shape) {
    case "mesh": {
      // Boolean result: already centred and at real size, so never scaled.
      const geometry = new THREE.BufferGeometry();
      const positions = mesh?.position ?? [];
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      if (mesh?.normal?.length === positions.length) {
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normal, 3));
      } else {
        geometry.computeVertexNormals();
      }
      return geometry;
    }
    case "plane": {
      // Thin slab: never thicker than 6% of its smaller footprint side.
      const thickness = Math.max(0.004, Math.min(sy, Math.min(sx, sz) * 0.06));
      return new THREE.BoxGeometry(sx, thickness, sz);
    }
    case "cylinder":
      // radiusTop from x, radiusBottom from z — truncated cones stay expressible.
      return new THREE.CylinderGeometry(sx / 2, sz / 2, sy, radial);
    case "sphere":
      return new THREE.SphereGeometry(0.5, 32, 24).scale(sx, sy, sz);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, radial).scale(sx, sy, sz);
    case "pyramid":
      // Circumradius √2⁄2 + 45° turn → an axis-aligned square base of side 1.
      return new THREE.ConeGeometry(Math.SQRT1_2, 1, 4)
        .rotateY(Math.PI / 4)
        .scale(sx, sy, sz);
    case "prism":
      return extrudedProfile(PRISM_PROFILE).scale(sx, sy, sz);
    case "wedge":
      return extrudedProfile(WEDGE_PROFILE).scale(sx, sy, sz);
    case "torus": {
      const tube = Math.max(0.005, sy / 2);
      const major = Math.max(0.01, sx / 2 - tube);
      const natural = (major + tube) * 2;
      return new THREE.TorusGeometry(major, tube, 12, clamp(radial, 6, 64))
        .rotateX(-Math.PI / 2)
        .scale(sx / natural, 1, sz / natural);
    }
    case "capsule": {
      const radius = Math.max(0.005, Math.min(sx, sz) / 2);
      const length = Math.max(0.001, sy - radius * 2);
      const natural = length + radius * 2;
      return new THREE.CapsuleGeometry(radius, length, 8, 24).scale(
        sx / (radius * 2),
        sy / natural,
        sz / (radius * 2)
      );
    }
    case "tube":
      return hollowCylinder(clamp(hole ?? 0.6, 0.05, 0.95), radial).scale(sx, sy, sz);
    case "box":
    default:
      return new THREE.BoxGeometry(sx, sy, sz);
  }
}

/**
 * One geometry per part, shared by every repeat/mirror instance of it and
 * rebuilt only when the shape parameters actually change — never per frame.
 * It is handed to the meshes as a `geometry` prop rather than as a
 * `<primitive attach="geometry">` child, because a single primitive object
 * cannot be mounted under several meshes at once.
 */
function usePartGeometry(part: ModelPart): THREE.BufferGeometry {
  const [sizeX, sizeY, sizeZ] = part.size;
  const mesh = part.mesh;
  const geometry = useMemo(
    () => buildPartGeometry(part.shape, [sizeX, sizeY, sizeZ], part.sides, part.hole, mesh),
    [part.shape, sizeX, sizeY, sizeZ, part.sides, part.hole, mesh]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
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
  totalInstances,
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
  totalInstances: number;
  selected: boolean;
  exploded: boolean;
  assembling: boolean;
  cadTool: CadTool;
  snap: boolean;
  snapStep: number;
  onSelect: () => void;
  onPartChange?: (id: string, patch: Partial<ModelPart>) => void;
}) {
  // meshes[0] is the authored instance — the only one the CAD gizmo drives.
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const progress = useRef(exploded ? 0 : 1);
  const geometry = usePartGeometry(part);
  const instances = useMemo(() => expandPart(part), [part]);

  useEffect(() => {
    if (assembling) progress.current = 0;
  }, [assembling, part.id]);

  useFrame((_, delta) => {
    if (selected && cadTool !== "select" && !exploded && !assembling) return;
    const target = exploded ? 0 : 1;
    progress.current = THREE.MathUtils.damp(
      progress.current,
      target,
      assembling ? 0.9 : 2.4,
      delta
    );
    const amount = 1 - progress.current;
    for (let i = 0; i < instances.length; i += 1) {
      const node = meshes.current[i];
      const instance = instances[i];
      if (!node || !instance) continue;
      const [ox, oy, oz] = explodeOffset(instance.position, instance.size, amount, index + i);
      node.position.set(
        instance.position[0] + ox,
        instance.position[1] + oy,
        instance.position[2] + oz
      );
    }
  });

  const glass = /стекл|glass|витраж/i.test(part.material);
  const metal = /стал|металл|алюмин|metal|трос/i.test(part.material);
  const opacity = part.opacity ?? (glass ? 0.55 : 1);
  const transparent = opacity < 1;
  const metalness = part.metalness ?? (metal ? 0.55 : glass ? 0.15 : 0.08);
  const roughness = part.roughness ?? (glass ? 0.12 : metal ? 0.35 : 0.62);
  const emissiveAmount = part.emissive ?? (glass ? 0.2 : 0);
  // Heavy scenes keep the wireframe only on the selected part.
  const showEdges = totalInstances <= EDGE_INSTANCE_LIMIT || selected;
  const showGizmo = selected && cadTool !== "select" && !exploded && !assembling && onPartChange;
  const anchor = meshes.current[0] ?? null;

  return (
    <>
      {instances.map((instance, i) => (
        <mesh
          key={`${part.id}-${i}`}
          ref={(node) => {
            meshes.current[i] = node;
          }}
          geometry={geometry}
          position={instance.position}
          rotation={instance.rotation}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={part.color}
            emissive={selected ? "#a78bfa" : emissiveAmount > 0 ? part.color : "#000000"}
            emissiveIntensity={selected ? Math.max(0.35, emissiveAmount) : emissiveAmount}
            roughness={roughness}
            metalness={metalness}
            transparent={transparent}
            opacity={opacity}
            envMapIntensity={glass ? 1.4 : metal ? 1.1 : 0.55}
          />
          {showEdges && <Edges color={selected ? "#a78bfa" : "#3a3a3a"} threshold={22} />}
        </mesh>
      ))}
      {showGizmo && anchor && (
        <TransformControls
          object={anchor}
          mode={cadTool === "rotate" ? "rotate" : cadTool === "scale" ? "scale" : "translate"}
          onObjectChange={() => {
            const node = meshes.current[0];
            if (!node || !onPartChange) return;
            let px = node.position.x;
            let py = node.position.y;
            let pz = node.position.z;
            if (snap) {
              px = snapValue(px, snapStep);
              py = snapValue(py, snapStep);
              pz = snapValue(pz, snapStep);
              node.position.set(px, py, pz);
            }
            if (cadTool === "scale") {
              const fx = Math.abs(node.scale.x) || 1;
              const fy = Math.abs(node.scale.y) || 1;
              const fz = Math.abs(node.scale.z) || 1;
              const sx = Math.max(0.05, fx * part.size[0]);
              const sy = Math.max(0.05, fy * part.size[1]);
              const sz = Math.max(0.05, fz * part.size[2]);
              onPartChange(part.id, {
                position: [px, py, pz],
                size: [
                  snap ? snapValue(sx, snapStep) : sx,
                  snap ? snapValue(sy, snapStep) : sy,
                  snap ? snapValue(sz, snapStep) : sz,
                ],
                rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
                // Baked geometry carries its own vertices — `size` alone would
                // change the numbers without changing what is on screen.
                ...(part.shape === "mesh" && part.mesh
                  ? {
                      mesh: {
                        position: part.mesh.position.map((value, index) =>
                          index % 3 === 0 ? value * fx : index % 3 === 1 ? value * fy : value * fz
                        ),
                        ...(part.mesh.normal ? { normal: part.mesh.normal } : {}),
                      },
                    }
                  : {}),
              });
              node.scale.set(1, 1, 1);
            } else {
              onPartChange(part.id, {
                position: [px, py, pz],
                rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
              });
            }
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
  cadTool = "select",
  snap = true,
  snapStep = 0.1,
  onPartChange,
}: {
  concept: ThreeDConcept;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  view?: DrawingView;
  exploded?: boolean;
  assembling?: boolean;
  className?: string;
  autoRotate?: boolean;
  cadTool?: CadTool;
  snap?: boolean;
  snapStep?: number;
  onPartChange?: (id: string, patch: Partial<ModelPart>) => void;
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
  /** Rendered primitives after repeat/mirror — drives the wireframe budget. */
  const totalInstances = useMemo(() => primitiveCount(concept.parts), [concept.parts]);

  const fogNear = Math.max(18, maxDimension * 1.8);
  const fogFar = Math.max(45, maxDimension * 4.5);
  const groundY = -Math.max(1.2, maxDimension * 0.02);
  const orbitEnabled = view === "perspective" && cadTool === "select";

  return (
    <div className={`relative h-full min-h-[420px] overflow-hidden bg-[#2b2d33] ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.12),transparent_60%)]" />
      <Canvas
        key={`${view}-${concept.name}`}
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
        <CameraRig view={view} maxDimension={maxDimension} />
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
          <group position={[0, 0.05, 0]}>
            {concept.parts.map((part, index) => (
              <EditablePart
                key={part.id}
                part={part}
                index={index}
                totalInstances={totalInstances}
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
