"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";

/**
 * Slides the rendered image sideways (and up on phones) so a model sits beside
 * the copy instead of behind it, and widens the view on narrow screens so the
 * model is not cropped. Works on ratios, so it survives resizes.
 */
export default function SideFraming({
  desktopShift,
  phoneLift = 0,
  fitAspect = 0.75,
}: {
  desktopShift: number;
  phoneLift?: number;
  /** Below this width/height ratio the view zooms out; a lower value keeps a narrow model larger on phones. */
  fitAspect?: number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useEffect(() => {
    const phone = width < 768;
    const aspect = width / Math.max(1, height);
    camera.zoom = Math.min(1, aspect / fitAspect);
    if (phone) camera.setViewOffset(1, 1, 0, phoneLift, 1, 1);
    else camera.setViewOffset(1, 1, -desktopShift, 0, 1, 1);
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
      camera.zoom = 1;
      camera.updateProjectionMatrix();
    };
  }, [camera, width, height, desktopShift, phoneLift, fitAspect]);

  return null;
}
