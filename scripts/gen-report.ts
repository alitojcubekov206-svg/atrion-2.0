/**
 * Generation report — run the procedural pipeline over a spread of prompts and
 * print what each one actually produced. This is the debugging log required by
 * ТЗ 4.1: which category was detected, which parameters were parsed, how many
 * primitives were emitted and how coherent the result is.
 *
 *   npx tsx scripts/gen-report.ts
 *   npx tsx scripts/gen-report.ts "своя фраза"
 */
import { buildFromPrompt, detectCategory, planFor } from "@/backend/procedural-3d";
import { primitiveCount } from "@/shared/geometry";
import { scoreParts } from "@/backend/gen/validate";
import type { ThreeDConcept } from "@/shared/types";

const PROMPTS = [
  "Двухэтажный дом 12×9 м с двускатной крышей и гаражом",
  "Одноэтажный деревянный домик 6 на 5 метров с террасой и крыльцом",
  "Школа 4 этажа ширина 60 длина 120 с большими окнами",
  "Кирпичная больница 3 этажа с приёмным отделением",
  "Стеклянный офисный центр 12 этажей в стиле хай-тек",
  "Небоскрёб 40 этажей со шпилем",
  "Вантовый мост длиной 400 метров",
  "Красный спорткар с большими колёсами",
  "Синий грузовик с прицепом",
  "Аниме девушка с длинными волосами в платье",
  "Рыцарь в доспехах с мечом",
  "Кот сидит",
  "Дракон с крыльями",
  "Уютная спальня 4×5 м с кроватью и столом",
  "Кухня 3 на 4 метра с гарнитуром",
  "Деревянный обеденный стол на 6 персон",
  "Кожаный диван трёхместный",
  "Настольная лампа с гибкой стойкой",
  "Робот-пылесос",
  "Игровой ноутбук 16 дюймов",
  // Combinations no template could cover — these must still build.
  "Робот-паук на 8 ногах с прожектором",
  "Летающий дом на колёсах с трубой",
  "Чайник с крыльями и антенной",
  "Двухэтажный дом с башней, куполом и аркадой из 6 арок",
  "Шкаф с 5 полками и 3 ящиками",
  "Хрустальный тостер",
];

function shapeMix(concept: ThreeDConcept): string {
  const counts = new Map<string, number>();
  for (const part of concept.parts) counts.set(part.shape, (counts.get(part.shape) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([shape, n]) => `${shape}×${n}`)
    .join(" ");
}

function fingerprint(concept: ThreeDConcept): string {
  // Position-and-size digest — two prompts sharing this produced the same model.
  const body = concept.parts
    .map((p) => `${p.shape}:${p.position.map((n) => n.toFixed(2))}:${p.size.map((n) => n.toFixed(2))}`)
    .join("|");
  let hash = 2166136261;
  for (let i = 0; i < body.length; i++) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function report(prompt: string) {
  const started = Date.now();
  const category = detectCategory(prompt);
  const { summary } = planFor(prompt);
  const concept = buildFromPrompt(prompt);
  const ms = Date.now() - started;

  const parsed = summary;
  const score = scoreParts(concept.parts);
  const groups = (concept.structure ?? []).map((g) => `${g.label}(${g.partIds.length})`).join(" ");

  return {
    prompt,
    category,
    parsed,
    name: concept.name,
    parts: concept.parts.length,
    primitives: primitiveCount(concept.parts),
    dims: `${concept.dimensions.width}×${concept.dimensions.depth}×${concept.dimensions.height}`,
    score,
    shapes: shapeMix(concept),
    groups,
    hash: fingerprint(concept),
    ms,
  };
}

const custom = process.argv.slice(2);
const list = custom.length ? custom : PROMPTS;
const rows = list.map(report);

for (const row of rows) {
  console.log(`\n▸ ${row.prompt}`);
  console.log(`  category   ${row.category}   →  «${row.name}»`);
  console.log(`  parsed     ${row.parsed}`);
  console.log(`  geometry   parts=${row.parts} primitives=${row.primitives} dims=${row.dims} score=${row.score} (${row.ms}ms)`);
  console.log(`  shapes     ${row.shapes}`);
  console.log(`  groups     ${row.groups}`);
  console.log(`  hash       ${row.hash}`);
}

const hashes = new Map<string, string[]>();
for (const row of rows) hashes.set(row.hash, [...(hashes.get(row.hash) ?? []), row.prompt]);
const clashes = [...hashes.values()].filter((group) => group.length > 1);

const avg = (nums: number[]) => Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;

console.log("\n──────── summary ────────");
console.log(`prompts        ${rows.length}`);
console.log(`unique models  ${hashes.size}/${rows.length}`);
console.log(`avg parts      ${avg(rows.map((r) => r.parts))}`);
console.log(`avg primitives ${avg(rows.map((r) => r.primitives))}`);
console.log(`avg score      ${avg(rows.map((r) => r.score))}`);
console.log(`min score      ${Math.min(...rows.map((r) => r.score))}`);
console.log(`weakest        ${rows.slice().sort((a, b) => a.score - b.score).slice(0, 5).map((r) => `${r.score} ${r.category}`).join(", ")}`);
if (clashes.length) {
  console.log(`\n⚠ identical geometry for different prompts:`);
  for (const group of clashes) console.log(`  - ${group.join("  ||  ")}`);
}
