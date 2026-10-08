"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Backdrop model for the landing hero and the entry gate: a modern villa drawn
 * as a blueprint. Every edge, mullion and grid axis is one segment in a single
 * `lineSegments` draw call, and a shader draws each segment in from its start
 * point — lower parts first — so the house sketches itself from the ground up.
 *
 * Ground level is y = 0 in model space; callers place and scale the group.
 */

type Segment = { a: THREE.Vector3Tuple; b: THREE.Vector3Tuple; delay: number; weight: number };
type Box = { x: [number, number]; y: [number, number]; z: [number, number] };

const DRAW_SHARE = 0.16;
const DRAW_SECONDS = 3.4;
const SCAN_EVERY = 9;
const SCAN_SECONDS = 2.6;
const MODEL_TOP = 3.68;
/** Roughly the model's half-extent; edges fade over this span either side of its centre. */
const DEPTH_RADIUS = 3.2;
const depthCenter = new THREE.Vector3();

function boxEdges(box: Box, at: number, weight = 1): Segment[] {
  const [x0, x1] = box.x;
  const [y0, y1] = box.y;
  const [z0, z1] = box.z;
  const ring = (y: number, delay: number): Segment[] => [
    { a: [x0, y, z0], b: [x1, y, z0], delay, weight },
    { a: [x1, y, z0], b: [x1, y, z1], delay, weight },
    { a: [x1, y, z1], b: [x0, y, z1], delay, weight },
    { a: [x0, y, z1], b: [x0, y, z0], delay, weight },
  ];
  const posts: Segment[] = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ].map(([x, z]) => ({ a: [x, y0, z], b: [x, y1, z], delay: at + 0.03, weight }));
  return [...ring(y0, at), ...posts, ...ring(y1, at + 0.07)];
}

function verticals(
  from: number,
  to: number,
  step: number,
  place: (t: number) => [THREE.Vector3Tuple, THREE.Vector3Tuple],
  at: number,
  weight: number
): Segment[] {
  const out: Segment[] = [];
  const count = Math.round((to - from) / step);
  for (let i = 0; i <= count; i += 1) {
    const [a, b] = place(from + i * step);
    out.push({ a, b, delay: at + (i / Math.max(1, count)) * 0.08, weight });
  }
  return out;
}

function circle(cx: number, cz: number, r: number, at: number, weight: number): Segment[] {
  const out: Segment[] = [];
  const n = 20;
  for (let i = 0; i < n; i += 1) {
    const t0 = (i / n) * Math.PI * 2;
    const t1 = ((i + 1) / n) * Math.PI * 2;
    out.push({
      a: [cx + Math.cos(t0) * r, 0.002, cz + Math.sin(t0) * r],
      b: [cx + Math.cos(t1) * r, 0.002, cz + Math.sin(t1) * r],
      delay: at + (i / n) * 0.05,
      weight,
    });
  }
  return out;
}

/** Volumes that also get a faint tinted fill once the lines are in. */
const PLINTH: Box = { x: [-3.4, 3.4], y: [0, 0.12], z: [-2.0, 2.4] };
const POOL: Box = { x: [-3.0, -0.8], y: [0.04, 0.12], z: [1.3, 2.1] };
const GROUND: Box = { x: [-2.8, 1.6], y: [0.12, 1.3], z: [-1.0, 1.0] };
const MIDDLE: Box = { x: [-0.6, 1.4], y: [1.3, 2.5], z: [-2.0, 2.8] };
const TOP: Box = { x: [-1.2, 3.6], y: [2.5, 3.6], z: [-1.1, 0.7] };
const ROOF: Box = { x: [-1.35, 3.75], y: [3.6, MODEL_TOP], z: [-1.25, 0.85] };

const FILLS: { box: Box; opacity: number }[] = [
  { box: PLINTH, opacity: 0.08 },
  { box: GROUND, opacity: 0.07 },
  { box: MIDDLE, opacity: 0.16 },
  { box: TOP, opacity: 0.14 },
  { box: ROOF, opacity: 0.2 },
];

