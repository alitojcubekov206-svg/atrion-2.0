"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type Phase = "idle" | "cover" | "reveal";
type WipeContext = { navigate: (href: string) => void };

const Ctx = createContext<WipeContext>({ navigate: () => {} });

export function usePageWipe() {
  return useContext(Ctx);
}

const EASE = [0.76, 0, 0.24, 1] as const;

export default function PageWipeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const pending = useRef<string | null>(null);
  const fromPath = useRef(pathname);

  const navigate = useCallback(
    (href: string) => {
      if (href === pathname) return;
      if (phase !== "idle") return;
      pending.current = href;
      fromPath.current = pathname;
      setPhase("cover");
    },
    [pathname, phase]
  );

  useEffect(() => {
    if (phase === "cover" && pathname !== fromPath.current) setPhase("reveal");
  }, [pathname, phase]);

  // If the route never changes (blocked navigation, same page), don't leave the
  // screen covered.
  useEffect(() => {
    if (phase !== "cover") return;
    const timer = setTimeout(() => setPhase("reveal"), 2500);
    return () => clearTimeout(timer);
  }, [phase]);

  const variants = reduced
    ? {
        off: { opacity: 0 },
        cover: { opacity: 1, transition: { duration: 0.15 } },
        reveal: { opacity: 0, transition: { duration: 0.2 } },
      }
    : {
        off: { x: "100%" },
        cover: { x: "0%", transition: { duration: 0.42, ease: EASE } },
        reveal: { x: "-100%", transition: { duration: 0.5, ease: EASE } },
      };

  return (
    <Ctx.Provider value={{ navigate }}>
      {children}
      <AnimatePresence>
        {phase !== "idle" && (
          <motion.div
            key="wipe"
            aria-hidden="true"
            variants={variants}
            initial="off"
            animate={phase}
            onAnimationComplete={(definition) => {
              if (definition === "cover" && pending.current) {
                router.push(pending.current);
                pending.current = null;
              } else if (definition === "reveal") {
                setPhase("idle");
              }
            }}
            className="fixed inset-0 z-[150] bg-[#050507]"
            style={{ pointerEvents: phase === "cover" ? "auto" : "none" }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(167,139,250,0.22),transparent_55%)]" />
            {!reduced && (
              <motion.div
                initial={{ x: "-30%" }}
                animate={{ x: "130%" }}
                transition={{ duration: 0.9, ease: "easeInOut" }}
                className="absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-[#c4b5fd]/40 to-transparent"
              />
            )}
            <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-[#a78bfa] to-transparent" />
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
