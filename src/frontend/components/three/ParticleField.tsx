"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { motion } from "framer-motion";
import * as THREE from "three";
import AmbientCanvas from "@/frontend/components/three/AmbientCanvas";
import { useEffects } from "@/frontend/effects";

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3 uRipple;
  uniform float uPixelRatio;
  uniform float uReduced;
  attribute float aSeed;
  varying float vGlow;
  varying float vSeed;

  void main() {
    vec3 p = position;
    float t = uTime * (1.0 - uReduced);

    p.x += sin(t * 0.35 + aSeed * 6.2831 + p.y * 0.35) * 0.18;
    p.y += cos(t * 0.28 + aSeed * 4.0 + p.x * 0.3) * 0.18;

    float age = uTime - uRipple.z;
    float rd = distance(p.xy, uRipple.xy);
    float ring = exp(-pow((rd - age * 5.5) * 1.3, 2.0)) * exp(-age * 1.1) * step(0.0, age) * (1.0 - uReduced);
    p.xy += normalize(p.xy - uRipple.xy + 0.0001) * ring * 0.8;
    p.z += ring * 1.6;

    vGlow = clamp(ring * 2.2, 0.0, 1.0);
    vSeed = aSeed;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.5 + fract(aSeed * 7.31) * 1.5 + vGlow * 3.2) * uPixelRatio * (11.0 / -mv.z);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uScroll;
  uniform float uAlpha;
  varying float vGlow;
  varying float vSeed;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.06, d);
    vec3 base = mix(uColorA, uColorB, smoothstep(0.0, 0.5, uScroll));
    base = mix(base, uColorC, smoothstep(0.5, 1.0, uScroll));
    vec3 col = mix(base, vec3(1.0), vGlow * 0.7);
    float alpha = soft * (0.2 + 0.22 * fract(vSeed * 3.7) + vGlow * 0.75) * uAlpha;
    gl_FragColor = vec4(col, alpha);
  }
`;

function Field({
  count,
  ripple,
  alpha,
}: {
  count: number;
  ripple: boolean;
  alpha: number;
}) {
  const viewport = useThree((s) => s.viewport);
  const dpr = useThree((s) => s.gl.getPixelRatio());
  const scrollTarget = useRef(0);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uRipple: { value: new THREE.Vector3(0, 0, -100) },
          uPixelRatio: { value: dpr },
          uReduced: { value: 0 },
          uScroll: { value: 0 },
          uAlpha: { value: alpha },
          uColorA: { value: new THREE.Color("#a78bfa") },
          uColorB: { value: new THREE.Color("#e879f9") },
          uColorC: { value: new THREE.Color("#c4b5fd") },
        },
      }),
    [dpr, alpha]
  );

  const width = Math.ceil(viewport.width) + 4;
  const height = Math.ceil(viewport.height) + 4;
  const geometry = useMemo(() => {
    const spacing = Math.sqrt((width * height) / count);
    const cols = Math.ceil(width / spacing);
    const rows = Math.ceil(height / spacing);
    const total = cols * rows;
    const positions = new Float32Array(total * 3);
    const seeds = new Float32Array(total);
    let i = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        positions[i * 3] = -width / 2 + c * spacing + (Math.random() - 0.5) * spacing * 0.8;
        positions[i * 3 + 1] = -height / 2 + r * spacing + (Math.random() - 0.5) * spacing * 0.8;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
        seeds[i] = Math.random();
        i += 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return geo;
  }, [width, height, count]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollTarget.current = max > 0 ? window.scrollY / max : 0;
    };
    const onClick = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -((e.clientY / window.innerHeight) * 2 - 1);
      material.uniforms.uRipple.value.set(
        nx * (viewport.width / 2),
        ny * (viewport.height / 2),
        material.uniforms.uTime.value
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (ripple) window.addEventListener("pointerdown", onClick, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [viewport.width, viewport.height, material, ripple]);

  useFrame((state, delta) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uScroll.value = THREE.MathUtils.lerp(u.uScroll.value, scrollTarget.current, 1 - Math.exp(-delta * 4));
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

export default function ParticleField({
  layer = "fixed",
  density = "full",
}: {
  layer?: "fixed" | "absolute";
  density?: "full" | "subtle";
}) {
  const level = useEffects();
  const mobile = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches,
    []
  );

  if (!level || level === "off") return null;

  const base = density === "subtle" ? 3200 : 7000;
  const count = Math.round(level === "lite" ? base / 2.5 : mobile ? Math.min(base, 2400) : base);
  const fps = level === "lite" ? 24 : 45;

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9 }}
      className={`pointer-events-none inset-0 z-0 ${layer === "fixed" ? "fixed" : "absolute"}`}
    >
      <AmbientCanvas fps={fps} camera={{ position: [0, 0, 10], fov: 50 }}>
        <Field count={count} ripple={level === "full"} alpha={density === "subtle" ? 0.7 : 1} />
      </AmbientCanvas>
      {layer === "fixed" && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(5,5,7,0.55)_100%)]" />
      )}
    </motion.div>
  );
}