/** A window opening drawn on a facade: its frame plus evenly spaced mullions. */
function ribbon(
  span: [number, number],
  y: [number, number],
  step: number,
  place: (t: number, y: number) => THREE.Vector3Tuple,
  at: number
): Segment[] {
  const [t0, t1] = span;
  const frame: Segment[] = [
    { a: place(t0, y[0]), b: place(t1, y[0]), delay: at, weight: 0.6 },
    { a: place(t0, y[1]), b: place(t1, y[1]), delay: at, weight: 0.6 },
  ];
  const mullions = verticals(t0, t1, step, (t) => [place(t, y[0]), place(t, y[1])], at + 0.02, 0.45);
  return [...frame, ...mullions];
}

/**
 * Three volumes stacked crosswise: a glazed ground floor along X, a middle
 * block running front to back that cantilevers toward the viewer, and a top
 * floor along X again that overhangs to the right on two slender columns.
 */
function buildSegments(): Segment[] {
  const axisX = [-2.8, -0.6, 1.4, 3.3];
  const axisZ = [-1.0, 1.0];
  const plan: Segment[] = [
    ...axisX.flatMap((x, i) => [
      { a: [x, 0.002, -2.9], b: [x, 0.002, 3.4], delay: 0.02 * i, weight: 0.3 } as Segment,
      ...circle(x, 3.58, 0.18, 0.12 + 0.02 * i, 0.3),
    ]),
    ...axisZ.flatMap((z, i) => [
      { a: [4.3, 0.002, z], b: [-3.9, 0.002, z], delay: 0.04 + 0.02 * i, weight: 0.3 } as Segment,
      ...circle(-4.08, z, 0.18, 0.16 + 0.02 * i, 0.3),
    ]),
  ];

  // Ground floor: full-height glazing on the two faces the camera sees.
  const groundFront = verticals(-2.8, 1.6, 0.44, (x) => [[x, 0.12, 1.0], [x, 1.3, 1.0]], 0.26, 0.5);
  const groundSide = verticals(-1.0, 1.0, 0.5, (z) => [[1.6, 0.12, z], [1.6, 1.3, z]], 0.28, 0.5);
  const transom: Segment[] = [
    { a: [-2.8, 1.08, 1.0], b: [1.6, 1.08, 1.0], delay: 0.32, weight: 0.4 },
    { a: [1.6, 1.08, 1.0], b: [1.6, 1.08, -1.0], delay: 0.34, weight: 0.4 },
  ];

  // Columns carrying the top floor's overhang.
  const columns: Segment[] = [-0.9, 0.5].map((z) => ({
    a: [3.3, 0.12, z],
    b: [3.3, 2.5, z],
    delay: 0.3,
    weight: 0.85,
  }));

  // Middle block: fins across its cantilevered end, a long window down its side.
  const middleFins = verticals(-0.6, 1.4, 0.25, (x) => [[x, 1.3, 2.86], [x, 2.5, 2.86]], 0.48, 0.5);
  const middleSide = ribbon([-1.6, 2.4], [1.62, 2.18], 0.5, (z, y) => [1.4, y, z], 0.5);

  // Top floor: a ribbon window on the front, fins on the overhanging end.
  const topFront = ribbon([-1.0, 3.4], [2.8, 3.35], 0.4, (x, y) => [x, y, 0.7], 0.68);
  const topFins = verticals(-1.1, 0.7, 0.225, (z) => [[3.66, 2.5, z], [3.66, 3.6, z]], 0.7, 0.5);

  return [
    ...plan,
    ...boxEdges(PLINTH, 0.1),
    ...boxEdges(POOL, 0.16, 0.7),
    ...boxEdges(GROUND, 0.2),
    ...groundFront,
    ...groundSide,
    ...transom,
    ...columns,
    ...boxEdges(MIDDLE, 0.4),
    ...middleFins,
    ...middleSide,
    ...boxEdges(TOP, 0.6),
    ...topFront,
    ...topFins,
    ...boxEdges(ROOF, 0.8),
  ];
}

