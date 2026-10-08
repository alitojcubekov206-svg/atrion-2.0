"use client";

import { Grid, Stars } from "@react-three/drei";
import AmbientCanvas from "@/frontend/components/three/AmbientCanvas";
import BlueprintModel from "@/frontend/components/three/BlueprintModel";
import SideFraming from "@/frontend/components/three/SideFraming";

const BG = "#050507";
const FLOOR_Y = -1.1;

/** `lite` trades a few frames and the antialiasing for a lighter GPU load. */
export default function HeroScene({ lite = false }: { lite?: boolean }) {
  return (
    <div className="absolute inset-0 -z-10">
      <AmbientCanvas
        fps={lite ? 24 : 30}
        camera={{ position: [6.2, 1.9, 7.4], fov: 40 }}
        gl={{ antialias: !lite }}
      >
        <fog attach="fog" args={[BG, 12, 30]} />
        <SideFraming desktopShift={0.22} phoneLift={0.22} />
        <BlueprintModel position={[-0.45, FLOOR_Y, -0.1]} scale={0.52} />
        <Grid
          position={[0, FLOOR_Y - 0.01, 0]}
          args={[40, 40]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#1a1428"
          sectionSize={2.5}
          sectionThickness={1}
          sectionColor="#6d28d9"
          fadeDistance={22}
          fadeStrength={1}
          infiniteGrid
        />
        <Stars radius={60} depth={30} count={lite ? 150 : 400} factor={2.2} saturation={0} fade speed={0.35} />
      </AmbientCanvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(5,5,7,0.35)_75%,rgba(5,5,7,0.8)_96%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#050507]/80 to-transparent" />
    </div>
  );
}
