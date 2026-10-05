export class DesignError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_DOCUMENT") {
    super(message);
  }
}

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DesignError(message);
}

export function record(value: unknown, label: string): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value), `${label}: ожидается объект`);
  return value as Record<string, unknown>;
}

export function text(value: unknown, label: string, max = 80): string {
  check(typeof value === "string" && value.trim().length > 0 && value.length <= max, `${label}: некорректная строка`);
  return value.trim();
}

export function id(value: unknown, label: string): string {
  const result = text(value, label, 64);
  check(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(result), `${label}: некорректный ID`);
  return result;
}

export function number(value: unknown, label: string, min = -1e6, max = 1e6): number {
  check(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max, `${label}: число вне допустимых границ`);
  return value;
}

export function list(value: unknown, label: string, max: number, min = 0): unknown[] {
  check(Array.isArray(value) && value.length >= min && value.length <= max, `${label}: недопустимый размер массива`);
  return value;
}

export function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  check(typeof value === "string" && values.includes(value as T), `${label}: неподдерживаемое значение`);
  return value as T;
}

export function unique<T extends { id: string }>(items: T[], label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    check(!result.has(item.id), `${label}: повтор ID ${item.id}`);
    result.set(item.id, item);
  }
  return result;
}

export function version(value: Record<string, unknown>, kind: string) {
  check(value.kind === kind && value.schemaVersion === 1, `Ожидается ${kind}, schemaVersion=1`);
}
