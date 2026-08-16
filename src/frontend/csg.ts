/**
 * Boolean operations on parts — union, subtraction, intersection.
 *
 * Two primitives are turned into real meshes, evaluated with a BVH-accelerated
 * CSG evaluator, and the result comes back as a single part carrying baked
 * geometry. It stays a normal `ModelPart`, so the gizmo, the structure tree,
 * undo and every exporter keep working on it unchanged.
 *
 * Browser only: import it lazily from a client component.
 */
import * as THREE from "three";
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from "three-bvh-csg";
import { geometryForPart } from "@/frontend/export-3d";
import { BOOLEAN_LABELS, type BooleanOp } from "@/frontend/csg-types";
import type { ModelPart } from "@/shared/types";

export type { BooleanOp };

const OPERATIONS: Record<BooleanOp, number> = {
  union: ADDITION,
  subtract: SUBTRACTION,
  intersect: INTERSECTION,
};

/** Vertex budget — past this the result is decimated by dropping the mesh. */
const MAX_VERTICES = 240_000;

function brushFor(part: ModelPart): Brush {
  const geometry = geometryForPart(part);
  // The evaluator needs plain, non-indexed, attribute-matched geometry.
  const brush = new Brush(geometry.toNonIndexed());
  brush.position.set(part.position[0], part.position[1], part.position[2]);
  brush.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
  brush.updateMatrixWorld(true);
  return brush;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Evaluate `a op b` and return the replacement part.
 *
 * Throws when the operands do not overlap in a way that leaves geometry —
 * subtracting a part that misses its target, or intersecting two parts that do
 * not touch, would otherwise silently delete the model.
 */
export function booleanParts(a: ModelPart, b: ModelPart, op: BooleanOp): ModelPart {
  const brushA = brushFor(a);
  const brushB = brushFor(b);

  const evaluator = new Evaluator();
  evaluator.attributes = ["position", "normal"];
  evaluator.useGroups = false;

  const result = evaluator.evaluate(brushA, brushB, OPERATIONS[op]);
  const geometry = result.geometry;
  const positionAttribute = geometry.getAttribute("position");

  if (!positionAttribute || positionAttribute.count < 3) {
    throw new Error(
      op === "intersect"
        ? "Детали не пересекаются — пересечение пустое."
        : "Операция не дала геометрии: детали не перекрываются."
    );
  }
  if (positionAttribute.count > MAX_VERTICES) {
    throw new Error("Результат слишком тяжёлый. Упрости детали и повтори.");
  }

  // Re-centre on the part's own origin so position/size stay meaningful.
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  const centre = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(centre);
  box.getSize(size);
  geometry.translate(-centre.x, -centre.y, -centre.z);

  const normalAttribute = geometry.getAttribute("normal");
  const position = Array.from(positionAttribute.array as ArrayLike<number>, round);
  const normal = normalAttribute
    ? Array.from(normalAttribute.array as ArrayLike<number>, round)
    : undefined;

  brushA.geometry.dispose();
  brushB.geometry.dispose();
  geometry.dispose();

  return {
    id: `bool-${op}-${Date.now().toString(36)}`,
    name: `${BOOLEAN_LABELS[op]}: ${a.name} / ${b.name}`,
    shape: "mesh",
    position: [round(centre.x), round(centre.y), round(centre.z)],
    size: [
      Math.max(0.001, round(size.x)),
      Math.max(0.001, round(size.y)),
      Math.max(0.001, round(size.z)),
    ],
    rotation: [0, 0, 0],
    color: a.color,
    material: a.material,
    quantity: 1,
    role: a.role ?? "detail",
    group: a.group ?? "Булевы операции",
    parentId: null,
    ...(a.metalness !== undefined ? { metalness: a.metalness } : {}),
    ...(a.roughness !== undefined ? { roughness: a.roughness } : {}),
    ...(a.opacity !== undefined ? { opacity: a.opacity } : {}),
    mesh: { position, ...(normal ? { normal } : {}) },
  };
}
