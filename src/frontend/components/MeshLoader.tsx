"use client";

import { motion } from "framer-motion";

const NODES = [
  [12, 30], [34, 12], [40, 48], [62, 22], [70, 52], [92, 14], [98, 44],
  [122, 30], [130, 56], [152, 18], [160, 46], [184, 32], [206, 16], [210, 50],
] as const;

const LINKS: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 3], [2, 4], [3, 5], [3, 6], [4, 6], [5, 7], [6, 7],
  [6, 8], [7, 9], [7, 10], [8, 10], [9, 11], [10, 11], [11, 12], [11, 13], [12, 13],
];

// A small neural mesh that keeps "thinking": links draw in sequence, nodes
// pulse, and a signal runs along the graph. Pure SVG, no WebGL.
export default function MeshLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-start gap-3" role="status" aria-live="polite">
      <svg viewBox="0 0 222 66" width="222" height="66" aria-hidden="true" className="overflow-visible">
        {LINKS.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={NODES[a][0]}
            y1={NODES[a][1]}
            x2={NODES[b][0]}
            y2={NODES[b][1]}
            stroke="#a78bfa"
            strokeWidth="1"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 0.7, 0.7, 0] }}
            transition={{
              duration: 3.2,
              times: [0, 0.3, 0.75, 1],
              delay: i * 0.09,
              repeat: Infinity,
              repeatDelay: 0.4,
              ease: "easeInOut",
            }}
          />
        ))}
        {NODES.map(([x, y], i) => (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r={2.2}
            fill="#c4b5fd"
            initial={{ opacity: 0.25, scale: 1 }}
            animate={{ opacity: [0.25, 1, 0.25], scale: [1, 1.5, 1] }}
            style={{ transformOrigin: `${x}px ${y}px` }}
            transition={{ duration: 1.6, delay: i * 0.12, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
        <motion.circle
          r={3}
          fill="#e879f9"
          style={{ filter: "drop-shadow(0 0 6px rgba(232,121,249,0.9))" }}
          animate={{
            cx: NODES.map((n) => n[0]),
            cy: NODES.map((n) => n[1]),
          }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
        />
      </svg>
      <span className="text-sm text-muted">{label}…</span>
    </div>
  );
}
