/** Browser-only GLB import. Load lazily from a client component. */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { groundParts } from "@/shared/geometry";
import type { ModelPart } from "@/shared/types";

/** The image bytes a glTF texture points to, straight from the GLB binary. */
function glbImages(buffer: ArrayBuffer): { json: GltfJson; image: (index: number) => Blob | null } {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Это не GLB");
  let offset = 12;
  let json: GltfJson = {};
  let bin: Uint8Array | null = null;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = new Uint8Array(buffer, offset + 8, length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  return {
    json,
    image: (index) => {
      const entry = json.images?.[index];
      const bufferView = entry?.bufferView !== undefined ? json.bufferViews?.[entry.bufferView] : undefined;
      if (!entry || !bufferView || !bin) return null;
      const start = bufferView.byteOffset ?? 0;
      return new Blob([bin.slice(start, start + bufferView.byteLength)], { type: entry.mimeType ?? "image/png" });
    },
  };
}

type GltfJson = {
  images?: { bufferView?: number; mimeType?: string }[];
  bufferViews?: { byteOffset?: number; byteLength: number }[];
  textures?: { source?: number }[];
};

/** Re-encode a texture as a JPEG data URL, in its original orientation. */
async function textureDataUrl(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = Math.min(1024, image.naturalWidth || 1024);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = Math.round((size * (image.naturalHeight || size)) / (image.naturalWidth || size));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const round = (digits: number) => {
  const k = 10 ** digits;
  return (n: number) => Math.round(n * k) / k;
};

/**
 * Turn a GLB into mesh parts: world transforms baked in, scaled so its
 * largest side matches `targetSize` metres, standing on y = 0. Keeps vertex
 * colours and a base-colour texture when the file has them.
 */
export async function glbToParts(buffer: ArrayBuffer, targetSize: number): Promise<ModelPart[]> {
  const gltf: GLTF = await new GLTFLoader().parseAsync(buffer, "");
  const { json, image } = glbImages(buffer);
  gltf.scene.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
  });
  if (!meshes.length) throw new Error("В модели нет геометрии");

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const extent = box.getSize(new THREE.Vector3());
  const scale = targetSize / Math.max(extent.x, extent.y, extent.z, 1e-6);
  const p4 = round(4);
  const p3 = round(3);

  const parts: ModelPart[] = [];
  for (const [i, mesh] of meshes.entries()) {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.scale(scale, scale, scale);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();

    const position = Array.from(geometry.getAttribute("position").array as ArrayLike<number>, p4);
    const normal = Array.from(geometry.getAttribute("normal").array as ArrayLike<number>, p3);
    const uvAttr = geometry.getAttribute("uv");
    const uv = uvAttr ? Array.from(uvAttr.array as ArrayLike<number>, p4) : undefined;
    const index = geometry.getIndex() ? Array.from(geometry.getIndex()!.array as ArrayLike<number>) : undefined;

    // getX/Y/Z undo glTF's normalised integer encoding of COLOR_0. Generated
    // models store display (sRGB) colours there, while three.js and the glTF
    // spec treat vertex colours as linear — left as-is they render washed out.
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    let color: number[] | undefined;
    if (colorAttr && colorAttr.count * 3 === position.length) {
      const linear = (c: number) => p3(c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      color = new Array(colorAttr.count * 3);
      for (let v = 0; v < colorAttr.count; v++) {
        color[v * 3] = linear(colorAttr.getX(v));
        color[v * 3 + 1] = linear(colorAttr.getY(v));
        color[v * 3 + 2] = linear(colorAttr.getZ(v));
      }
    }

    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    let texture: string | undefined;
    if (material?.map && uv) {
      const link = gltf.parser.associations.get(material.map) as { textures?: number } | undefined;
      const source = link?.textures !== undefined ? json.textures?.[link.textures]?.source : 0;
      const blob = image(source ?? 0);
      if (blob) texture = await textureDataUrl(blob);
    }

    // Vertices are baked at real size; position/size describe the bounding box.
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    for (let v = 0; v < position.length; v += 3) {
      position[v] = p4(position[v] - center.x);
      position[v + 1] = p4(position[v + 1] - center.y);
      position[v + 2] = p4(position[v + 2] - center.z);
    }

    parts.push({
      id: `scan-${i}`,
      name: meshes.length > 1 ? `Модель ${i + 1}` : "Модель",
      shape: "mesh",
      position: [p4(center.x), p4(center.y), p4(center.z)],
      size: [p4(Math.max(size.x, 0.01)), p4(Math.max(size.y, 0.01)), p4(Math.max(size.z, 0.01))],
      rotation: [0, 0, 0],
      color: material?.color ? `#${material.color.getHexString()}` : "#cccccc",
      material: "Сгенерированная поверхность",
      quantity: 1,
      role: "volume",
      group: "Модель",
      roughness: 0.75,
      metalness: 0.02,
      mesh: {
        position,
        normal,
        ...(index ? { index } : {}),
        ...(color ? { color } : {}),
        ...(uv && texture ? { uv, texture } : {}),
      },
    });
    geometry.dispose();
  }
  return groundParts(parts);
}
