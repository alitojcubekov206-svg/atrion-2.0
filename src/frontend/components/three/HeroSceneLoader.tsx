"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

/** Defer WebGL until after first paint — fixes landing lag on weak PCs */
export default function HeroSceneLoader() {
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReduced(true);
      return;
    }
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const kick = () => setReady(true);
    if (isMobile) {
      // Mobile: wait longer / idle
      const t = window.setTimeout(kick, 1200);
      return () => window.clearTimeout(t);
    }
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(kick, { timeout: 1800 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(kick, 400);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="absolute inset-0 -z-10">
      {/* Instant CSS backdrop — no WebGL cost */}
      <div className="absolute inset-0 bg-[#050507]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(167,139,250,0.22),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_70%,rgba(232,121,249,0.1),transparent_50%)]" />
      {!reduced && ready ? <HeroScene /> : null}
    </div>
  );
}