const LINE_VERTEX = /* glsl */ `
  uniform float uProgress;
  attribute vec3 aStart;
  attribute float aEnd;
  attribute float aDelay;
  attribute float aWeight;
  varying float vShown;
  varying float vWeight;
  varying float vY;
  varying float vDepth;

  void main() {
    float p = clamp((uProgress - aDelay) / ${DRAW_SHARE.toFixed(2)}, 0.0, 1.0);
    p = 1.0 - pow(1.0 - p, 3.0);
    vec3 pos = mix(aStart, position, aEnd * p);
    vShown = step(0.0001, p);
    vWeight = aWeight;
    vY = pos.y;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform float uScanY;
  uniform float uTop;
  uniform float uNear;
  uniform float uFar;
  varying float vShown;
  varying float vWeight;
  varying float vY;
  varying float vDepth;

  void main() {
    if (vShown < 0.5) discard;
    vec3 col = mix(uLow, uHigh, clamp(vY / uTop, 0.0, 1.0));
    float scan = exp(-pow((vY - uScanY) * 5.0, 2.0));
    col = mix(col, vec3(1.0), scan * 0.75);
    // Near edges read bright, the far side of the x-ray recedes.
    float depth = mix(1.0, 0.3, smoothstep(uNear, uFar, vDepth));
    gl_FragColor = vec4(col, min(1.0, vWeight * depth * (0.95 + 0.5 * scan)));
  }
`;

const NODE_VERTEX = /* glsl */ `
  uniform float uProgress;
  uniform float uPixelRatio;
  uniform float uNear;
  uniform float uFar;
  attribute float aDelay;
  varying float vShown;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = mix(1.0, 0.25, smoothstep(uNear, uFar, -mv.z));
    vShown = smoothstep(0.0, 0.05, uProgress - aDelay) * depth;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 4.0 * uPixelRatio * vShown;
  }
`;

const NODE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vShown;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(uColor, smoothstep(0.5, 0.1, d) * 0.85 * vShown);
  }
