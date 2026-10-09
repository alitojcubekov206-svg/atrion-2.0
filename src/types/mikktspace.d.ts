declare module "three/examples/jsm/libs/mikktspace.module.js" {
  export const ready: Promise<void>;
  export const isReady: boolean;
  export function generateTangents(position: Float32Array, normal: Float32Array, uv: Float32Array): Float32Array;
}
