"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import AmbientCanvas from "@/frontend/components/three/AmbientCanvas";

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
    float alpha = soft * (0.2 + 0.22 * fract(vSeed * 3.7) + vGlow * 0.75);
    gl_FragColor = vec4(col, alpha);
  }
`;

function Field({ reduced, mobile }: { reduced: boolean; mobile: boolean }) {
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
          uReduced: { value: reduced ? 1 : 0 },
          uScroll: { value: 0 },
          uColorA: { value: new THREE.Color("#a78bfa") },
          uColorB: { value: new THREE.Color("#e879f9") },
          uColorC: { value: new THREE.Color("#c4b5fd") },
        },
      }),
    [dpr, reduced]
  );

  const width = Math.ceil(viewport.width) + 4;
  const height = Math.ceil(viewport.height) + 4;
  const geometry = useMemo(() => {
    const target = mobile ? 2400 : 7000;
    const spacing = Math.sqrt((width * height) / target);
    const cols = Math.ceil(width / spacing);
    const rows = Math.ceil(height / spacing);
    const count = cols * rows;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    let i = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const jx = (Math.random() - 0.5) * spacing * 0.8;
        const jy = (Math.random() - 0.5) * spacing * 0.8;
        positions[i * 3] = -width / 2 + c * spacing + jx;
        positions[i * 3 + 1] = -height / 2 + r * spacing + jy;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
        seeds[i] = Math.random();
        i += 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return geo;
  }, [width, height, mobile]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const toWorld = (clientX: number, clientY: number) => {
      const nx = (clientX / window.innerWidth) * 2 - 1;
      const ny = -((clientY / window.innerHeight) * 2 - 1);
      return [nx * (viewport.width / 2), ny * (viewport.height / 2)] as const;
    };
    const onClick = (e: PointerEvent) => {
      const [x, y] = toWorld(e.clientX, e.clientY);
      material.uniforms.uRipple.value.set(x, y, material.uniforms.uTime.value);
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollTarget.current = max > 0 ? window.scrollY / max : 0;
    };
    window.addEventListener("pointerdown", onClick, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("pointerdown", onClick);
      window.removeEventListener("scroll", onScroll);
    };
  }, [viewport.width, viewport.height, material]);

  useFrame((state, delta) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uScroll.value = THREE.MathUtils.lerp(u.uScroll.value, scrollTarget.current, 1 - Math.exp(-delta * 4));
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

export default function ParticleField() {
  const flags = useMemo(() => {
    if (typeof window === "undefined") return { reduced: false, mobile: false };
    return {
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      mobile: window.matchMedia("(max-width: 768px)").matches,
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <AmbientCanvas fps={flags.reduced ? 8 : 45} camera={{ position: [0, 0, 10], fov: 50 }}>
        <Field reduced={flags.reduced} mobile={flags.mobile} />
      </AmbientCanvas>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(5,5,7,0.55)_100%)]" />
    </div>
  );
}
