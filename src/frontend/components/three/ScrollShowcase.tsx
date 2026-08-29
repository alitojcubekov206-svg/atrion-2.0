"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { animate, motion, useMotionValue, useScroll, useTransform } from "framer-motion";
import * as THREE from "three";

const VIOLET = "#a78bfa";
const VIOLET_HOT = "#c4b5fd";
const MAGENTA = "#e879f9";
const BG = "#050507";

function easeOutCubic(t: number) {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}

/** One structural fragment: flies in from a scattered start position to its
 * final place in the tower as the user scrolls, mirroring the app's own
 * assemble/explode animation used in the real 3D editor. */
interface Piece {
  finalPos: [number, number, number];
  scatterPos: [number, number, number];
  size: [number, number, number];
  color: string;
  emissive: string;
  emissiveBase: number;
  glow?: boolean;
  shape: "box" | "cylinder";
}

function buildPieces(): Piece[] {
  const pieces: Piece[] = [];
  const rand = (seed: number) => {
    const x = Math.sin(seed * 999.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const scatterFor = (i: number, radius: number): [number, number, number] => {
    const a = rand(i) * Math.PI * 2;
    const b = rand(i + 50) * Math.PI - Math.PI / 2;
    const r = radius * (0.7 + rand(i + 100) * 0.9);
    return [Math.cos(a) * Math.cos(b) * r, Math.abs(Math.sin(b)) * r * 0.6 + 1, Math.sin(a) * Math.cos(b) * r];
  };

  // Core massing: base, mid volume, crown.
  pieces.push({
    finalPos: [0, 0.4, 0],
    scatterPos: scatterFor(1, 14),
    size: [6.4, 0.8, 4.6],
    color: "#141018",
    emissive: "#1a1028",
    emissiveBase: 0.25,
    shape: "box",
  });
  pieces.push({
    finalPos: [0, 3.6, 0],
    scatterPos: scatterFor(2, 16),
    size: [5.2, 5.6, 3.8],
    color: "#241c30",
    emissive: "#3b2a55",
    emissiveBase: 0.3,
    shape: "box",
  });
  pieces.push({
    finalPos: [0, 6.9, 0],
    scatterPos: scatterFor(3, 15),
    size: [5.6, 0.5, 4],
    color: "#1a1424",
    emissive: "#120e1c",
    emissiveBase: 0.2,
    shape: "box",
  });

  // Facade glass band, floor by floor — these are the "windows" that glow.
  const floors = 6;
  for (let f = 0; f < floors; f += 1) {
    const y = 1.1 + f * 0.85;
    pieces.push({
      finalPos: [0, y, 1.95],
      scatterPos: scatterFor(10 + f, 12 + f),
      size: [4.6, 0.55, 0.05],
      color: VIOLET_HOT,
      emissive: VIOLET,
      emissiveBase: 0.15,
      glow: true,
      shape: "box",
    });
  }

  // Side volume / wing.
  pieces.push({
    finalPos: [3.9, 1.5, 0],
    scatterPos: scatterFor(30, 17),
    size: [1.6, 2.8, 3.2],
    color: "#3a2d4e",
    emissive: MAGENTA,
    emissiveBase: 0.18,
    shape: "box",
  });

  // Antenna / spire.
  pieces.push({
    finalPos: [-1.4, 8.1, -0.6],
    scatterPos: scatterFor(40, 18),
    size: [0.05, 1.6, 0.05],
    color: MAGENTA,
    emissive: MAGENTA,
    emissiveBase: 1.1,
    shape: "cylinder",
  });

  return pieces;
}

function TowerPiece({ piece, index, assembleT, glowT }: { piece: Piece; index: number; assembleT: number; glowT: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const t = easeOutCubic(assembleT);

  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.position.set(
      THREE.MathUtils.lerp(piece.scatterPos[0], piece.finalPos[0], t),
      THREE.MathUtils.lerp(piece.scatterPos[1], piece.finalPos[1], t),
      THREE.MathUtils.lerp(piece.scatterPos[2], piece.finalPos[2], t)
    );
    const spin = (1 - t) * 2.4;
    mesh.current.rotation.set(spin * 0.6, spin, spin * 0.3);
    const mat = mesh.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = piece.emissiveBase + (piece.glow ? glowT * 1.6 : 0);
    mat.opacity = 0.25 + t * 0.75;
  });

  return (
    <mesh ref={mesh} castShadow receiveShadow>
      {piece.shape === "cylinder" ? (
        <cylinderGeometry args={[piece.size[0], piece.size[2], piece.size[1], 12]} />
      ) : (
        <boxGeometry args={piece.size} />
      )}
      <meshStandardMaterial
        color={piece.color}
        emissive={piece.emissive}
        emissiveIntensity={piece.emissiveBase}
        metalness={0.35}
        roughness={0.4}
        transparent
        opacity={0.3}
      />
    </mesh>
  );
}

function HaloRings({ revealT }: { revealT: number }) {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (a.current) {
      a.current.rotation.z = t * 0.15;
      (a.current.material as THREE.MeshBasicMaterial).opacity = revealT * 0.65;
    }
    if (b.current) {
      b.current.rotation.z = -t * 0.1;
      (b.current.material as THREE.MeshBasicMaterial).opacity = revealT * 0.4;
    }
  });
  return (
    <>
      <mesh ref={a} rotation={[Math.PI / 2, 0, 0]} position={[0, 4, 0]}>
        <torusGeometry args={[6.5, 0.02, 12, 96]} />
        <meshBasicMaterial color={VIOLET_HOT} transparent opacity={0} />
      </mesh>
      <mesh ref={b} rotation={[Math.PI / 2.3, 0.2, 0.1]} position={[0, 4, 0]}>
        <torusGeometry args={[7.6, 0.015, 12, 96]} />
        <meshBasicMaterial color={MAGENTA} transparent opacity={0} />
      </mesh>
    </>
  );
}

