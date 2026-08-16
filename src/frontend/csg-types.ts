/**
 * Names and labels for the boolean operations.
 *
 * Kept apart from `csg.ts` on purpose: that module pulls in three.js and the
 * CSG evaluator, and the studio page only needs these constants to draw its
 * toolbar. The heavy module is imported lazily, when an operation actually runs.
 */
export type BooleanOp = "union" | "subtract" | "intersect";

export const BOOLEAN_LABELS: Record<BooleanOp, string> = {
  union: "Объединение",
  subtract: "Вычитание",
  intersect: "Пересечение",
};

export const BOOLEAN_SYMBOLS: Record<BooleanOp, string> = {
  union: "∪",
  subtract: "−",
  intersect: "∩",
};
