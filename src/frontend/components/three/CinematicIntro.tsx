"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AnimatePresence, motion } from "framer-motion";
import * as THREE from "three";

export const INTRO_DONE_EVENT = "atrion:intro-done";
const SESSION_KEY = "atrion_intro_played";

const ASSEMBLE_START = 0.15;
const ASSEMBLE_END = 1.45;
const BLAST_START = 2.05;
const BLAST_END = 2.75;
const TOTAL = 2.85;

const VERTEX = /* glsl */ `
  uniform float uProgress;
  uniform float uBlast;
  uniform float uTime;
  uniform float uPixelRatio;
  attribute vec3 aTarget;
  attribute float aSeed;
  varying float vSeed;
  varying float vBlast;

  void main() {
    float stagger = clamp((uProgress - aSeed * 0.35) / 0.65, 0.0, 1.0);
    float eased = 1.0 - pow(1.0 - stagger, 4.0);
    vec3 p = mix(position, aTarget, eased);
    p += vec3(sin(uTime * 2.0 + aSeed * 20.0), cos(uTime * 1.7 + aSeed * 13.0), 0.0) * 0.03 * eased;

    vec3 dir = normalize(p + vec3(0.0, 0.0, 0.001));
    float b = uBlast * uBlast;
    p += dir * b * 70.0;
    p.z += b * 60.0 * (0.4 + aSeed);

    vSeed = aSeed;
    vBlast = uBlast;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.3 + aSeed * 1.9) * uPixelRatio * (44.0 / max(-mv.z, 0.1));
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vSeed;
  varying float vBlast;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.08, d);
    vec3 tint = mix(uColorA, uColorB, vSeed);
    vec3 col = mix(vec3(1.0), tint, 0.45 + vSeed * 0.4);
    gl_FragColor = vec4(col, soft * (0.95 - vBlast * 0.95));
  }
`;

function displayFontFamily() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
  return raw || "ui-sans-serif, system-ui, sans-serif";
}

