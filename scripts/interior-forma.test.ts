import "next/dist/server/node-environment-baseline";
import test from "node:test";
import assert from "node:assert/strict";
import {Box3,Mesh,Vector3} from "three";
import {ASSETS} from "../src/shared/interior/catalog";
import {detailedAsset,detailedScene,disposeDetailed} from "../src/shared/interior/detailed";
import {detailedGlb} from "../src/backend/interior/detailed-glb";
import {newScene} from "../src/shared/interior/scene";
import {designWithPlanner} from "../src/backend/interior/engine";
import {projectInput,referencedFiles} from "../src/shared/forma/document";
import {db} from "../src/backend/db";
import {saveForma} from "../src/backend/forma/projects";
import {ROOM_TEMPLATES} from "../src/shared/interior/templates";
import {layoutIssues, parseScene} from "../src/shared/interior/scene";
test("FORMA meshes retain Atrion collision dimensions and finite triangles",()=>{
  for(const asset of ASSETS){const model=detailedAsset(asset.id),bounds=new Box3().setFromObject(model),size=bounds.getSize(new Vector3());
    assert(Math.abs(size.x-asset.width)<1e-5,asset.id);assert(Math.abs(size.y-asset.height)<1e-5,asset.id);assert(Math.abs(size.z-asset.depth)<1e-5,asset.id);assert(Math.abs(bounds.min.y)<1e-5);
    let triangles=0;model.traverse(n=>{if(n instanceof Mesh){const p=n.geometry.getAttribute("position");assert(Array.from(p.array).every(Number.isFinite));triangles+=(n.geometry.index?.count??p.count)/3;}});assert(triangles>12);disposeDetailed(model);
  }
});
test("detailed GLB contains actual triangles, embedded textures and scene bounds",async()=>{
  const {scene}=await designWithPlanner(newScene(),"кровать и шкаф",false,0),model=detailedScene(scene);
  const data=await detailedGlb(model),buffer=Buffer.from(data),jsonLength=buffer.readUInt32LE(12),doc=JSON.parse(buffer.subarray(20,20+jsonLength).toString());
  assert.equal(buffer.readUInt32LE(8),buffer.length);assert.equal(doc.asset.version,"2.0");assert(doc.images.length>0);
  assert(doc.meshes.length>20);assert(doc.accessors.some((a:{count:number})=>a.count>100));
  assert(doc.materials.some((m:{normalTexture?:unknown})=>m.normalTexture), "material surface detail must survive GLB export");
  for(const view of doc.bufferViews)assert(view.byteOffset+view.byteLength<=doc.buffers[0].byteLength);
  for(const im of doc.images){assert.equal(im.mimeType,"image/png");const v=doc.bufferViews[im.bufferView],start=28+jsonLength+v.byteOffset;assert.equal(buffer.subarray(start+1,start+4).toString(),"PNG");}
  disposeDetailed(model);
});
test("Atrion room templates retain valid dimensions, furniture access and door clearances",()=>{
  for(const template of ROOM_TEMPLATES) assert.deepEqual(layoutIssues(parseScene(template.scene)),[],template.id);
});
test("local furniture commands recognize templates without adding a duplicate generic desk",async()=>{
  const {scene}=await designWithPlanner(newScene(6,6),"кресло и журнальный стол",false,0);
  assert.deepEqual(scene.objects.map(o=>o.assetId).sort(),["armchair_soft","table_coffee"]);
});
test("FORMA file ownership references use only its isolated API namespace",()=>{
  assert.deepEqual(referencedFiles({a:"/api/forma/files/test-file",b:"/api/files/legacy",c:["/api/forma/files/test-file"]}),["test-file"]);
  assert.equal(projectInput.safeParse({id:"../escape",title:"x",document:{},revision:0}).success,false);
});
test("FORMA saving rejects foreign IDs, stale revisions and foreign file references",async()=>{
  const original=db.$transaction;
  const snapshot={config:{type:0,style:0,wall:0,floor:0,fabric:0,layout:0,light:0,decor:0},workshop:{items:[],plan:null,catalogItems:[],planItems:[],savedPlan:null,budget:{currency:"USD",prices:{},rates:{floor:0,walls:0,ceiling:0,labor:0},reserve:0,includeBase:false}}};
  const input={id:"forma-project",title:"Room",revision:0,document:{schemaVersion:2,role:"owner",activeVariantId:"v1",variants:[{id:"v1",name:"A",snapshot,preview:null,total:0,currency:"USD",updatedAt:"2026-10-08"}]}};
  let row:any=null,updates=0,projectCount=0;
  const readRow = (): any => row;
  const tx:any={$queryRaw:async()=>[],user:{findUniqueOrThrow:async()=>({plan:"free",planExpiresAt:null})},project:{count:async()=>projectCount},designProject:{count:async()=>0},formaFile:{count:async()=>0},formaProject:{
    findFirst:async({where}:any)=>row&&row.userId===where.userId?structuredClone(row):null,
    count:async({where}:any)=>row&&(where.id===row.id||where.userId===row.userId)?1:0,
    create:async({data}:any)=>row={...data,revision:1,archived:false},
    update:async({data}:any)=>{updates++;row={...row,...data,revision:row.revision+1};return row;}
  }};
  (db as any).$transaction=async(fn:any)=>fn(tx);
  try{
    projectCount=5000;
    await saveForma("owner",input);assert.equal(readRow().userId,"owner");
    await assert.rejects(()=>saveForma("other",input,input.id),/не найден/);
    await assert.rejects(()=>saveForma("other",input),/занят/);
    const stale=await saveForma("owner",input,input.id);assert(stale.conflict);assert.equal(updates,0);
    const withFile=structuredClone(input) as any;withFile.revision=1;withFile.document.variants[0].preview="/api/forma/files/foreign-file";
    await assert.rejects(()=>saveForma("owner",withFile,input.id),/Файлы недоступны/);assert.equal(updates,0);
    await saveForma("owner",{...input,revision:1,title:"Changed"},input.id);assert.equal(readRow().revision,2);assert.equal(readRow().title,"Changed");
  }finally{(db as any).$transaction=original;}
});