/** Piecewise-linear camera path so scroll position maps to an exact framing. */
const WAYPOINTS: { p: number; pos: [number, number, number]; look: [number, number, number] }[] = [
  { p: 0, pos: [0, 5, 24], look: [0, 4, 0] },
  { p: 0.32, pos: [10, 7, 15], look: [0, 4.5, 0] },
  { p: 0.68, pos: [3.5, 5.5, 6.5], look: [0, 5.5, 1.5] },
  { p: 1, pos: [-11, 9, 15], look: [0, 4.5, 0] },
];

function sampleWaypoints(p: number) {
  const clamped = THREE.MathUtils.clamp(p, 0, 1);
  for (let i = 0; i < WAYPOINTS.length - 1; i += 1) {
    const cur = WAYPOINTS[i];
    const next = WAYPOINTS[i + 1];
    if (clamped >= cur.p && clamped <= next.p) {
      const local = (clamped - cur.p) / (next.p - cur.p || 1);
      const e = easeOutCubic(local);
      return {
        pos: cur.pos.map((v, idx) => THREE.MathUtils.lerp(v, next.pos[idx], e)) as [number, number, number],
        look: cur.look.map((v, idx) => THREE.MathUtils.lerp(v, next.look[idx], e)) as [number, number, number],
      };
    }
  }
  return { pos: WAYPOINTS.at(-1)!.pos, look: WAYPOINTS.at(-1)!.look };
}

function CameraRig({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const { camera } = useThree();
  const lookTarget = useRef(new THREE.Vector3(0, 4, 0));

  useFrame((_, delta) => {
    const { pos, look } = sampleWaypoints(progressRef.current);
    const lambda = 6;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pos[0], lambda, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, pos[1], lambda, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, pos[2], lambda, delta);
    lookTarget.current.x = THREE.MathUtils.damp(lookTarget.current.x, look[0], lambda, delta);
    lookTarget.current.y = THREE.MathUtils.damp(lookTarget.current.y, look[1], lambda, delta);
    lookTarget.current.z = THREE.MathUtils.damp(lookTarget.current.z, look[2], lambda, delta);
    camera.lookAt(lookTarget.current);
  });
  return null;
}

function ShowcaseScene({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const pieces = useMemo(() => buildPieces(), []);
  const [assembleT, setAssembleT] = useState(0);
  const [glowT, setGlowT] = useState(0);
  const [revealT, setRevealT] = useState(0);

  useFrame(() => {
    const p = progressRef.current;
    setAssembleT(THREE.MathUtils.clamp(p / 0.5, 0, 1));
    setGlowT(THREE.MathUtils.clamp((p - 0.45) / 0.25, 0, 1));
    setRevealT(THREE.MathUtils.clamp((p - 0.62) / 0.3, 0, 1));
  });

  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 14, 34]} />
      <hemisphereLight args={["#e9d5ff", BG, 0.85]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 14, 6]} intensity={2} color="#faf5ff" />
      <pointLight position={[-8, 5, -3]} intensity={60} color={VIOLET} distance={30} decay={1.5} />
      <CameraRig progressRef={progressRef} />
      <group position={[0, -1, 0]}>
        {pieces.map((piece, i) => (
          <TowerPiece key={i} piece={piece} index={i} assembleT={assembleT} glowT={glowT} />
        ))}
        <HaloRings revealT={revealT} />
      </group>
      <Stars radius={60} depth={30} count={350} factor={2} saturation={0} fade speed={0.3} />
    </>
  );
}

function ScrollCanvas({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const host = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      rootMargin: "200px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={host} className="absolute inset-0">
      <Canvas
        frameloop={onScreen ? "always" : "never"}
        dpr={[1, 1.5]}
        camera={{ position: [0, 5, 24], fov: 42 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.4,
        }}
      >
        <ShowcaseScene progressRef={progressRef} />
      </Canvas>
    </div>
  );
}