function sampleText(text: string, count: number, fontFamily: string) {
  const W = 1400;
  const H = 320;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const targets = new Float32Array(count * 3);
  if (!ctx) return targets;

  ctx.fillStyle = "#fff";
  ctx.font = `700 230px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2);

  const data = ctx.getImageData(0, 0, W, H).data;
  const found: number[] = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 128) found.push(x, y);
    }
  }
  const n = found.length / 2;
  for (let i = 0; i < count; i += 1) {
    if (n === 0) {
      const a = (i / count) * Math.PI * 2;
      targets[i * 3] = Math.cos(a) * 6;
      targets[i * 3 + 1] = Math.sin(a) * 2;
      targets[i * 3 + 2] = 0;
      continue;
    }
    const k = Math.floor(((i / count) * n + Math.random() * (n / count)) % n);
    const px = found[k * 2];
    const py = found[k * 2 + 1];
    targets[i * 3] = ((px - W / 2) / W) * 16;
    targets[i * 3 + 1] = (-(py - H / 2) / W) * 16;
    targets[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
  }
  return targets;
}

function IntroParticles({
  targets,
  count,
  onDone,
}: {
  targets: Float32Array;
  count: number;
  onDone: () => void;
}) {
  const dpr = useThree((s) => s.gl.getPixelRatio());
  const camera = useThree((s) => s.camera);
  const started = useRef<number | null>(null);
  const finished = useRef(false);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const r = 14 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      positions[i * 3 + 2] = r * Math.cos(phi) - 6;
      seeds[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return geo;
  }, [count, targets]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uProgress: { value: 0 },
          uBlast: { value: 0 },
          uTime: { value: 0 },
          uPixelRatio: { value: dpr },
          uColorA: { value: new THREE.Color("#c4b5fd") },
          uColorB: { value: new THREE.Color("#e879f9") },
        },
      }),
    [dpr]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    if (started.current === null) started.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - started.current;
    const u = material.uniforms;
    u.uTime.value = t;
    u.uProgress.value = THREE.MathUtils.clamp((t - ASSEMBLE_START) / (ASSEMBLE_END - ASSEMBLE_START), 0, 1);
    const blast = THREE.MathUtils.clamp((t - BLAST_START) / (BLAST_END - BLAST_START), 0, 1);
    u.uBlast.value = blast;

    const dolly = THREE.MathUtils.clamp(t / BLAST_START, 0, 1);
    const eased = 1 - Math.pow(1 - dolly, 3);
    camera.position.z = THREE.MathUtils.lerp(30, 21, eased) - blast * blast * 14;
    camera.lookAt(0, 0, 0);

    if (t > TOTAL && !finished.current) {
      finished.current = true;
      onDone();
    }
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

export default function CinematicIntro() {
  const [visible, setVisible] = useState(true);
  const [instant, setInstant] = useState(false);
  const [targets, setTargets] = useState<Float32Array | null>(null);
  const [blasting, setBlasting] = useState(false);
  const count = useMemo(
    () =>
      typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches ? 2600 : 6500,
    []
  );

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let played = false;
    try {
      played = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      played = false;
    }
    if (reduced || played) {
      setInstant(true);
      setVisible(false);
      window.dispatchEvent(new Event(INTRO_DONE_EVENT));
      return;
    }

    document.documentElement.dataset.intro = "playing";
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let cancelled = false;
    const family = displayFontFamily();
    // Load only the primary face: asking for the whole family list resolves as
    // soon as the metric fallback is available, before Unbounded itself has loaded.
    const primary = family.split(",")[0].trim();
    const ready = Promise.race([
      document.fonts.load(`700 230px ${primary}`).then(() => document.fonts.ready),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
    ready.then(() => {
      if (!cancelled) setTargets(sampleText("ATRION", count, family));
    });

    const blastTimer = setTimeout(() => setBlasting(true), BLAST_START * 1000 + 350);

    return () => {
      cancelled = true;
      clearTimeout(blastTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [count]);

  function finish() {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Private mode: the intro simply plays again next time.
    }
    document.body.style.overflow = "";
    delete document.documentElement.dataset.intro;
    setVisible(false);
    window.dispatchEvent(new Event(INTRO_DONE_EVENT));
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: instant ? 0 : 0.55, ease: "easeInOut" } }}
          className="fixed inset-0 z-[200] bg-[#050507]"
          aria-label="Заставка Atrion"
          role="img"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.18),transparent_60%)]" />
          {targets && (
            <Canvas
              dpr={[1, 1.5]}
              camera={{ position: [0, 0, 30], fov: 40 }}
              gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
            >
              <IntroParticles targets={targets} count={count} onDone={finish} />
            </Canvas>
          )}

          <AnimatePresence>
            {blasting && (
              <>
                <motion.div
                  key="streak-a"
                  initial={{ x: "-120%", opacity: 0 }}
                  animate={{ x: "120%", opacity: [0, 1, 0] }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className="pointer-events-none absolute inset-y-0 left-0 w-full -skew-x-12 bg-gradient-to-r from-transparent via-[#c4b5fd]/70 to-transparent"
                  style={{ maskImage: "linear-gradient(90deg, transparent, black 45%, black 55%, transparent)" }}
                />
                <motion.div
                  key="streak-b"
                  initial={{ x: "120%", opacity: 0 }}
                  animate={{ x: "-120%", opacity: [0, 0.8, 0] }}
                  transition={{ duration: 0.55, delay: 0.08, ease: "easeInOut" }}
                  className="pointer-events-none absolute inset-y-0 left-0 w-full skew-x-12 bg-gradient-to-r from-transparent via-[#e879f9]/60 to-transparent"
                  style={{ maskImage: "linear-gradient(90deg, transparent, black 45%, black 55%, transparent)" }}
                />
              </>
            )}
          </AnimatePresence>

          <motion.p
            initial={{ opacity: 0, y: 10, letterSpacing: "0.3em" }}
            animate={{ opacity: [0, 1, 1, 0], y: 0, letterSpacing: "0.08em" }}
            transition={{ duration: 2.3, delay: 1.2, times: [0, 0.25, 0.7, 1], ease: "easeOut" }}
            className="display pointer-events-none absolute inset-x-0 top-[62%] text-center text-lg text-[#a78bfa] md:text-2xl"
          >
            Just build it.
          </motion.p>

          <button
            type="button"
            onClick={finish}
            className="absolute right-5 top-5 rounded-full border border-white/15 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted transition hover:border-white/40 hover:text-white"
          >
            Пропустить
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
