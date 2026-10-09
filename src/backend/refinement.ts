import type { ModelPart, ThreeDConcept } from "../shared/types";
import { dimensionsOf, scaleParts, structureFromGroups } from "../shared/geometry";
import { isSupportedPrimitive, normalizeShape, MAX_PARTS } from "./gen/validate";

export class EditNotApplied extends Error {
  readonly code = "EDIT_NOT_APPLIED";
  constructor() {
    super("Правка не применена. Уточните команду или измените деталь вручную.");
  }
}

export function isModelRebuild(instruction: string): boolean {
  if (/^(?:создай|создать|сгенерируй|построй|create|generate|build)\s+\S.{1,}/i.test(instruction.trim())) return true;
  // A new building description in chat is a new subject, even without a verb.
  if (/^(?:(?:новый|новая|новое|современный|современная|двухэтажный|тр[её]хэтажный)\s+)?(?:дом|коттедж|школа|офис|больница|отель|гостиница|завод|склад|ангар|многоэтажка|здание|house|school|office|hospital|hotel|warehouse)(?=$|[\s,.;:]|\d)/i.test(instruction.trim())) return true;
  return /построй|замени на|вместо (этого|него)|новый объект|переделай в|сделай вместо/i.test(instruction)
    && instruction.trim().length > 12;
}

const vector = (value: unknown, positive = false): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every(n =>
    typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1_000_000 && (!positive || n >= .001));
const numbers = (value: unknown, count?: number): value is number[] =>
  Array.isArray(value) && (count === undefined || value.length === count)
    && value.every(n => typeof n === "number" && Number.isFinite(n));

/** Validate geometry before accepting an edit; do not repair missing data into boxes. */
export function editableParts(value: unknown): value is ModelPart[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_PARTS) return false;
  const ids = new Set<string>();
  return value.every(part => {
    if (!part || typeof part !== "object" || typeof part.id !== "string" || !part.id || ids.has(part.id)
        || typeof part.name !== "string" || typeof part.material !== "string"
        || typeof part.color !== "string" || !/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(part.color)
        || !vector(part.position) || !vector(part.size, true) || !vector(part.rotation)) return false;
    ids.add(part.id);
    for (const key of ["group", "role"]) {
      if (part[key] !== undefined && typeof part[key] !== "string") return false;
    }
    if (part.repeat !== undefined && (!part.repeat || !Number.isInteger(part.repeat.count)
        || part.repeat.count < 1 || part.repeat.count > 64 || !vector(part.repeat.step)
        || (part.repeat.rotationStep !== undefined && !vector(part.repeat.rotationStep)))) return false;
    if (part.mirror !== undefined && !["x", "z", "xz"].includes(part.mirror)) return false;
    for (const key of ["opacity", "roughness", "metalness", "emissive"]) {
      if (part[key] !== undefined && (typeof part[key] !== "number" || !Number.isFinite(part[key])
          || part[key] < 0 || part[key] > 1)) return false;
    }
    if (part.shape !== "mesh") return isSupportedPrimitive(part.shape) && part.shape === normalizeShape(part.shape);
    const mesh = part.mesh;
    if (!mesh || !Array.isArray(mesh.position) || mesh.position.length < 9
        || mesh.position.length > 1_000_000 || mesh.position.length % 3 || !numbers(mesh.position)) return false;
    const vertices = mesh.position.length / 3;
    if (mesh.normal !== undefined && !numbers(mesh.normal, mesh.position.length)) return false;
    if (mesh.color !== undefined && (!numbers(mesh.color, mesh.position.length) || mesh.color.some((n: number) => n < 0 || n > 1))) return false;
    if (mesh.index !== undefined && (!numbers(mesh.index) || !mesh.index.length || mesh.index.length % 3
        || mesh.index.some((n: number) => !Number.isInteger(n) || n < 0 || n >= vertices))) return false;
    if (mesh.uv !== undefined && !numbers(mesh.uv, vertices * 2)) return false;
    if (mesh.texture !== undefined && (typeof mesh.texture !== "string" || mesh.texture.length > 4_000_000
        || !/^data:image\/(jpeg|png|webp);base64,/.test(mesh.texture) || !mesh.uv)) return false;
    return true;
  });
}