function Caption({
  opacity,
  eyebrow,
  title,
  body,
  align = "left",
}: {
  opacity: import("framer-motion").MotionValue<number>;
  eyebrow: string;
  title: string;
  body: string;
  align?: "left" | "right";
}) {
  return (
    <motion.div
      style={{ opacity }}
      className={`pointer-events-none absolute top-1/2 max-w-md -translate-y-1/2 px-6 md:px-0 ${
        align === "left" ? "left-6 md:left-16 text-left" : "right-6 md:right-16 text-right"
      }`}
    >
      <p className="hud-chip inline-block rounded-full px-3 py-1 text-[10px] text-violet-200/90">{eyebrow}</p>
      <h3 className="display mt-4 text-3xl font-semibold leading-tight text-white md:text-5xl">{title}</h3>
      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[#a49dae] md:text-base">{body}</p>
    </motion.div>
  );
}

/** Below this width, scrubbing a 340vh section by touch is a poor experience —
 * the sequence autoplays on a loop instead once it scrolls into view. */
const MOBILE_QUERY = "(max-width: 768px)";
const AUTOPLAY_SECONDS = 7.5;
/** Pause after the section is reached before the first loop starts, so it
 * doesn't fire the instant a user's scroll flicks past the trigger point. */
const AUTOPLAY_START_DELAY = 1.4;

export default function ScrollShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const progress = useMotionValue(0);
  const [isMobile, setIsMobile] = useState(false);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    setIsMobile(window.matchMedia(MOBILE_QUERY).matches);
  }, []);

  useEffect(() => {
    return progress.on("change", (v) => {
      progressRef.current = v;
    });
  }, [progress]);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] });

  // Desktop: progress tracks scroll position exactly (scrubbed).
  useEffect(() => {
    if (isMobile) return;
    return scrollYProgress.on("change", (v) => progress.set(v));
  }, [isMobile, scrollYProgress, progress]);

  // Mobile: progress plays through once on its own when the section is reached.
  // Polled via rAF rather than a scroll/IntersectionObserver listener — the
  // section is exactly one viewport tall, so a scrubbed scroll range would be
  // degenerate (start/end resolve to the same scroll position) and some
  // embedded/automated browser contexts don't dispatch scroll events for
  // programmatic scrolling at all.
  useEffect(() => {
    if (!isMobile) return;
    let raf = 0;
    const check = () => {
      const el = containerRef.current;
      if (el && !hasPlayedRef.current && el.getBoundingClientRect().top < window.innerHeight * 0.6) {
        hasPlayedRef.current = true;
        animate(progress, [0, 1], {
          duration: AUTOPLAY_SECONDS,
          delay: AUTOPLAY_START_DELAY,
          ease: "easeInOut",
          repeat: Infinity,
        });
      }
      if (!hasPlayedRef.current) raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [isMobile, progress]);

  const cap1 = useTransform(progress, [0, 0.06, 0.28, 0.34], [0, 1, 1, 0]);
  const cap2 = useTransform(progress, [0.34, 0.4, 0.6, 0.66], [0, 1, 1, 0]);
  // On mobile the sequence loops, so step 3 fades back out before the reset
  // instead of holding solid — on desktop it stays visible once fully scrolled.
  const cap3 = useTransform(
    progress,
    isMobile ? [0.66, 0.74, 0.92, 1] : [0.66, 0.74, 1],
    isMobile ? [0, 1, 1, 0] : [0, 1, 1]
  );
  const barScale = progress;

  return (
    <section
      ref={containerRef}
      data-scroll-showcase
      className={`relative bg-[#050507] ${isMobile ? "h-screen" : "h-[340vh]"}`}
    >
      <div
        className={`h-screen w-full overflow-hidden ${isMobile ? "relative" : "sticky top-0"}`}
      >
        <ScrollCanvas progressRef={progressRef} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(5,5,7,0.35)_75%,#050507_97%)]" />

        <Caption
          opacity={cap1}
          eyebrow="Шаг 1"
          title="Опишите идею"
          body="Один абзац текста — ИИ превращает слова в реальную геометрию, а не картинку."
          align="left"
        />
        <Caption
          opacity={cap2}
          eyebrow="Шаг 2"
          title="Материалы и конструкция"
          body="Стены, окна, перекрытия — каждая деталь становится отдельной 3D-частью со своими материалами."
          align="right"
        />
        <Caption
          opacity={cap3}
          eyebrow="Шаг 3"
          title="Цельная модель за минуты"
          body="Полностью готовая 3D-модель: крутите, разбирайте на части, дорабатывайте через чат."
          align="left"
        />

        <div className="pointer-events-none absolute right-4 top-1/2 h-40 w-[2px] -translate-y-1/2 overflow-hidden rounded-full bg-white/10 md:right-8">
          <motion.div
            style={{ scaleY: barScale }}
            className="h-full w-full origin-top bg-gradient-to-b from-[#a78bfa] to-[#e879f9]"
          />
        </div>
      </div>
    </section>
  );
}
