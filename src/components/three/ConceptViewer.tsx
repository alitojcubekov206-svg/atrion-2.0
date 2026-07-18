"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Edges, Grid, Html, OrbitControls } from "@react-three/drei";
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

export default function ConceptViewer({
  concept,
  selectedId,
  onSelect,
}: {
  concept: ThreeDConcept;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="relative h-[520px] overflow-hidden rounded-2xl border border-line bg-[#07070c]">
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border border-line bg-bg/70 px-3 py-1.5 text-xs text-muted backdrop-blur">
        Drag to rotate · Scroll to zoom · Click a part
      </div>
      <Canvas
        shadows
        camera={{ position: [8, 6, 9], fov: 42 }}
        onPointerMissed={() => onSelect(null)}
      >
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
        <OrbitControls makeDefault enablePan minDistance={3} maxDistance={22} />
      </Canvas>
    </div>
  );
}