export function readEditableConcept(value: unknown): ThreeDConcept | null {
  if (!value || typeof value !== "object") return null;
  const concept = value as ThreeDConcept;
  if (typeof concept.name !== "string" || typeof concept.description !== "string" || !editableParts(concept.parts)) return null;
  return { ...concept, dimensions: dimensionsOf(concept.parts), structure: structureFromGroups(concept.parts) };
}

export function withEditedParts(concept: ThreeDConcept, parts: ModelPart[], instruction: string): ThreeDConcept {
  return { ...concept, parts, dimensions: dimensionsOf(parts), structure: structureFromGroups(parts),
    description: `${concept.description} · правка: ${instruction}` };
}

/** Returns null when this limited fallback cannot actually perform the instruction. */
export function localRefine(concept: ThreeDConcept, instruction: string, selectedPartId?: string | null): ThreeDConcept | null {
  const lower = instruction.toLowerCase();
  const increase = /увелич|больше|enlarge|bigger/.test(lower);
  const decrease = /уменьш|уменш|меньше|shrink|smaller/.test(lower);
  const scaleCommand = /^(?:увелич(?:ь|ить)|уменьш(?:и|ить)|уменш(?:и|ить)|сделай (?:больше|меньше)|enlarge|shrink)(?:\s+(?:модель|объект|всё|все|деталь|выбранную деталь|его|её|ее))?(?:\s+(?:на\s+\d+(?:[.,]\d+)?\s*(?:%|процент(?:а|ов)?)|в\s+\d+(?:[.,]\d+)?\s*раз(?:а)?))?[.!]?$/i.test(lower.trim());
  const wood = /^(?:сделай\s+(?:(?:модель|объект|деталь|его|её|ее)\s+)?)?(?:деревянн(?:ым|ой)|дерево|wood(?:en)?)[.!]?$/i.test(lower.trim());
  // Named targets, axis-only edits and compound instructions belong to the AI.
  if (!scaleCommand && !wood) return null;
  let scale = increase ? 1.2 : decrease ? .85 : 1;
  const percent = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:%|процент)/);
  const times = lower.match(/в\s*(\d+(?:[.,]\d+)?)\s*раз/);
  if (increase || decrease) {
    if (percent) scale = 1 + (increase ? 1 : -1) * Number(percent[1].replace(",", ".")) / 100;
    else if (times) scale = increase ? Number(times[1].replace(",", ".")) : 1 / Number(times[1].replace(",", "."));
    if (!Number.isFinite(scale) || scale <= 0 || scale > 100) return null;
  }
  const parts = concept.parts.map(part => {
    if (selectedPartId && part.id !== selectedPartId) return part;
    const scaled = scaleParts([part], scale)[0];
    // Scaling a selected part is around its own pivot; scaling the whole model
    // also scales positions and repeat spacing to preserve assembled proportions.
    return { ...scaled, ...(selectedPartId ? { position: part.position } : {}),
      material: wood ? "Дерево" : part.material, color: wood ? "#b45309" : part.color };
  });
  if (!editableParts(parts) || JSON.stringify(parts) === JSON.stringify(concept.parts)) return null;
  return withEditedParts(concept, parts, instruction);
}

/** Restore baked meshes by id and scale their vertices when the AI changes size. */
export function restoreEditedMeshes(value: unknown, original: ModelPart[]): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(raw => {
    if (!raw || typeof raw !== "object") return raw;
    const previous = original.find(part => part.id === raw.id);
    const part = { ...previous, ...raw, rotation: raw.rotation ?? previous?.rotation ?? [0, 0, 0], quantity: raw.quantity ?? previous?.quantity ?? 1 };
    if (isSupportedPrimitive(part.shape)) part.shape = normalizeShape(part.shape);
    if (!previous?.mesh) return part;
    if (!vector(part.size, true)) return part;
    const factors = part.size.map((n: number, axis: number) => n / previous.size[axis]);
    const normal = previous.mesh.normal?.map((n, i) => n / factors[i % 3]);
    if (normal) for (let i = 0; i < normal.length; i += 3) {
      const length = Math.hypot(normal[i], normal[i + 1], normal[i + 2]) || 1;
      for (let axis = 0; axis < 3; axis++) normal[i + axis] /= length;
    }
    return { ...part, shape: "mesh", mesh: { ...previous.mesh,
      position: previous.mesh.position.map((n, i) => n * factors[i % 3]), ...(normal ? { normal } : {}) } };
  });
}
