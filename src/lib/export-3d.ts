/**
 * Real 3D file export for procedural concepts.
 *
 * The studio used to hand out JSON only (plus a provider GLB when a paid mesh
 * API answered). Everything Atrion generates itself is parametric geometry, so
 * this module rebuilds a concept as an actual three.js scene and pipes it
 * through the exporters that ship with three r177.
 *
 * Browser only — `document` / `URL.createObjectURL` are used here, so import it
 * from a "use client" component (ideally lazily, `await import("@/lib/export-3d")`,
 * to keep three out of the page's first chunk).
 *
 * Geometry contract (mirrors src/components/three/ConceptViewer.tsx):
 *   `size` is ALWAYS the full bounding box [width(x), height(y), depth(z)] of the
 *   primitive before rotation — for every PartShape, never a radius. Every part is
 *   expanded through `expandPart`, so repeat/mirror copies land in the file too.
 */

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { expandPart } from "@/lib/gen/kit";
import type { ModelPart, ThreeDConcept } from "@/lib/types";

const MIME_GLB = "model/gltf-binary";
const MIME_STL = "model/stl";
const MIME_OBJ = "model/obj";

/** Nothing thinner than a millimetre — keeps STL solids printable. */
const MIN_SIZE = 0.001;

const FALLBACK_COLOR = "#c8c4bc";

/* ---------------- small helpers ---------------- */

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function toColor(raw: string): THREE.Color {
  const value = typeof raw === "string" ? raw.trim() : "";
  const hex = value.startsWith("#") ? value : `#${value}`;
  return new THREE.Color(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex : FALLBACK_COLOR);
}

/** Radial / base segment count for the round primitives. */
function segmentsOf(part: ModelPart, fallback: number): number {
  return Math.round(clamp(part.sides ?? fallback, 3, 64));
}

function asError(cause: unknown, fallback: string): Error {
  if (cause instanceof Error) return cause;
  if (typeof ErrorEvent !== "undefined" && cause instanceof ErrorEvent) {
    return new Error(cause.message || fallback);
  }
  if (typeof cause === "string" && cause.length > 0) return new Error(cause);
  return new Error(fallback);
}

function requireParts(concept: ThreeDConcept): void {
  if (!concept.parts.length) {
    throw new Error("В модели нет деталей — экспортировать нечего.");
  }
}

/* ---------------- geometry ---------------- */

/**
 * Extrude a convex outline (given CCW in the xy plane, unit box −0.5…0.5)
 * along z from −0.5 to 0.5 as flat-shaded triangles.
 * Used for `prism` (gable roofs) and `wedge` (ramps, shed roofs).
 */
function extrudedOutline(
  outline: readonly (readonly [number, number])[]
): THREE.BufferGeometry {
  const positions: number[] = [];
  const push = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
  };
  const count = outline.length;

  // Side walls, one quad per edge.
  for (let i = 0; i < count; i++) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % count];
    push(ax, ay, -0.5);
    push(bx, by, -0.5);
    push(bx, by, 0.5);
    push(ax, ay, -0.5);
    push(bx, by, 0.5);
    push(ax, ay, 0.5);
  }

  // End caps, triangle fans from the first outline point.
  const [x0, y0] = outline[0];
  for (let i = 1; i < count - 1; i++) {
    const [xi, yi] = outline[i];
    const [xj, yj] = outline[i + 1];
    push(x0, y0, -0.5);
    push(xj, yj, -0.5);
    push(xi, yi, -0.5);
    push(x0, y0, 0.5);
    push(xi, yi, 0.5);
    push(xj, yj, 0.5);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Triangular prism, ridge along z at top centre. */
const PRISM_OUTLINE: readonly (readonly [number, number])[] = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0, 0.5],
];

/** Right-triangle prism rising along +x, vertical face at +x. */
const WEDGE_OUTLINE: readonly (readonly [number, number])[] = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
];

/**
 * One geometry per part, always normalised so its bounding box is exactly
 * `size`. Built at unit scale and scaled once, which keeps ellipsoids,
 * elliptical cylinders and squashed tori honest.
 */
