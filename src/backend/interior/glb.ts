import type {ModelPart} from "@/shared/types";
/** Box-based catalog meshes as glTF 2.0; shared unit geometry, per-part transforms. */
export function boxesGlb(parts: ModelPart[]): Uint8Array {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const faces = [
    {n: [0, 0, 1], p: [-1,-1,1, 1,-1,1, 1,1,1, -1,1,1]},
    {n: [0, 0, -1], p: [1,-1,-1, -1,-1,-1, -1,1,-1, 1,1,-1]},
    {n: [1, 0, 0], p: [1,-1,1, 1,-1,-1, 1,1,-1, 1,1,1]},
    {n: [-1, 0, 0], p: [-1,-1,-1, -1,-1,1, -1,1,1, -1,1,-1]},
    {n: [0, 1, 0], p: [-1,1,1, 1,1,1, 1,1,-1, -1,1,-1]},
    {n: [0, -1, 0], p: [-1,-1,-1, 1,-1,-1, 1,-1,1, -1,-1,1]},
  ];
  faces.forEach((f, i) => {positions.push(...f.p.map(x => x / 2)); for (let j = 0; j < 4; j++) normals.push(...f.n); const b = i * 4; indices.push(b, b+1, b+2, b, b+2, b+3);});
  const bin = Buffer.concat([Buffer.from(new Float32Array(positions).buffer), Buffer.from(new Float32Array(normals).buffer), Buffer.from(new Uint16Array(indices).buffer)]);
  const doc = {asset: {version: "2.0", generator: "Atrion interior catalog"}, scene: 0, scenes: [{nodes: parts.map((_, i) => i)}],
    nodes: parts.map((p, i) => ({name: p.name, mesh: i, translation: p.position, scale: p.size, rotation: [0, Math.sin(p.rotation[1] / 2), 0, Math.cos(p.rotation[1] / 2)]})),
    meshes: parts.map((_, i) => ({primitives: [{attributes: {POSITION: 0, NORMAL: 1}, indices: 2, material: i}]})),
    materials: parts.map(p => ({name: p.material, pbrMetallicRoughness: {baseColorFactor: [...[1,3,5].map(i => parseInt(p.color.slice(i, i+2),16) / 255), p.opacity ?? 1], metallicFactor: 0, roughnessFactor: .8}, ...(p.opacity !== undefined && p.opacity < 1 ? {alphaMode: "BLEND", doubleSided: true} : {})})),
    buffers: [{byteLength: bin.length}], bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 288, target: 34962}, {buffer: 0, byteOffset: 288, byteLength: 288, target: 34962}, {buffer: 0, byteOffset: 576, byteLength: 72, target: 34963}],
    accessors: [{bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-.5,-.5,-.5], max: [.5,.5,.5]}, {bufferView: 1, componentType: 5126, count: 24, type: "VEC3"}, {bufferView: 2, componentType: 5123, count: 36, type: "SCALAR"}]};
  const raw = Buffer.from(JSON.stringify(doc)), padded = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(padded);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + padded.length + bin.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return new Uint8Array(Buffer.concat([header, padded, bh, bin]));
}
