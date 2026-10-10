import test from "node:test";
import assert from "node:assert/strict";
import {Euler, Vector3} from "three";
import {stairFlight, ids, type Facing} from "../src/backend/gen/details";
import {expandPart} from "../src/shared/geometry";
import {geometryForPart} from "../src/frontend/export-3d";
import {buildFromPlan, planFor} from "../src/backend/procedural-3d";

const close = (a: number, b: number, epsilon = 1e-6) => assert(Math.abs(a - b) < epsilon, `${a} != ${b}`);

for (const facing of ["front", "back", "left", "right"] as Facing[]) {
  test(`both exported stair supports climb with the treads: ${facing}`, () => {
    const parts = stairFlight({id: ids("test"), base: [3, 0, 4], width: 2, steps: 5,
      rise: .16, run: .3, facing, color: "#bbbbbb"});
    const treads = expandPart(parts[0]);
    const inward = new Vector3(...treads.at(-1)!.position).sub(new Vector3(...treads[0].position));
    inward.y = 0;
    inward.normalize();
    const sideways = new Vector3(-inward.z, 0, inward.x);
    const topTread = treads.at(-1)!;
    const topEdge = new Vector3(...topTread.position).dot(inward) + .15;
    for (const support of parts.slice(1)) {
      const instances = expandPart(support);
      assert.equal(instances.length, 1);
      const instance = instances[0];
      const geometry = geometryForPart(support);
      const positions = geometry.getAttribute("position");
      const vertices = Array.from({length: positions.count}, (_, i) =>
        new Vector3().fromBufferAttribute(positions, i)
          .applyEuler(new Euler(...instance.rotation)).add(new Vector3(...instance.position)));
      const high = vertices.filter(v => Math.abs(v.y - .8) < 1e-6);
      assert(high.length > 0);
      for (const vertex of high) close(vertex.dot(inward), topEdge);
      const along = vertices.map(v => v.dot(inward));
      const across = vertices.map(v => v.dot(sideways));
      close(Math.max(...along) - Math.min(...along), 1.5);
      close(Math.max(...across) - Math.min(...across), .054);
      geometry.dispose();
    }
  });
}

for (const terrace of [false, true]) for (const floors of [1, 2, 8]) {
  test(`entrance treads meet the landing and door: ${floors} floors, terrace ${terrace}`, () => {
    const bp = planFor(`Дом 12×9 м, ${floors} этажей, ступени у входа`, "stairs-regression").blueprint;
    bp.floors = floors;
    bp.height = floors * 3.3;
    bp.terrace = terrace;
    bp.stairs = 5;
    const concept = buildFromPlan(bp);
    const landing = concept.parts.find(p => p.name === (terrace ? "Настил террасы" : "Входная площадка"))!;
    const steps = expandPart(concept.parts.find(p => p.name === "Ступени — проступь")!);
    const door = concept.parts.find(p => p.role === "door" && p.material === "Дверное полотно")!;
    assert(landing && door);
    assert.equal(steps.length, 5);
    const landingTop = landing.position[1] + landing.size[1] / 2;
    const highest = steps.at(-1)!;
    // Concept serialization rounds dimensions to a millimetre.
    close(highest.position[1] + highest.size[1] / 2, landingTop, .001);
    close(door.position[1] - door.size[1] / 2, landingTop, .001);
    close(highest.position[2] - highest.size[2] / 2, landing.position[2] + landing.size[2] / 2, .001);
    for (let i = 1; i < steps.length; i++) {
      assert(steps[i].position[1] > steps[i - 1].position[1]);
      assert(steps[i].position[2] < steps[i - 1].position[2]);
    }
    assert(steps[0].size[1] < .25, "the entrance rise must not grow with the number of storeys");
    if (terrace) {
      const railing = concept.parts.filter(p => p.group === "Терраса" && /Поручень|Ригель|Стойка/.test(p.material));
      assert(railing.length > 0);
      for (const p of railing) for (const instance of expandPart(p)) {
        assert(Math.abs(instance.position[0] - highest.position[0]) - instance.size[0] / 2 >= highest.size[0] / 2 - .001,
          "the terrace railing must leave a clear staircase entrance");
      }
    }
  });
}

for (const terrace of [false, true]) {
  test(`a furnished house entrance uses its thinner floor slab: terrace ${terrace}`, () => {
    const bp = planFor("Двухэтажный дом с диваном, кроватью и ступенями у входа", "furnished-stairs").blueprint;
    bp.terrace = terrace;
    bp.stairs = 3;
    const concept = buildFromPlan(bp);
    const floor = concept.parts.find(p => p.name === "Пол первого этажа")!;
    const stair = concept.parts.find(p => p.name === "Ступени — проступь")!;
    const top = expandPart(stair).at(-1)!;
    assert(floor, "fixture must exercise the furnished house builder");
    close(top.position[1] + top.size[1] / 2, floor.position[1] + floor.size[1] / 2, .001);
  });
}