function geometryForPart(part: ModelPart): THREE.BufferGeometry {
  const sx = Math.max(MIN_SIZE, Math.abs(finite(part.size[0], MIN_SIZE)));
  const sy = Math.max(MIN_SIZE, Math.abs(finite(part.size[1], MIN_SIZE)));
  const sz = Math.max(MIN_SIZE, Math.abs(finite(part.size[2], MIN_SIZE)));

  switch (part.shape) {
    case "cylinder": {
      const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, segmentsOf(part, 32), 1, false);
      geometry.scale(sx, sy, sz);
      return geometry;
    }
    case "sphere": {
      const width = segmentsOf(part, 32);
      const geometry = new THREE.SphereGeometry(0.5, width, Math.max(3, Math.round(width / 2)));
      geometry.scale(sx, sy, sz);
      return geometry;
    }
    case "cone": {
      const geometry = new THREE.ConeGeometry(0.5, 1, segmentsOf(part, 32), 1, false);
      geometry.scale(sx, sy, sz);
      return geometry;
    }
    case "pyramid": {
      // A 4-gon cone is a diamond: turn it 45° and use the circumradius of the
      // unit square (√2⁄2) so the base fills the whole bounding box.
      const base = Math.round(clamp(part.sides ?? 4, 3, 64));
      const square = base === 4;
      const geometry = new THREE.ConeGeometry(square ? Math.SQRT1_2 : 0.5, 1, base, 1, false);
      if (square) geometry.rotateY(Math.PI / 4);
      geometry.scale(sx, sy, sz);
      return geometry;
    }
    case "prism": {
      const geometry = extrudedOutline(PRISM_OUTLINE);
      geometry.scale(sx, sy, sz);
      return geometry;
    }
    case "wedge": {
      const geometry = extrudedOutline(WEDGE_OUTLINE);
      geometry.scale(sx, sy, sz);
      return geometry;
    }
    case "torus": {
      const tubular = segmentsOf(part, 32);
      const radial = Math.max(6, Math.min(24, Math.round(tubular / 3)));
      const tube = 0.5 * clamp(part.hole ?? 0.35, 0.05, 0.95);
      const ring = Math.max(0.02, 0.5 - tube);
      const geometry = new THREE.TorusGeometry(ring, tube, radial, tubular);
      geometry.rotateX(-Math.PI / 2); // ring lies in the xz plane
      geometry.scale(sx, sy / (2 * tube), sz);
      return geometry;
    }
    case "capsule": {
      const radial = segmentsOf(part, 24);
      const radius = Math.min(sx, sy, sz) / 2;
      const length = Math.max(0, sy - radius * 2);
      const geometry = new THREE.CapsuleGeometry(
        radius,
        length,
        Math.max(4, Math.round(radial / 4)),
        radial
      );
      const diameter = radius * 2;
      if (diameter > 0) geometry.scale(sx / diameter, 1, sz / diameter);
      return geometry;
    }
    case "tube": {
      // Hollow cylinder as a lathed, closed profile — watertight for printing.
      const inner = 0.5 * clamp(part.hole ?? 0.6, 0.05, 0.95);
      const profile = [
        new THREE.Vector2(inner, -0.5),
        new THREE.Vector2(0.5, -0.5),
        new THREE.Vector2(0.5, 0.5),
        new THREE.Vector2(inner, 0.5),
        new THREE.Vector2(inner, -0.5),
      ];
      const geometry = new THREE.LatheGeometry(profile, segmentsOf(part, 32));
      geometry.scale(sx, sy, sz);
      return geometry;
    }
    // "plane" is a thin slab, not a zero-thickness quad: a real solid survives
    // slicing and stays visible from both sides in every viewer.
    case "plane":
    case "box":
    default:
      return new THREE.BoxGeometry(sx, sy, sz);
  }
}

