"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffects } from "@/frontend/effects";

// Plays once each time `trigger` increments: a radial flash, an inner glow
// that fades, and (at full effects) two light streaks crossing the viewport.
export default function GenerationReveal({ trigger }: { trigger: number }) {
  const level = useEffects();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (trigger === 0) return;
    setActive(trigger);
    const timer = setTimeout(() => setActive(0), 1500);
    return () => clearTimeout(timer);
  }, [trigger]);

  if (!level || level === "off") return null;

  return (
    <AnimatePresence>
      {active > 0 && (
        <motion.div
          key={active}
          aria-hidden="true"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.9, 0], scale: [0.5, 1.3, 1.8] }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(196,181,253,0.55),transparent_60%)]"
          />
          <motion.div
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.3, ease: "easeOut" }}
            className="absolute inset-0"
            style={{ boxShadow: "inset 0 0 90px rgba(167,139,250,0.5)" }}
          />
          {level === "full" && (
            <>
              <motion.div
                initial={{ x: "-120%", opacity: 0 }}
                animate={{ x: "120%", opacity: [0, 1, 0] }}
                transition={{ duration: 0.7, ease: "easeInOut" }}
                className="absolute inset-y-0 left-0 w-full -skew-x-12 bg-gradient-to-r from-transparent via-[#c4b5fd]/60 to-transparent"
                style={{ maskImage: "linear-gradient(90deg, transparent, black 45%, black 55%, transparent)" }}
              />
              <motion.div
                initial={{ x: "120%", opacity: 0 }}
                animate={{ x: "-120%", opacity: [0, 0.8, 0] }}
                transition={{ duration: 0.65, delay: 0.1, ease: "easeInOut" }}
                className="absolute inset-y-0 left-0 w-full skew-x-12 bg-gradient-to-r from-transparent via-[#e879f9]/50 to-transparent"
                style={{ maskImage: "linear-gradient(90deg, transparent, black 45%, black 55%, transparent)" }}
              />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
