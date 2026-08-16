/**
 * Smoke test for the boolean engine: two unit cubes offset by half their size.
 *   npx tsx scripts/csg-smoke.ts
 */
import * as THREE from "three";
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from "three-bvh-csg";

function brush(size: [number, number, number], position: [number, number, number]) {
  const shape = new Brush(new THREE.BoxGeometry(...size).toNonIndexed());
  shape.position.set(...position);
  shape.updateMatrixWorld(true);
  return shape;
}

const evaluator = new Evaluator();
evaluator.attributes = ["position", "normal"];
evaluator.useGroups = false;

const cases: [string, number][] = [
  ["union", ADDITION],
  ["subtract", SUBTRACTION],
  ["intersect", INTERSECTION],
];

for (const [label, operation] of cases) {
  const a = brush([1, 1, 1], [0, 0, 0]);
  const b = brush([1, 1, 1], [0.5, 0.5, 0.5]);
  const result = evaluator.evaluate(a, b, operation);
  const position = result.geometry.getAttribute("position");
  result.geometry.computeBoundingBox();
  const box = result.geometry.boundingBox;
  const fmt = (v: THREE.Vector3) => v.toArray().map((n) => n.toFixed(2)).join(", ");
  console.log(
    `${label.padEnd(10)} vertices=${String(position.count).padStart(4)}  bbox=[${box ? fmt(box.min) : "?"}] → [${box ? fmt(box.max) : "?"}]`
  );
}
