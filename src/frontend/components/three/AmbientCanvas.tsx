"use client";

import { Canvas, useThree, type CanvasProps } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

/**
 * Canvas for decorative background scenes.
 *
 * A hero scene that renders 60 times a second forever is what makes a landing
 * page feel heavy, so this one only draws when it is worth drawing: the render
 * loop is on demand, a driver ticks it at a capped rate, and the driver stops
 * whenever the tab is hidden or the canvas is scrolled out of view. Nothing
 * here changes how a scene is written — children still use `useFrame`.
 */

/** Ticks the on-demand render loop at a fixed rate while `active`. */
function FrameDriver({ fps, active }: { fps: number; active: boolean }) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = 0;
    const interval = 1000 / fps;

    const step = (time: number) => {
      frame = requestAnimationFrame(step);
      if (time - last < interval) return;
      last = time;
      invalidate();
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, fps, invalidate]);

  return null;
}

type Props = Omit<CanvasProps, "children" | "frameloop"> & {
  children: ReactNode;
  /** Frames per second while visible. Background scenes read fine at 30. */
  fps?: number;
  className?: string;
};

export default function AmbientCanvas({ children, fps = 30, className, gl, ...rest }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const element = host.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: "120px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div ref={host} className={className ?? "absolute inset-0"}>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.25]}
        performance={{ min: 0.4 }}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "low-power",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          ...(typeof gl === "object" && gl !== null ? gl : {}),
        }}
        {...rest}
      >
        <FrameDriver fps={fps} active={onScreen && tabVisible} />
        {children}
      </Canvas>
    </div>
  );
}
