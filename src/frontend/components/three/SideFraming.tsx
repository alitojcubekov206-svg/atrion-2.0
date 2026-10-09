"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";

/**
 * Slides the rendered image sideways (and up on phones) so a model sits beside
 * the copy instead of behind it, and widens the view on narrow screens so the
 * model is not cropped. Works on ratios, so it survives resizes.
 *
 * `setViewOffset` also sets the camera's aspect to fullWidth / fullHeight, so the
 * full size must be the canvas's real pixel size. Passing 1 × 1 forced a square
 * aspect: every scene was stretched sideways on desktops and squeezed on phones.
 */
export default function SideFraming({
  desktopShift,
  phoneLift = 0,
}: {
  desktopShift: number;
  phoneLift?: number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useEffect(() => {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const phone = w < 768;
    camera.zoom = Math.min(1, w / h / 0.75);
    if (phone) camera.setViewOffset(w, h, 0, phoneLift * h, w, h);
    else camera.setViewOffset(w, h, -desktopShift * w, 0, w, h);
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
      camera.aspect = w / h;
      camera.zoom = 1;
      camera.updateProjectionMatrix();
    };
  }, [camera, width, height, desktopShift, phoneLift]);

  return null;
}