function materialForPart(part: ModelPart): THREE.MeshStandardMaterial {
  const color = toColor(part.color);
  const opacity = clamp(part.opacity ?? 1, 0.05, 1);
  const emissiveLevel = clamp(part.emissive ?? 0, 0, 1);

  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: clamp(part.metalness ?? 0.08, 0, 1),
    roughness: clamp(part.roughness ?? 0.62, 0, 1),
    transparent: opacity < 1,
    opacity,
  });
  material.name = part.material || part.name;
  if (emissiveLevel > 0) {
    material.emissive.copy(color).multiplyScalar(emissiveLevel);
    material.emissiveIntensity = 1;
  }
  return material;
}

/* ---------------- scene ---------------- */

/**
 * Rebuild a concept as a real three.js group: one mesh per instance returned by
 * `expandPart`, grouped by the part's structure label, named after the part so
 * the names land in the exported file.
 *
 * Every mesh of a part shares one geometry and one material (`expandPart` never
 * changes `size`), which lets GLTFExporter reuse a single mesh across nodes.
 */
export function buildConceptScene(concept: ThreeDConcept): THREE.Group {
  const root = new THREE.Group();
  root.name = concept.name || "Atrion 3D";
  const holders = new Map<string, THREE.Group>();

  for (const part of concept.parts) {
    const label = part.group || part.role || "Детали";
    let holder = holders.get(label);
    if (!holder) {
      holder = new THREE.Group();
      holder.name = label;
      holders.set(label, holder);
      root.add(holder);
    }

    const geometry = geometryForPart(part);
    const material = materialForPart(part);
    const instances = expandPart(part);

    instances.forEach((instance, index) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = instances.length > 1 ? `${part.name} ${index + 1}` : part.name;
      mesh.position.set(
        finite(instance.position[0]),
        finite(instance.position[1]),
        finite(instance.position[2])
      );
      mesh.rotation.set(
        finite(instance.rotation[0]),
        finite(instance.rotation[1]),
        finite(instance.rotation[2])
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        partId: part.id,
        role: part.role ?? "",
        material: part.material,
      };
      holder.add(mesh);
    });
  }

  // STL and OBJ bake world matrices, and this group is never rendered.
  root.updateMatrixWorld(true);
  return root;
}

/** Free everything the export scene allocated. */
function disposeScene(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const material = object.material;
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
    } else {
      material.dispose();
    }
  });
}

/* ---------------- exporters ---------------- */

/** Binary glTF — the universal exchange format, keeps colours and names. */
export function exportConceptGlb(concept: ThreeDConcept): Promise<Blob> {
  requireParts(concept);
  const scene = buildConceptScene(concept);

  return new Promise<Blob>((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result: unknown) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Blob([result], { type: MIME_GLB }));
          return;
        }
        reject(new Error("GLTFExporter вернул не бинарный результат."));
      },
      (error: unknown) => reject(asError(error, "Не удалось собрать GLB.")),
      { binary: true, onlyVisible: true }
    );
  }).finally(() => disposeScene(scene));
}

/** Binary STL — geometry only, the format slicers and 3D printers expect. */
export function exportConceptStl(concept: ThreeDConcept): Blob {
  requireParts(concept);
  const scene = buildConceptScene(concept);
  try {
    const result: DataView | string = new STLExporter().parse(scene, { binary: true });
    return new Blob([result as BlobPart], { type: MIME_STL });
  } finally {
    disposeScene(scene);
  }
}

/** Wavefront OBJ — text mesh every CAD/DCC package can open. */
export function exportConceptObj(concept: ThreeDConcept): Blob {
  requireParts(concept);
  const scene = buildConceptScene(concept);
  try {
    const text: string = new OBJExporter().parse(scene);
    return new Blob([text], { type: MIME_OBJ });
  } finally {
    disposeScene(scene);
  }
}

/* ---------------- download ---------------- */

/** Save a blob to disk from the browser. */
export function downloadBlob(filename: string, blob: Blob): void {
  if (typeof document === "undefined") {
    throw new Error("Скачивание доступно только в браузере.");
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke late: some browsers abort a download whose blob URL disappears.
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