`;

function useReducedMotion() {
  return useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
}

export default function BlueprintModel({
  position,
  scale = 1,
  yaw = 0,
}: {
  position?: THREE.Vector3Tuple;
  scale?: number;
  /** Resting rotation around Y; the model sways a little either side of it. */
  yaw?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const started = useRef<number | null>(null);
  const reduced = useReducedMotion();
  const dpr = useThree((s) => s.gl.getPixelRatio());

  const { lines, nodes } = useMemo(() => {
    const segments = buildSegments();
    const positions = new Float32Array(segments.length * 6);
    const starts = new Float32Array(segments.length * 6);
    const ends = new Float32Array(segments.length * 2);
    const delays = new Float32Array(segments.length * 2);
    const weights = new Float32Array(segments.length * 2);
    const corners = new Map<string, { at: THREE.Vector3Tuple; delay: number }>();

    segments.forEach((s, i) => {
      positions.set([...s.a, ...s.b], i * 6);
      starts.set([...s.a, ...s.a], i * 6);
      ends.set([0, 1], i * 2);
      delays.set([s.delay, s.delay], i * 2);
      weights.set([s.weight, s.weight], i * 2);
      if (s.weight < 1) return;
      for (const point of [s.a, s.b]) {
        const key = point.map((v) => v.toFixed(2)).join(",");
        const reached = s.delay + (point === s.a ? 0 : DRAW_SHARE);
        const known = corners.get(key);
        if (!known || reached < known.delay) corners.set(key, { at: point, delay: reached });
      }
    });

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    lineGeometry.setAttribute("aStart", new THREE.BufferAttribute(starts, 3));
    lineGeometry.setAttribute("aEnd", new THREE.BufferAttribute(ends, 1));
    lineGeometry.setAttribute("aDelay", new THREE.BufferAttribute(delays, 1));
    lineGeometry.setAttribute("aWeight", new THREE.BufferAttribute(weights, 1));

    const nodeList = [...corners.values()];
    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(nodeList.flatMap((n) => n.at)), 3)
    );
    nodeGeometry.setAttribute(
      "aDelay",
      new THREE.BufferAttribute(new Float32Array(nodeList.map((n) => n.delay)), 1)
    );
    return { lines: lineGeometry, nodes: nodeGeometry };
  }, []);

  const lineMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: LINE_VERTEX,
        fragmentShader: LINE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uProgress: { value: 0 },
          uScanY: { value: -10 },
          uTop: { value: MODEL_TOP },
          uNear: { value: 0 },
          uFar: { value: 100 },
          uLow: { value: new THREE.Color("#a78bfa") },
          uHigh: { value: new THREE.Color("#f5f3ff") },
        },
      }),
    []
  );

  const nodeMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: NODE_VERTEX,
        fragmentShader: NODE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uProgress: { value: 0 },
          uPixelRatio: { value: dpr },
          uNear: { value: 0 },
          uFar: { value: 100 },
          uColor: { value: new THREE.Color("#f5f3ff") },
        },
      }),
    [dpr]
  );

  const fillGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const fillMaterials = useMemo(
    () =>
      FILLS.map(
        () =>
          new THREE.MeshBasicMaterial({
            color: "#8b5cf6",
            transparent: true,
            opacity: 0,
            depthWrite: false,
          })
      ),
    []
  );

  useEffect(
    () => () => {
      lines.dispose();
      nodes.dispose();
      lineMaterial.dispose();
      nodeMaterial.dispose();
      fillGeometry.dispose();
      fillMaterials.forEach((m) => m.dispose());
    },
    [lines, nodes, lineMaterial, nodeMaterial, fillGeometry, fillMaterials]
  );

  useFrame((state) => {
    if (started.current === null) started.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - started.current;
    const end = 1 + DRAW_SHARE;
    const progress = reduced ? end : Math.min(end, (t / DRAW_SECONDS) * end);
    lineMaterial.uniforms.uProgress.value = progress;
    nodeMaterial.uniforms.uProgress.value = progress;

    // The scan plane leads the first drawing, then sweeps again now and then.
    let scanY = -10;
    if (!reduced) {
      if (t < DRAW_SECONDS) {
        scanY = (t / DRAW_SECONDS) * (MODEL_TOP + 0.6) - 0.2;
      } else {
        const since = (t - DRAW_SECONDS) % SCAN_EVERY;
        if (since > SCAN_EVERY - SCAN_SECONDS) {
          scanY = ((since - (SCAN_EVERY - SCAN_SECONDS)) / SCAN_SECONDS) * (MODEL_TOP + 1) - 0.4;
        }
      }
    }
    lineMaterial.uniforms.uScanY.value = scanY;

    const fillIn = THREE.MathUtils.smoothstep(progress, 0.75, end);
    fillMaterials.forEach((m, i) => {
      m.opacity = FILLS[i].opacity * fillIn;
    });

    if (!group.current) return;
    if (!reduced) group.current.rotation.y = yaw + Math.sin(t * 0.16) * 0.22;

    const reach = DEPTH_RADIUS * scale;
    const distance = group.current
      .localToWorld(depthCenter.set(0.2, MODEL_TOP / 2, 0.2))
      .distanceTo(state.camera.position);
    for (const material of [lineMaterial, nodeMaterial]) {
      material.uniforms.uNear.value = distance - reach;
      material.uniforms.uFar.value = distance + reach;
    }
  });

  return (
    <group ref={group} position={position} scale={scale} rotation={[0, yaw, 0]}>
      {FILLS.map(({ box }, i) => (
        <mesh
          key={i}
          geometry={fillGeometry}
          material={fillMaterials[i]}
          position={[(box.x[0] + box.x[1]) / 2, (box.y[0] + box.y[1]) / 2, (box.z[0] + box.z[1]) / 2]}
          scale={[box.x[1] - box.x[0], box.y[1] - box.y[0], box.z[1] - box.z[0]]}
        />
      ))}
      <lineSegments geometry={lines} material={lineMaterial} frustumCulled={false} />
      <points geometry={nodes} material={nodeMaterial} frustumCulled={false} />
    </group>
  );
}
