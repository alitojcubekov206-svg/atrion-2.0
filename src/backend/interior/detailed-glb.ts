import {Mesh, MeshStandardMaterial, type Group, type DataTexture} from "three";
import sharp from "sharp";
import {prepareExportTangents} from "@/shared/interior/export-tangents";

/** Export actual FORMA triangles, PBR materials and embedded procedural maps. */
export async function detailedGlb(root: Group): Promise<Uint8Array> {
  await prepareExportTangents(root);
  const chunks:Buffer[]=[], views:object[]=[], accessors:object[]=[], meshes:object[]=[], nodes:object[]=[], materials:object[]=[], images:object[]=[], textures:object[]=[];
  let offset=0;
  const append=(bytes:Buffer,target?:number)=>{const id=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}:{})}); const padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);chunks.push(padded);offset+=padded.length;return id;};
  const attribute=(array:Float32Array,type:string,min?:number[],max?:number[])=>{const id=accessors.length; accessors.push({bufferView:append(Buffer.from(array.buffer,array.byteOffset,array.byteLength),34962),componentType:5126,count:array.length/(type==="VEC2"?2:type==="VEC4"?4:3),type,...(min?{min,max}:{})});return id;};
  const materialIds=new Map<MeshStandardMaterial,number>(), textureIds=new Map<DataTexture,number>();
  const encodeTexture = async (texture: DataTexture) => {
    const existing = textureIds.get(texture); if (existing !== undefined) return existing;
    const im = texture.image;
    const png = await sharp(Buffer.from(im.data as Uint8Array), {raw: {width: im.width, height: im.height, channels: 4}}).png().toBuffer();
    images.push({bufferView: append(png), mimeType: "image/png"});
    const index = textures.length; textures.push({source: images.length - 1, sampler: 0}); textureIds.set(texture, index);
    return index;
  };
  const objects:Mesh[]=[];root.updateMatrixWorld(true); root.traverse(n=>{if(n instanceof Mesh) objects.push(n);});
  for(const object of objects) {
    const m=object.material as MeshStandardMaterial;
    if(!materialIds.has(m)) {
      const textureIndex = m.map ? await encodeTexture(m.map as DataTexture) : undefined;
      const normalIndex = m.normalMap ? await encodeTexture(m.normalMap as DataTexture) : undefined;
      materialIds.set(m,materials.length); materials.push({pbrMetallicRoughness:{baseColorFactor:[...m.color.toArray(),m.opacity],metallicFactor:m.metalness,roughnessFactor:m.roughness,...(textureIndex===undefined?{}:{baseColorTexture:{index:textureIndex}})},...(normalIndex===undefined?{}:{normalTexture:{index:normalIndex}}),...(m.transparent?{alphaMode:"BLEND",doubleSided:true}:{})});
    }
    const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();geometry.applyMatrix4(object.matrixWorld);geometry.computeBoundingBox();
    const pos=geometry.getAttribute("position"), normal=geometry.getAttribute("normal"), uv=geometry.getAttribute("uv");
    const attributes:Record<string,number>={POSITION:attribute(new Float32Array(pos.array),"VEC3",geometry.boundingBox!.min.toArray(),geometry.boundingBox!.max.toArray())};
    if(normal)attributes.NORMAL=attribute(new Float32Array(normal.array),"VEC3"); if(uv)attributes.TEXCOORD_0=attribute(new Float32Array(uv.array),"VEC2");
    const tangent=geometry.getAttribute("tangent");if(tangent)attributes.TANGENT=attribute(new Float32Array(tangent.array),"VEC4");
    meshes.push({primitives:[{attributes,material:materialIds.get(m)}]});nodes.push({name:object.name||"Furniture detail",mesh:meshes.length-1});geometry.dispose();
  }
  const bin=Buffer.concat(chunks), doc={asset:{version:"2.0",generator:"Atrion"},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,images,textures,samplers:[{wrapS:10497,wrapT:10497,magFilter:9729,minFilter:9729}],accessors,bufferViews:views,buffers:[{byteLength:bin.length}]};
  const raw=Buffer.from(JSON.stringify(doc)), json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);return new Uint8Array(Buffer.concat([header,json,bh,bin]));
}
