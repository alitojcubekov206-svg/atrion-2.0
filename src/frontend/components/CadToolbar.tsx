"use client";

import type { PartShape } from "@/shared/types";
import { BOOLEAN_SYMBOLS, type BooleanOp } from "@/frontend/csg-types";

export type CadTool = "select" | "translate" | "rotate" | "scale";

const ADD_SHAPES: { id: PartShape; label: string }[] = [
  { id: "box", label: "Куб" },
  { id: "cylinder", label: "Цилиндр" },
  { id: "sphere", label: "Сфера" },
  { id: "cone", label: "Конус" },
  { id: "pyramid", label: "Пирамида" },
  { id: "prism", label: "Призма" },
  { id: "wedge", label: "Клин" },
  { id: "torus", label: "Тор" },
  { id: "capsule", label: "Капсула" },
  { id: "tube", label: "Труба" },
  { id: "plane", label: "Панель" },
];

const TOOLS: { id: CadTool; label: string; hint: string }[] = [
  { id: "select", label: "Выбор", hint: "Выделение и орбита (Esc)" },
  { id: "translate", label: "Сдвиг", hint: "Перемещение по осям (G)" },
  { id: "rotate", label: "Поворот", hint: "Вращение (R)" },
  { id: "scale", label: "Размер", hint: "Масштабирование (S)" },
];

const BOOLEANS: { id: BooleanOp; hint: string }[] = [
  { id: "union", hint: "Объединить две детали в одну" },
  { id: "subtract", hint: "Вычесть вторую деталь из первой" },
  { id: "intersect", hint: "Оставить только пересечение" },
];

type Props = {
  tool: CadTool;
  onTool: (tool: CadTool) => void;
  snap: boolean;
  onSnap: (value: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  units: "m" | "cm";
  addShape: PartShape;
  onAddShape: (shape: PartShape) => void;
  onAddPart: () => void;
  onDuplicatePart: () => void;
  onDeletePart: () => void;
  canEditSelection: boolean;
  onBoolean: (op: BooleanOp) => void;
  pendingBoolean: BooleanOp | null;
  booleanBusy: boolean;
  measureMode: boolean;
  onMeasureMode: (on: boolean) => void;
};

function Divider() {
  return <span className="mx-0.5 hidden h-5 w-px bg-white/10 sm:block" />;
}

export default function CadToolbar({
  tool,
  onTool,
  snap,
  onSnap,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  units,
  addShape,
  onAddShape,
  onAddPart,
  onDuplicatePart,
  onDeletePart,
  canEditSelection,
  onBoolean,
  pendingBoolean,
  booleanBusy,
  measureMode,
  onMeasureMode,
}: Props) {
  const chip =
    "rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div className="pointer-events-auto absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-[#0a0a0c]/85 px-2 py-1.5 shadow-lg shadow-black/40 backdrop-blur-xl md:right-auto md:max-w-[min(760px,calc(100%-1.5rem))]">
      {TOOLS.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.hint}
          onClick={() => onTool(item.id)}
          aria-pressed={tool === item.id}
          className={`${chip} ${
            tool === item.id
              ? "bg-violet-400/25 text-violet-100"
              : "text-[#9a948c] hover:bg-white/5 hover:text-white"
          }`}
        >
          {item.label}
        </button>
      ))}

      <Divider />

      <select
        value={addShape}
        onChange={(event) => onAddShape(event.target.value as PartShape)}
        title="Форма новой детали"
        aria-label="Форма новой детали"
        className="rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-[11px] text-[#cdc7bf] outline-none focus:border-violet-400/50"
      >
        {ADD_SHAPES.map((shape) => (
          <option key={shape.id} value={shape.id}>
            {shape.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onAddPart}
        title="Добавить деталь в сцену"
        className={`${chip} bg-violet-400/20 text-violet-100 hover:bg-violet-400/30`}
      >
        + Деталь
      </button>
      <button
        type="button"
        disabled={!canEditSelection}
        onClick={onDuplicatePart}
        title="Дублировать выбранную деталь"
        className={`${chip} text-[#9a948c] hover:bg-white/5 hover:text-white`}
      >
        Копия
      </button>
      <button
        type="button"
        disabled={!canEditSelection}
        onClick={onDeletePart}
        title="Удалить выбранную деталь (Del)"
        className={`${chip} text-red-300/90 hover:bg-red-500/15 hover:text-red-200`}
      >
        Удалить
      </button>

      <Divider />

      {BOOLEANS.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={!canEditSelection || booleanBusy}
          onClick={() => onBoolean(item.id)}
          title={item.hint}
          aria-pressed={pendingBoolean === item.id}
          className={`${chip} font-mono text-[13px] leading-none ${
            pendingBoolean === item.id
              ? "bg-amber-400/25 text-amber-100"
              : "text-[#9a948c] hover:bg-white/5 hover:text-white"
          }`}
        >
          {BOOLEAN_SYMBOLS[item.id]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onMeasureMode(!measureMode)}
        title="Измерить расстояние между двумя деталями"
        aria-pressed={measureMode}
        className={`${chip} ${
          measureMode
            ? "bg-sky-400/25 text-sky-100"
            : "text-[#9a948c] hover:bg-white/5 hover:text-white"
        }`}
      >
        Замер
      </button>

      <Divider />

      <button
        type="button"
        onClick={() => onSnap(!snap)}
        title={`Привязка к сетке, шаг ${units === "cm" ? "5 см" : "0.1 м"}`}
        aria-pressed={snap}
        className={`${chip} ${
          snap ? "bg-violet-400/20 text-violet-100" : "text-[#9a948c] hover:bg-white/5 hover:text-white"
        }`}
      >
        Привязка
      </button>
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        title="Отменить (Ctrl+Z)"
        className={`${chip} text-[#9a948c] hover:bg-white/5 hover:text-white`}
      >
        ↶
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={onRedo}
        title="Вернуть (Ctrl+Y)"
        className={`${chip} text-[#9a948c] hover:bg-white/5 hover:text-white`}
      >
        ↷
      </button>
      <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.16em] text-[#6a6560] sm:block">
        {booleanBusy
          ? "считаю…"
          : pendingBoolean
            ? "выбери вторую деталь"
            : measureMode
              ? "кликни две детали"
              : units}
      </span>
    </div>
  );
}
