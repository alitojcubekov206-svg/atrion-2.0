import test from "node:test";
import assert from "node:assert/strict";
import { parseRig2D, evaluateRig2D } from "../src/backend/design/rig2d";
import { parseRig3D, evaluateRig3D } from "../src/backend/design/rig3d";
import { parseHouse, buildHouse } from "../src/backend/design/house";
import { createHouse, houseConcept, splitRoom } from "../src/shared/house/editor";
import { neutralDeformer, deformPoint, parseDeformers, deformerChain } from "../src/shared/rigging/deformers";
import { captureKeyform, parseParameters, sampleKeyforms } from "../src/shared/rigging/parameters";

test("clip display names survive export without changing animation identity",()=>{
  const source=rig2();const named={...source,clips:source.clips.map(c=>({...c,name:"Мой жест"}))};
  const parsed=parseRig2D(JSON.parse(JSON.stringify(named)));
  assert.equal(parsed.clips[0].name,"Мой жест");assert.equal(parsed.clips[0].id,source.clips[0].id);
  assert.deepEqual(evaluateRig2D(parsed,{clipId:parsed.clips[0].id,time:.5}),evaluateRig2D(parseRig2D(source),{clipId:source.clips[0].id,time:.5}));
  assert.throws(()=>parseRig2D({...named,clips:named.clips.map(c=>({...c,name:" ".repeat(81)}))}));
});

function parameterRig(){
  const doc=parseRig2D(rig2());doc.attachments=[];doc.layers[0].skin=gridMesh(20,40,2,2,"root");
  const d=neutralDeformer("turn","rotation",[-10,-20],[20,40]);doc.deformers=[d];doc.layers[0].deformerId=d.id;
  const zero=captureKeyform(d,0),end={...captureKeyform(d,30),rotation:Math.PI/2};
  doc.parameters=[{id:"angle",name:"Наклон",min:0,max:30,default:0,value:0,deformerId:d.id,keyforms:[zero,end]}];
  doc.clips=[{id:"param_motion",duration:2,loop:true,tracks:[],parameterTracks:[{parameterId:"angle",keys:[{time:0,value:0,interpolation:"linear"},{time:1,value:30,interpolation:"linear"},{time:2,value:0,interpolation:"linear"}]}]}];
  return parseRig2D(doc);
}

test("parameter keyforms interpolate geometry analytically without changing rest or UV",()=>{
  const doc=parameterRig(),before=JSON.stringify(doc),rest=evaluateRig2D(doc),middle=evaluateRig2D(doc,{parameterValues:{angle:15}});
  const p=rest.layers[0].skin!.vertices[0],q=middle.layers[0].skin!.vertices[0],c=Math.SQRT1_2;
  near(q[0],(p[0]-p[1])*c);near(q[1],(p[0]+p[1])*c);
  assert.deepEqual(rest.layers[0].skin!.uv,middle.layers[0].skin!.uv);assert.equal(JSON.stringify(doc),before);
  assert.deepEqual(evaluateDesign(doc,{parameterValues:{angle:15}}),middle);
  assert.throws(()=>evaluateRig2D(doc,{parameterValues:{angle:31}}));assert.throws(()=>evaluateRig2D(doc,{parameterValues:{missing:0}}));
});

test("parameter clips loop, clamp, step and round-trip at the same time independent of sampling FPS",()=>{
  const doc=parameterRig(),restored=parseRig2D(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(evaluateRig2D(doc,{clipId:"param_motion",time:0}),evaluateRig2D(doc,{clipId:"param_motion",time:2}));
  const expected=evaluateRig2D(doc,{clipId:"param_motion",time:.5});
  for(const fps of [30,60,120]){for(let frame=0;frame<fps/2;frame++)evaluateRig2D(doc,{clipId:"param_motion",time:frame/fps});assert.deepEqual(evaluateRig2D(doc,{clipId:"param_motion",time:.5}),expected);}
  assert.deepEqual(evaluateRig2D(restored,{clipId:"param_motion",time:.5}),expected);
  assert.equal(expected.parameterValues!.angle,15);
  doc.clips[0].parameterTracks![0].keys[0].interpolation="step";
  assert.equal(evaluateRig2D(doc,{clipId:"param_motion",time:.5}).parameterValues!.angle,0);
  doc.clips[0].loop=false;assert.equal(evaluateRig2D(doc,{clipId:"param_motion",time:8}).parameterValues!.angle,0);
  assert.equal(evaluateRig2D(doc,{clipId:"param_motion",time:.5,parameterValues:{angle:20}}).parameterValues!.angle,20);
});

test("parameter parser rejects conflicting targets, invalid time and folded intermediate warp",()=>{
  const doc=parameterRig();
  for(const edit of [(d:typeof doc)=>{d.parameters![0].max=0;},(d:typeof doc)=>{d.parameters![0].deformerId="missing";},(d:typeof doc)=>{d.parameters!.push({...d.parameters![0],id:"second"});},(d:typeof doc)=>{d.parameters![0].default=12;},(d:typeof doc)=>{d.clips[0].parameterTracks![0].keys[1].time=0;}]){const broken=structuredClone(doc);edit(broken);assert.throws(()=>parseRig2D(broken));}
  const warp=neutralDeformer("warp","warp",[-50,-50],[100,100]);if(warp.kind!=="warp")return;
  const a=captureKeyform(warp,0),b={...captureKeyform(warp,1),points:warp.points.map(([x,y]):[number,number]=>[-x,-y])};
  parseDeformers([{...warp,points:b.points}]);
  assert.throws(()=>parseParameters([{id:"warp_param",name:"Warp",min:0,max:1,default:0,value:0,deformerId:"warp",keyforms:[a,b]}],[warp]),/Между/);
  const moved={...captureKeyform(warp,1),points:warp.points.map(([x,y]):[number,number]=>[x+10,y])};
  const [valid]=parseParameters([{id:"warp_param",name:"Warp",min:0,max:1,default:0,value:0,deformerId:"warp",keyforms:[a,moved]}],[warp]);
  near(sampleKeyforms(valid,.5).points![4][0],5);
});

test("warp has identity rest, analytic bilinear displacement and continuous outside boundary",()=>{
  const warp=neutralDeformer("warp","warp",[0,0],[100,100]);
  assert.equal(warp.kind,"warp");if(warp.kind!=="warp")return;
  for(const p of [[0,0],[25,25],[50,50],[100,100],[120,-20]] as [number,number][])assert.deepEqual(deformPoint(warp,p),p);
  warp.points[4][0]+=10;
  parseDeformers([warp]);
  assert.deepEqual(deformPoint(warp,[50,50]),[60,50]);
  assert.deepEqual(deformPoint(warp,[25,25]),[27.5,25]);
  assert.deepEqual(deformPoint(warp,[120,50]),[120,50]);
  warp.points=warp.points.map(([x,y])=>[x+5,y-3]);
  assert.deepEqual(deformPoint(warp,[120,50]),[125,47]);
});

test("nested rotation transforms child once; invalid cages, cycles and references are rejected",()=>{
  const root=neutralDeformer("parent","rotation",[-1,-1],[2,2]);root.rotation=Math.PI/2;
  const child=neutralDeformer("child","rotation",[-1,-1],[2,2],"parent");child.position=[10,0];
  const p=deformerChain(parseDeformers([child,root]),"child").reduce((p,d)=>deformPoint(d,p),[2,0] as [number,number]);
  near(p[0],0);near(p[1],12);
  assert.throws(()=>parseDeformers([{...root,parentId:"child"},child]),DesignError);
  assert.throws(()=>parseDeformers([child]),DesignError);
  assert.throws(()=>parseDeformers([root,root]),DesignError);
  const folded=neutralDeformer("folded","warp",[0,0],[100,100]);if(folded.kind!=="warp")return;
  folded.points[4]=[-50,50];assert.throws(()=>parseDeformers([folded]),DesignError);
});

test("deformer groups keep UV and survive animated rig JSON round-trip",()=>{
  const doc=parseRig2D(rig2());doc.attachments=[];
  const asset=doc.assets[0];doc.layers[0].skin=gridMesh(asset.width,asset.height,2,2,"root");
  const second=structuredClone(doc.layers[0]);second.id="second";doc.layers.push(second);
  const before=evaluateRig2D(doc,{pose:{}});
  const d=neutralDeformer("group","rotation",[0,0],[100,100]);d.position=[10,20];doc.deformers=[d];doc.layers.forEach(l=>l.deformerId=d.id);
  const parsed=parseRig2D(JSON.parse(JSON.stringify(doc))),after=evaluateRig2D(parsed,{pose:{}});
  after.layers.forEach((layer,i)=>{assert.deepEqual(layer.skin!.uv,before.layers[i].skin!.uv);layer.skin!.vertices.forEach((p,j)=>{near(p[0],before.layers[i].skin!.vertices[j][0]+10);near(p[1],before.layers[i].skin!.vertices[j][1]+20);});});
  assert.deepEqual(evaluateRig2D(doc,{clipId:doc.clips[0].id,time:.5}),evaluateRig2D(parsed,{clipId:doc.clips[0].id,time:.5}));
  const invalid=structuredClone(doc);invalid.layers[0].deformerId="missing";assert.throws(()=>parseRig2D(invalid));
  delete invalid.layers[0].deformerId;delete invalid.layers[1].skin;assert.throws(()=>parseRig2D(invalid));
});

test("house editor keeps room area, export geometry and round-trip consistent",()=>{
  const doc=createHouse(),floor=doc.floors[0];
  assert.equal(floor.rooms.reduce((area,r)=>area+r.width*r.depth,0),108);
  assert.throws(()=>splitRoom(doc,floor.id,"room_1","x","split"),/проёмы/);
  floor.openings=floor.openings.filter(o=>o.roomId!=="room_1");
  const divided=splitRoom(doc,floor.id,"room_1","x","split");
  assert.equal(divided.floors[0].rooms.reduce((area,r)=>area+r.width*r.depth,0),108);
  assert.equal(divided.floors[0].rooms.length,4);
  assert.equal(doc.floors[0].rooms.length,3);
  assert.deepEqual(parseHouse(JSON.parse(JSON.stringify(divided))),divided);
  const before=houseConcept(doc),after=houseConcept(divided);
  assert.ok(after.parts.some(p=>p.role==="wall"&&Math.abs(p.position[0]+3)<1e-7));
  assert.equal(after.dimensions.width,before.dimensions.width);
  assert.ok(houseConcept(doc,undefined,true).parts.every(p=>p.group!=="roof"));
  assert.ok(before.parts.some(p=>p.group==="roof"));
});

test("house floor visibility never removes floors from the exported source",()=>{
  const doc=createHouse();doc.floors.push({...structuredClone(doc.floors[0]),id:"floor_2"});
  const parsed=parseHouse(doc),visible=houseConcept(parsed,"floor_2",true),full=houseConcept(parsed);
  assert.ok(visible.parts.every(p=>p.group==="floor_2"));
  assert.ok(full.parts.some(p=>p.group==="floor_1"));
  assert.ok(full.parts.some(p=>p.group==="roof"));
  assert.ok(full.engineeringNotes.some(n=>n.includes("лестницы")));
  assert.deepEqual(parsed,doc);
});
import { parseDesignDocument, evaluateDesign } from "../src/backend/design/documents";
import { readDesignBody, MAX_DESIGN_BODY_BYTES } from "../src/backend/design/body";
import { addBone2D, bindLayer, bindPart, blank2D, demo3D, parseRigDocument, posedConcept, removeBone, rigFromConcept } from "../src/shared/rigging/editor";
import { is2DRiggingRequest } from "../src/shared/rigging/intent";
import { createCharacterConcept, imageConfiguration, imageRequest, MAX_IMAGE_BYTES, validateImagePayload } from "../src/backend/characters/concept";
import { characterImageConfiguration, characterImageStatus, cloudflareImageGenerator, cloudflareImageRequest, MAX_IMAGE_RESPONSE_BYTES } from "../src/backend/characters/providers";
import { characterImageFormat } from "../src/shared/characters";
import { DesignError } from "../src/backend/design/validation";
import { createDesignStore } from "../src/backend/design/store";
import { defaultLandmarks, fullBodyRig } from "../src/shared/rigging/fullbody";
import { removeWhiteBorder } from "../src/shared/rigging/cutout";
import { gridMesh, insertMeshVertex, moveMeshVertex, removeMeshVertex } from "../src/shared/rigging/mesh";

test("editable mesh keeps UV fixed, rejects folds and preserves project round-trip",()=>{
  const doc=parseRig2D(rig2());doc.attachments=[];
  const asset=doc.assets[0],mesh=gridMesh(asset.width,asset.height,2,2,"root");
  const changed=moveMeshVertex(mesh,4,[asset.width*.6,asset.height*.45],asset.width,asset.height);
  assert.deepEqual(changed.uv,mesh.vertices);assert.notDeepEqual(changed.vertices,mesh.vertices);
  assert.deepEqual(mesh.vertices,mesh.uv);
  assert.throws(()=>moveMeshVertex(mesh,4,[0,0],asset.width,asset.height));
  doc.layers[0].skin=changed;
  const restored=parseRig2D(JSON.parse(JSON.stringify(doc))),rendered=evaluateRig2D(restored,{pose:{}}).layers[0].skin!;
  assert.deepEqual(rendered.uv,mesh.uv);assert.deepEqual(restored.layers[0].skin,changed);
  const invalid=structuredClone(doc);invalid.layers[0].skin!.uv![0]=[-1,0];assert.throws(()=>parseRig2D(invalid));
  invalid.layers[0].skin!.uv=changed.uv!.slice(1);assert.throws(()=>parseRig2D(invalid));
  invalid.layers[0].skin!.uv=changed.vertices.map(()=>[0,0]);assert.throws(()=>parseRig2D(invalid));
});

test("mesh insertion and removal retain covered area and interpolate UV and weights",()=>{
  const mesh=gridMesh(100,100,2,2,"root");mesh.weights[1]=[{boneId:"child",weight:1}];
  const area=(m:typeof mesh)=>m.triangles.reduce((s,[i,j,k])=>{const [a,b,c]=[m.vertices[i],m.vertices[j],m.vertices[k]];return s+Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;},0);
  const inserted=insertMeshVertex(mesh,[35,10]);
  near(area(inserted),10000);assert.equal(inserted.vertices.length,10);assert.deepEqual(inserted.uv![9],[35,10]);
  near(inserted.weights[9].reduce((s,w)=>s+w.weight,0),1);assert(inserted.weights[9].some((w)=>w.boneId==="child"));
  const removed=removeMeshVertex(inserted,9);near(area(removed),10000);assert.equal(removed.vertices.length,9);
  const middle=removeMeshVertex(mesh,4);near(area(middle),10000);assert.equal(middle.vertices.length,8);
  const corner=removeMeshVertex(mesh,0);near(area(corner),8750);assert.equal(corner.vertices.length,8);
  assert.throws(()=>insertMeshVertex(mesh,[1000,1000]));assert.throws(()=>gridMesh(100,100,33,2,"root"));
  assert(removed.triangles.every((t)=>t.every((i)=>i>=0&&i<removed.vertices.length)));
  const deformed=moveMeshVertex(mesh,4,[55,45],100,100),split=insertMeshVertex(deformed,[35,10]);
  assert.notDeepEqual(split.uv![9],split.vertices[9]);
});

test("rigid layer to editable mesh retains rest placement and animated bone attachment",()=>{
  const original=parseRig2D(rig2()),binding=original.attachments[0],asset=original.assets[0];
  const meshDoc=bindLayer(original,binding.layerId,null,{}),layer=meshDoc.layers.find((l)=>l.id===binding.layerId)!;
  layer.skin=gridMesh(asset.width,asset.height,1,1,binding.boneId);
  const doc=parseRig2D(meshDoc),bone=doc.bones.find((b)=>b.id===binding.boneId)!;
  for(const pose of [{},{[bone.id]:{...bone.bind,rotation:bone.bind.rotation+.7}}]){
    const matrix=evaluateRig2D(original,{pose}).layers.find((l)=>l.id===layer.id)!.matrix;
    const result=evaluateRig2D(doc,{pose}).layers.find((l)=>l.id===layer.id)!.skin!;
    layer.skin.vertices.forEach(([x,y],i)=>{near(result.vertices[i][0],matrix[0]*x+matrix[2]*y+matrix[4]);near(result.vertices[i][1],matrix[1]*x+matrix[3]*y+matrix[5]);});
  }
});

test("weighted 2D skin preserves rest, blends two bones and round-trips",()=>{
  const doc=parseRig2D(rig2());doc.attachments=[];doc.layers[0].pivot=[0,0];
  doc.layers[0].skin={vertices:[[0,0],[20,0],[20,40]],triangles:[[0,1,2]],weights:[[{boneId:"root",weight:1}],[{boneId:"root",weight:.5},{boneId:"child",weight:.5}],[{boneId:"child",weight:1}]]};
  const parsed=parseRig2D(JSON.parse(JSON.stringify(doc))),rest=evaluateRig2D(parsed,{pose:{}}).layers[0].skin!;
  assert.deepEqual(rest.vertices,doc.layers[0].skin.vertices);
  const pose={child:{position:[100,0],rotation:Math.PI/2,scale:[1,1]}};
  const bent=evaluateRig2D(parsed,{pose}).layers[0].skin!;
  near(bent.vertices[0][0],0);near(bent.vertices[1][0],60);near(bent.vertices[1][1],-40);
  near(bent.vertices[2][0],60);near(bent.vertices[2][1],-80);
  assert.deepEqual(evaluateRig2D(parsed,{pose:{}}).layers[0].skin!.vertices,rest.vertices);
  assert.throws(()=>bindLayer(parsed,"handLayer","root"),DesignError);
  assert.throws(()=>removeBone(parsed,"child"),DesignError);
  const before=JSON.stringify(parsed);
  for(const mutate of [
    (d:typeof parsed)=>{d.layers[0].skin!.weights[0][0].weight=.7;},
    (d:typeof parsed)=>{d.layers[0].skin!.weights[0][0].boneId="missing";},
    (d:typeof parsed)=>{d.layers[0].skin!.triangles[0]=[0,0,1];},
    (d:typeof parsed)=>{d.layers[0].skin!.triangles[0][2]=99;},
    (d:typeof parsed)=>{d.attachments=[{layerId:"handLayer",boneId:"root",offset:{position:[0,0],rotation:0,scale:[1,1]}}];},
  ]){const invalid=structuredClone(parsed);mutate(invalid);assert.throws(()=>parseRig2D(invalid),DesignError);}
  assert.equal(JSON.stringify(parsed),before);
});

test("fullbody rig uses valid weights, bounds and deterministic clips after JSON export",()=>{
  const asset={id:"art",uri:"https://example.invalid/art.webp",mime:"image/webp" as const,width:300,height:500},alpha=new Uint8Array(150000).fill(255);
  const doc=fullBodyRig(asset,defaultLandmarks({left:0,right:300,top:0,bottom:500}),alpha);
  assert.equal(doc.bones.length,14);assert.equal(doc.layers.length,1);
  const restored=parseRig2D(JSON.parse(JSON.stringify(doc)));
  const rest=evaluateRig2D(doc,{pose:{}}).layers[0].skin!,moved=evaluateRig2D(doc,{clipId:"greeting",time:.75}).layers[0].skin!;
  rest.vertices.forEach((p,i)=>{near(p[0],doc.layers[0].skin!.vertices[i][0]-150);near(p[1],doc.layers[0].skin!.vertices[i][1]-250);});
  assert(moved.vertices.some((p,i)=>Math.hypot(p[0]-rest.vertices[i][0],p[1]-rest.vertices[i][1])>10));
  assert.deepEqual(evaluateRig2D(restored,{clipId:"greeting",time:.75}),evaluateRig2D(doc,{clipId:"greeting",time:.75}));
  assert.deepEqual(doc.clips.map((clip)=>clip.id),["idle","greeting","sway"]);
  for(const clip of doc.clips){
    const start=evaluateRig2D(doc,{clipId:clip.id,time:0});
    assert.deepEqual(evaluateRig2D(doc,{clipId:clip.id,time:clip.duration}),start);
    assert.notDeepEqual(evaluateRig2D(doc,{clipId:clip.id,time:clip.duration/4}).layers[0].skin!.vertices,start.layers[0].skin!.vertices);
    assert.deepEqual(evaluateRig2D(restored,{clipId:clip.id,time:1}),evaluateRig2D(doc,{clipId:clip.id,time:1}));
  }
  const shin=doc.bones.find((b)=>b.id==="shin_l")!;
  const leg=evaluateRig2D(doc,{pose:{shin_l:{...shin.bind,rotation:shin.bind.rotation-.3}}}).layers[0].skin!;
  doc.layers[0].skin!.vertices.forEach((p,i)=>{if(p[0]>150&&p[1]<200){near(leg.vertices[i][0],rest.vertices[i][0]);near(leg.vertices[i][1],rest.vertices[i][1]);}});
  assert.throws(()=>fullBodyRig(asset,defaultLandmarks({left:0,right:300,top:0,bottom:500}),new Uint8Array(150000)),DesignError);
});

test("white-border removal preserves enclosed whites and source pixels",()=>{
  const input=new Uint8ClampedArray(7*7*4).fill(255);
  for(let y=1;y<6;y++)for(let x=1;x<6;x++)if(x===1||x===5||y===1||y===5){const i=(y*7+x)*4;input[i]=20;input[i+1]=80;input[i+2]=30;}
  const before=input.slice(),output=removeWhiteBorder(input,7,7,24);
  assert.equal(output[3],0);assert.equal(output[(3*7+3)*4+3],255);assert.equal(output[(1*7+1)*4+3],255);
  const seeded=removeWhiteBorder(input,7,7,24,[[3,3]]);
  assert.equal(seeded[(3*7+3)*4+3],0);assert.equal(seeded[(1*7+1)*4+3],255);
  assert.deepEqual(input,before);assert.throws(()=>removeWhiteBorder(input,8,7,24));
});

const transform2 = (x=0,y=0,rotation=0) => ({position:[x,y],rotation,scale:[1,1]});
const transform3 = (x=0,y=0,z=0,angle=0) => ({position:[x,y,z],rotation:[0,0,angle]});
function rig2() {
  return {kind:"rig2d",schemaVersion:1,canvas:{width:400,height:400},
    assets:[{id:"hand",uri:"https://example.invalid/hand.png",mime:"image/png",width:20,height:40}],
    layers:[{id:"handLayer",assetId:"hand",zIndex:0,visible:true,pivot:[10,20],transform:transform2()}],
    bones:[{id:"root",parentId:null,length:100,bind:transform2()}, {id:"child",parentId:"root",length:100,bind:transform2(100)}],
    attachments:[{layerId:"handLayer",boneId:"child",offset:transform2(100)}],
    clips:[{id:"wave",duration:1,loop:false,tracks:[{boneId:"root",rotationMode:"shortest",keys:[
      {time:0,transform:transform2(),interpolation:"linear"}, {time:1,transform:transform2(0,0,Math.PI/2),interpolation:"linear"}
    ]}]}]};
}
function rig3() {
  return {kind:"rig3d",schemaVersion:1,units:"m",
    bones:[{id:"root",parentId:null,length:1,bind:transform3()}, {id:"child",parentId:"root",length:1,bind:transform3(0,1)}],
    parts:[{id:"hand",name:"Hand",shape:"box",color:"#ffffff",size:[0.2,0.4,0.2],position:[0,2,0],rotation:[0,0,0]}],
    bindings:[{partId:"hand",boneId:"child"}]};
}
function house() {
  return {kind:"house",schemaVersion:1,units:"m",width:12,depth:9,floorHeight:3,wallThickness:0.2,wallColor:"#c8c4bc",roof:"flat",
    floors:[{id:"ground",rooms:[{id:"left",name:"Living",x:0,z:0,width:6,depth:9},{id:"right",name:"Bedroom",x:6,z:0,width:6,depth:9}],
      openings:[{id:"entry",roomId:"left",side:"north",kind:"door",offset:1,width:1,bottom:0,height:2.1}]}]};
}
function near(actual: number,expected: number) {assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);}
function invalid(value: unknown) {assert.throws(() => parseDesignDocument(value),DesignError);}

test("2D parent FK and layer pivot follow a quarter turn analytically",() => {
  const input=rig2(),document=parseRig2D(input);
  const result=evaluateRig2D(document,{pose:{root:transform2(0,0,Math.PI/2)}});
  const child=result.bones.find((bone) => bone.id==="child")!;
  near(child.head[0],0);near(child.head[1],100);near(child.tail[0],0);near(child.tail[1],200);
  const m=result.layers[0].matrix;
  near(m[0]*10+m[2]*20+m[4],0);near(m[1]*10+m[3]*20+m[5],200);
  assert.deepEqual(input,rig2(),"evaluation must not mutate bind data");
});
test("2D sampling, clamping and reset are independent of playback frame rate",() => {
  const document=parseRig2D(rig2());
  const midpoint=evaluateRig2D(document,{clipId:"wave",time:0.5});
  near(midpoint.bones[0].matrix[0],Math.SQRT1_2);
  near(evaluateRig2D(document,{clipId:"wave",time:10}).bones[0].matrix[0],0);
  near(evaluateRig2D(document).bones[0].matrix[0],1);
});
test("2D shortest angles and explicit full turns have different midpoint poses",() => {
  const document=parseRig2D(rig2());
  const track=document.clips[0].tracks[0];
  track.keys[1].transform.rotation=2*Math.PI;
  near(evaluateRig2D(document,{clipId:"wave",time:0.5}).bones[0].matrix[0],1);
  track.rotationMode="unwrapped";
  near(evaluateRig2D(document,{clipId:"wave",time:0.5}).bones[0].matrix[0],-1);
});
test("2D step sampling, loop boundary and unordered bones",() => {
  const document=parseRig2D(rig2());
  document.bones.reverse();
  document.clips[0].loop=true;
  document.clips[0].tracks[0].keys[0].interpolation="step";
  near(evaluateRig2D(document,{clipId:"wave",time:0.99}).bones[0].matrix[0],1);
  near(evaluateRig2D(document,{clipId:"wave",time:1}).bones[0].matrix[0],1);
});
test("2D preserves exact affine shear without decomposing it",() => {
  const document=parseRig2D(rig2());
  document.bones[0].bind.scale=[2,1];document.bones[1].bind.rotation=Math.PI/4;
  const m=evaluateRig2D(document).bones[1].matrix;
  near(m[0]*m[2]+m[1]*m[3],-1.5);
});
test("2D rejects cycles, missing references and duplicate IDs",() => {
  const cycle=rig2();cycle.bones[0].parentId="child" as unknown as null;invalid(cycle);
  const missing=rig2();missing.bones[1].parentId="absent";invalid(missing);
  const duplicate=rig2();duplicate.bones[1].id="root";invalid(duplicate);
  const layer=rig2();layer.layers[0].assetId="absent";invalid(layer);
});
test("2D rejects duplicate bindings, duplicate key times and non-finite transforms",() => {
  const attachment=rig2();attachment.attachments.push(attachment.attachments[0]);invalid(attachment);
  const times=rig2();times.clips[0].tracks[0].keys[1].time=0;invalid(times);
  const nan=rig2();nan.bones[0].bind.rotation=NaN;invalid(nan);
});
test("2D forbids transient/active asset references and invalid dimensions",() => {
  for(const uri of ["blob:https://example.com/a","data:image/svg+xml,x","not a URL","https://user:password@example.com/a"]) {
    const doc=rig2();doc.assets[0].uri=uri;invalid(doc);
  }
  const document=rig2();document.assets[0].width=0;invalid(document);
});
test("2D unknown clip and unknown pose are rejected",() => {
  const document=parseRig2D(rig2());
  assert.throws(() => evaluateRig2D(document,{clipId:"missing"}),DesignError);
  assert.throws(() => evaluateRig2D(document,{pose:{missing:transform2()}}),DesignError);
});
test("2D matrices reject compound scales outside numeric bounds",() => {
  const document=parseRig2D(rig2());
  document.bones=[];
  for(let i=0;i<10;i++) document.bones.push({id:`b${i}`,parentId:i?`b${i-1}`:null,length:1,bind:{position:[0,0],rotation:0,scale:[100,100]}});
  document.layers=[];document.attachments=[];
  assert.throws(() => evaluateRig2D(document),DesignError);
});
test("3D rigid parent delta rotates bound geometry once",() => {
  const document=parseRig3D(rig3());
  const bind=evaluateRig3D(document),posed=evaluateRig3D(document,{root:transform3(0,0,0,Math.PI/2)});
  near(bind.parts[0].position[1],2);near(posed.parts[0].position[0],-2);near(posed.parts[0].position[1],0);
  assert.deepEqual(posed.parts[0].size,document.parts[0].size);
  assert.deepEqual(evaluateRig3D(document),bind);
});
test("3D expands repeats and mirrors before binding without mutating the source",() => {
  const document=parseRig3D(rig3());
  document.parts[0].repeat={count:2,step:[1,0,0]};document.parts[0].mirror="x";
  const snapshot=structuredClone(document),bind=evaluateRig3D(document),posed=evaluateRig3D(document,{root:transform3(0,0,0,Math.PI/2)});
  assert.equal(bind.parts.length,4);assert.equal(new Set(bind.parts.map((part)=>part.id)).size,4);
  for(let i=0;i<4;i++) {near(posed.parts[i].position[0],-bind.parts[i].position[1]);near(posed.parts[i].position[1],bind.parts[i].position[0]);}
  assert.deepEqual(document,snapshot);assert.equal(posed.mode,"rigid");
});
test("3D validates meshes, bindings, hierarchy and instance limits",() => {
  const bad=rig3();bad.bindings[0].partId="missing";invalid(bad);
  const cyclic=rig3();cyclic.bones[0].parentId="child" as unknown as null;invalid(cyclic);
  const mesh={...rig3(),parts:[{...rig3().parts[0],shape:"mesh",mesh:{position:[1,2,3]}}]};invalid(mesh);
  const oversized=parseRig3D(rig3());
  oversized.parts=Array.from({length:20},(_,i)=>({...oversized.parts[0],id:`p${i}`,repeat:{count:64,step:[1,0,0]},mirror:"xz"}));
  invalid(oversized);
});
test("3D mesh vertices stay local while pose transforms the part",() => {
  const document=parseRig3D({...rig3(),parts:[{...rig3().parts[0],shape:"mesh",mesh:{position:[0,0,0,0.1,0,0,0,0.1,0]}}]});
  const result=evaluateRig3D(document,{root:transform3(0,0,0,Math.PI/2)});
  assert.deepEqual(result.parts[0].mesh,document.parts[0].mesh);
  near(result.parts[0].position[0],-2);
});
test("House preserves footprint and has a real empty doorway",() => {
  const document=parseHouse(house()),result=buildHouse(document);
  assert.equal(result.floors[0].rooms.length,2);
  assert.deepEqual(document.floors[0].rooms,house().floors[0].rooms);
  // Centre of the entrance in world coordinates lies in no wall bounding box.
  const point=[1.5-12/2,1,0.1-9/2];
  assert.equal(result.parts.filter((part)=>part.role==="wall" && point.every((coordinate,axis)=>Math.abs(coordinate-part.position[axis])<part.size[axis]/2-EPSILON)).length,0);
  // A point next to the entrance is inside a wall.
  assert.ok(result.parts.some((part)=>part.role==="wall" && [0.5-6,1,0.1-4.5].every((coordinate,axis)=>Math.abs(coordinate-part.position[axis])<part.size[axis]/2)));
});
const EPSILON=1e-7;
test("House adjacent rooms share one wall, not duplicate coincident geometry",() => {
  const result=buildHouse(parseHouse(house()));
  const partition=result.parts.filter((part)=>part.role==="wall" && part.position[0]===0 && part.size[0]===0.2);
  assert.equal(partition.length,1);near(partition[0].size[2],9);
});
test("House rejects overlapping rooms and dangling/out-of-wall openings",() => {
  const overlap=house();overlap.floors[0].rooms[1].x=5;invalid(overlap);
  const outside=house();outside.floors[0].rooms[0].width=13;invalid(outside);
  const missing=house();missing.floors[0].openings[0].roomId="absent";invalid(missing);
  const door=house();door.floors[0].openings[0].offset=5.9;invalid(door);
  const holes=house();holes.floors[0].openings.push({...holes.floors[0].openings[0],id:"another"});invalid(holes);
});

test("House decimal coordinates do not duplicate a shared wall",() => {
  const input=house();input.floors[0].rooms[0].width=3.3;
  input.floors[0].rooms[1].x=1.1+2.2;input.floors[0].rooms[1].width=12-3.3;
  const result=buildHouse(parseHouse(input));
  const partition=result.parts.filter((part)=>part.role==="wall" && Math.abs(part.position[0]-(3.3-6))<1e-7 && part.size[0]===0.2);
  assert.equal(partition.length,1);
});
test("House gable roof and multiple floors remain conceptual with explicit limitations",() => {
  const document=parseHouse(house());document.roof="gable";
  document.floors.push({...structuredClone(document.floors[0]),id:"upper"});
  const result=buildHouse(document);
  assert.equal(result.parts.at(-1)?.shape,"prism");near(result.floors[1].elevation,3.2);
  assert.ok(result.warnings.some((warning)=>warning.includes("лестницы отсутствуют")));
  assert.ok(result.parts.every((part)=>part.size.every((n)=>n>0 && Number.isFinite(n))));
});
test("All design kinds have a canonical JSON round trip and deterministic evaluation",() => {
  for(const input of [rig2(),rig3(),house()]) {
    const doc=parseDesignDocument(input),restored=parseDesignDocument(JSON.parse(JSON.stringify(doc)));
    assert.deepEqual(restored,doc);assert.deepEqual(evaluateDesign(restored),evaluateDesign(doc));
  }
});
test("Unsupported kind/version never silently downgrades",() => {
  invalid({...rig2(),schemaVersion:2});invalid({...rig2(),kind:"spine"});invalid(null);invalid([]);
});

test("HTTP body parser accepts split UTF-8 and rejects malformed JSON/root arrays", async () => {
  const bytes=new TextEncoder().encode(JSON.stringify({name:"Рука"}));
  const stream=new ReadableStream<Uint8Array>({start(controller) {
    for(const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  }});
  const request=new Request("https://example.invalid",{method:"POST",body:stream,duplex:"half"} as RequestInit);
  assert.deepEqual(await readDesignBody(request),{name:"Рука"});
  for(const raw of ["{", "[]", "null"]) await assert.rejects(readDesignBody(new Request("https://example.invalid",{method:"POST",body:raw})),DesignError);
  await assert.rejects(readDesignBody(new Request("https://example.invalid",{method:"POST",body:Uint8Array.of(0xff)})),DesignError);
});
test("HTTP body limit applies to streamed bodies and declared length", async () => {
  const stream=new ReadableStream<Uint8Array>({start(controller) {
    controller.enqueue(new Uint8Array(MAX_DESIGN_BODY_BYTES));
    controller.enqueue(Uint8Array.of(1));controller.close();
  }});
  const request=new Request("https://example.invalid",{method:"POST",body:stream,duplex:"half"} as RequestInit);
  await assert.rejects(readDesignBody(request),(error:unknown) => error instanceof DesignError && error.status===413);
  const declared=new Request("https://example.invalid",{method:"POST",body:"{}",headers:{"content-length":String(MAX_DESIGN_BODY_BYTES+1)}});
  await assert.rejects(readDesignBody(declared),(error:unknown) => error instanceof DesignError && error.status===413);
});

test("Persistence scopes reads/writes to the owner and rejects stale revisions", async (t) => {
  const db={designDocument:{findMany:async()=>[],findFirst:async()=>null,updateMany:async()=>({count:0}),deleteMany:async()=>({count:0})},$transaction:async()=>undefined};
  const {listDesignDocuments,readDesignDocument,replaceDesignDocument,deleteDesignDocument}=createDesignStore(db as unknown as Parameters<typeof createDesignStore>[0]);
  const calls: Record<string,unknown>[]=[];
  let exists=false;
  t.mock.method(db.designDocument,"findMany",async (query: Record<string,unknown>) => {calls.push(query);return [];});
  t.mock.method(db.designDocument,"findFirst",async (query: Record<string,unknown>) => {
    calls.push(query);return exists ? {kind:"rig2d",id:"saved"} : null;
  });
  t.mock.method(db.designDocument,"updateMany",async (query: Record<string,unknown>) => {calls.push(query);return {count:0};});
  t.mock.method(db.designDocument,"deleteMany",async (query: Record<string,unknown>) => {calls.push(query);return {count:0};});
  t.mock.method(db,"$transaction",async (callback: (client:typeof db)=>Promise<unknown>) => callback(db));
  const status=(expected:number)=>(error:unknown)=>error instanceof DesignError && error.status===expected;
  try {
    await listDesignDocuments("owner","rig2d",20,0);
    await assert.rejects(readDesignDocument("other","saved"),status(404));
    await assert.rejects(replaceDesignDocument("other","saved",1,"Name",parseRig2D(rig2())),status(404));
    await assert.rejects(deleteDesignDocument("other","saved",1),status(404));
    exists=true;
    await assert.rejects(replaceDesignDocument("owner","saved",1,"Name",parseRig2D(rig2())),status(409));
    await assert.rejects(deleteDesignDocument("owner","saved",1),status(409));
    await assert.rejects(replaceDesignDocument("owner","saved",1,"Name",parseHouse(house())),status(400));
    for(const query of calls) assert.ok((query.where as Record<string,unknown>).userId,"every operation must filter by owner");
    const write=calls.find((query)=>"data" in query)!;
    assert.deepEqual(write.where,{id:"saved",userId:"owner",revision:1});
    assert.equal((write.data as {revision:{increment:number}}).revision.increment,1);
  } finally {t.mock.restoreAll();}
});
test("Persistence creates only after locking the user and enforcing storage cap", async (t) => {
  const db={designDocument:{count:async()=>0,create:async()=>({})},$transaction:async()=>undefined,$queryRaw:async()=>[]};
  const {createDesignDocument}=createDesignStore(db as unknown as Parameters<typeof createDesignStore>[0]);
  const sequence:string[]=[];
  let count=100;
  t.mock.method(db,"$transaction",async (callback:(client:typeof db)=>Promise<unknown>)=>callback(db));
  t.mock.method(db,"$queryRaw",async (sql:TemplateStringsArray,userId:string)=>{
    assert.ok(sql.join("?").includes('FOR UPDATE'));assert.equal(userId,"owner");sequence.push("lock");return [{id:userId}];
  });
  t.mock.method(db.designDocument,"count",async ()=>{sequence.push("count");return count;});
  t.mock.method(db.designDocument,"create",async (query:{data:{userId:string;data:unknown}})=>{
    sequence.push("create");assert.equal(query.data.userId,"owner");assert.deepEqual(query.data.data,parseRig2D(rig2()));return {id:"saved",revision:1};
  });
  try {
    await assert.rejects(createDesignDocument("owner","Name",parseRig2D(rig2())),(error:unknown)=>error instanceof DesignError && error.status===403);
    assert.deepEqual(sequence,["lock","count"]);sequence.length=0;count=99;
    await createDesignDocument("owner","Name",parseRig2D(rig2()));assert.deepEqual(sequence,["lock","count","create"]);
  } finally {t.mock.restoreAll();}
});

test("Editor persists 2D/3D poses while clip sampling keeps its own transforms",()=>{
  const two=blank2D();two.pose={body:{position:[25,30],rotation:0,scale:[1,1]}};
  const loaded=parseRigDocument(JSON.parse(JSON.stringify(two)));
  assert.equal(loaded.kind,"rig2d");near(evaluateRig2D(loaded as typeof two).bones[0].head[0],25);
  const three=demo3D();three.pose={arm:{position:[0.6,1,0],rotation:[0,0,Math.PI/2]}};
  const round=parseRigDocument(JSON.parse(JSON.stringify(three)));
  assert.equal(round.kind,"rig3d");const posed=posedConcept(round as typeof three);
  near(posed.parts.find((part)=>part.name==="Рука")!.position[0],1);
  assert.deepEqual(three.parts,demo3D().parts);
});
test("Editor rejects cyclic reparenting and removes bone references atomically",()=>{
  const three=demo3D();three.pose={arm:{position:[0.6,1,0],rotation:[0,0,1]}};
  assert.throws(()=>removeBone(three,"body"),/дочерние/);
  const result=removeBone(three,"arm");assert.equal(result.kind,"rig3d");
  if(result.kind==="rig3d"){assert.ok(!result.pose?.arm);assert.ok(!result.bindings.some((b)=>b.boneId==="arm"));}
  assert.deepEqual(three.bones,demo3D().bones,"source is preserved");
  const cycle=demo3D();cycle.bones[0].parentId="arm";assert.throws(()=>parseRigDocument(cycle),DesignError);
  const two=blank2D(),removed=removeBone(two,"arm_right");
  if(removed.kind==="rig2d")assert.ok(removed.clips.every((c)=>!c.tracks.some((t)=>t.boneId==="arm_right")));
});
test("Inline raster assets round trip and reject active payloads, MIME mismatch and excess size",()=>{
  const input=rig2();input.assets[0].uri="data:image/png;base64,"+btoa("\x89PNG\r\n\x1a\n"+"raster");
  assert.equal(parseRig2D(input).assets[0].uri,input.assets[0].uri);
  input.assets[0].uri="data:image/svg+xml;base64,"+btoa("<svg onload='alert(1)'/>");invalid(input);
  input.assets[0].uri="data:image/webp;base64,"+btoa("RIFFxxxxWEBP");invalid(input);
  input.assets[0].uri="data:image/png;base64,"+btoa("\x89PNG\r\n\x1a\n"+"x".repeat(262144));invalid(input);
});
test("Design Engine explicit 2D rig requests do not produce 3D primitives",()=>{
  for(const prompt of ["сделай девушку 2д ригинг","2D rigging character","создай 2 d персонажа","двумерный персонаж со скелетом","создай Live2D модель девушки","сделай vtuber персонажа","сделай витубера"])assert.equal(is2DRiggingRequest(prompt),true,prompt);
  for(const prompt of ["девушка 3D модель","дом 12 на 9 метров","2d план дома","room2designer","robot 3d rigging"])assert.equal(is2DRiggingRequest(prompt),false,prompt);
});
test("Existing scene import materializes safe IDs and retains mesh/repeat/mirror",()=>{
  const source=demo3D();source.parts[0].repeat={count:2,step:[1,0,0]};source.parts[0].mirror="x";
  const result=rigFromConcept({parts:source.parts,units:"cm"});assert.equal(result.units,"cm");
  assert.equal(result.parts[0].id,"part_1");assert.deepEqual(result.parts[0].repeat,source.parts[0].repeat);
  assert.equal(evaluateRig3D(result).parts.length,6);assert.throws(()=>rigFromConcept({}),/деталей/);
});

test("Deleting and rebinding a 2D bone preserves each visible layer corner",()=>{
  const doc=parseRig2D(rig2()),pose={root:{position:[25,40] as [number,number],rotation:Math.PI/3,scale:[1,1] as [number,number]}};
  const before=evaluateRig2D(doc,{pose}).layers[0].matrix;
  const detached=bindLayer(doc,"handLayer",null,pose);
  const rebound=bindLayer(detached,"handLayer","root",pose);
  for(const candidate of [detached,rebound,removeBone(doc,"child",pose)]) {
    assert.equal(candidate.kind,"rig2d");const after=evaluateRig2D(candidate as typeof doc,{pose}).layers[0].matrix;
    before.forEach((value,index)=>near(after[index],value));
  }
  assert.equal(doc.attachments.length,1);
});
test("Sheared rebind fails without changing the source document",()=>{
  const doc=parseRig2D(rig2());doc.bones[0].bind.scale=[2,1];doc.bones[1].bind.rotation=Math.PI/4;
  const before=JSON.stringify(doc);assert.throws(()=>bindLayer(doc,"handLayer",null),/неравномерного/);assert.equal(JSON.stringify(doc),before);
});
test("Drawing a bone uses world canvas endpoints under a rotated parent",()=>{
  const doc=blank2D(),result=addBone2D(doc,"drawn","body",[50,60],[110,120]);
  const bone=evaluateRig2D(result,{pose:{}}).bones.find((b)=>b.id==="drawn")!;
  near(bone.head[0],50);near(bone.head[1],60);near(bone.tail[0],110);near(bone.tail[1],120);
  assert.throws(()=>addBone2D(doc,"short","body",[0,0],[1,1]),/не меньше/);
});
test("3D detaching and deleting a posed bone retains every instance matrix",()=>{
  const doc=demo3D();doc.parts[2].repeat={count:2,step:[0,0,1]};doc.parts[2].mirror="x";
  doc.pose={arm:{position:[0.6,1,0],rotation:[0,0,Math.PI/2]}};
  const before=evaluateRig3D(doc).parts.filter((p)=>p.sourcePartId==="arm_part").map((p)=>p.matrix);
  for(const candidate of [bindPart(doc,"arm_part",null),bindPart(doc,"arm_part","body"),removeBone(doc,"arm")]){
    assert.equal(candidate.kind,"rig3d");const after=evaluateRig3D(candidate as typeof doc).parts.filter((p)=>p.name==="Рука").map((p)=>p.matrix);
    assert.equal(after.length,before.length);before.forEach((m,index)=>m.forEach((n,i)=>near(after[index][i],n)));
  }
});

test("Image provider never reuses a third-party text API key",()=>{
  assert.equal(imageConfiguration({OPENAI_API_KEY:"text-test",OPENAI_BASE_URL:"https://example.org/v1"}).apiKey,undefined);
  assert.equal(imageConfiguration({OPENAI_API_KEY:"official-test"}).apiKey,"official-test");
  assert.equal(imageConfiguration({OPENAI_IMAGE_API_KEY:"image-test",OPENAI_API_KEY:"text-test",OPENAI_BASE_URL:"https://example.org/v1"}).apiKey,"image-test");
  assert.throws(()=>imageConfiguration({OPENAI_IMAGE_MODEL:"unsupported-model"}));
});

test("Character concept request asks for one transparent image, never a completed rig",()=>{
  const request=imageRequest("персонаж в синей одежде","gpt-image-2.5-flare");
  assert.equal(request.n,1);assert.equal(request.background,"transparent");
  assert.equal(request.output_format,"webp");assert.equal(request.size,"1024x1536");
  assert.match(request.prompt,/персонаж в синей одежде/);
  assert.match(request.prompt,/not an already rigged model/);
});

test("Invalid prompts, missing provider and exhausted quota do not invoke paid generation",async()=>{
  let reserved=0,generated=0,refunded=0;
  const deps={configured:true,reserve:async()=>{reserved++;return {ok:true as const};},refund:async()=>{refunded++;},generate:async()=>{generated++;return {mime:"image/webp",base64:undefined};}};
  await assert.rejects(createCharacterConcept("short",deps));
  await assert.rejects(createCharacterConcept("девушка в синем платье",{...deps,configured:false}));
  assert.equal(reserved,0);
  await assert.rejects(createCharacterConcept("девушка в синем платье",{...deps,reserve:async()=>({ok:false as const,error:"Лимит",code:"AI_LIMIT_REACHED"})}));
  assert.equal(generated,0);assert.equal(refunded,0);
});

test("Image success keeps quota; invalid image/provider failure refunds exactly once",async()=>{
  const webp=Buffer.concat([Buffer.from("RIFF"),Buffer.alloc(4),Buffer.from("WEBPVP8X"),Buffer.alloc(16)]).toString("base64");
  let reserved=0,refunded=0;
  const deps={configured:true,reserve:async()=>{reserved++;return {ok:true as const};},refund:async()=>{refunded++;},generate:async()=>({mime:"image/webp",base64:webp})};
  const result=await createCharacterConcept("девушка в синем платье",deps);
  assert.equal(result.rigReady,false);assert.equal(result.stage,"concept");assert.equal(refunded,0);
  for(const bad of [undefined,"<svg>not image</svg>",Buffer.alloc(MAX_IMAGE_BYTES+1).toString("base64")]){
    await assert.rejects(createCharacterConcept("девушка в синем платье",{...deps,generate:async()=>({mime:"image/webp",base64:bad})}));
  }
  await assert.rejects(createCharacterConcept("девушка в синем платье",{...deps,generate:async()=>{throw new Error("PRIVATE_PROVIDER_DETAILS");}}),error=>error instanceof Error&&!error.message.includes("PRIVATE_PROVIDER_DETAILS"));
  assert.equal(reserved,5);assert.equal(refunded,4);
});

test("Cancelling character generation releases a reserved quota without returning artwork",async()=>{
  const controller=new AbortController();let reserved=0,refunded=0;
  const deps={configured:true,reserve:async()=>{reserved++;return {ok:true as const};},refund:async()=>{refunded++;},generate:async()=>{controller.abort();throw new Error("abort");}};
  await assert.rejects(createCharacterConcept("девушка в синем платье",deps,controller.signal));
  assert.equal(reserved,1);assert.equal(refunded,1);
  await assert.rejects(createCharacterConcept("девушка в синем платье",deps,controller.signal));
  assert.equal(reserved,1);assert.equal(refunded,1);
});
const cloudflareEnv={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_API_TOKEN:"synthetic-test-token"};
function cloudflareConfig(){
  const config=characterImageConfiguration(cloudflareEnv);
  assert.equal(config.provider,"cloudflare");
  if(config.provider!=="cloudflare")throw new Error("Unexpected test provider");
  return config;
}
// These bytes exercise MIME/signature checks, not a real decoded artwork.
const jpegHeaderFixture=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(16),Buffer.from([0xff,0xd9])]).toString("base64");

test("Cloudflare is explicit and never falls back to an available paid OpenAI key",()=>{
  const config=characterImageConfiguration({OPENAI_IMAGE_API_KEY:"openai-test"});
  assert.equal(config.provider,"cloudflare");
  assert.equal(characterImageStatus(config).configured,false);
  assert.equal(config.apiKey,undefined);
  assert.equal(characterImageStatus(characterImageConfiguration({CLOUDFLARE_API_TOKEN:"test"})).configured,false);
  const status=characterImageStatus(cloudflareConfig());
  assert.equal(status.configured,true);assert.equal(status.imageMime,"image/jpeg");
  assert(!JSON.stringify(status).includes(cloudflareEnv.CLOUDFLARE_API_TOKEN));
  assert(!JSON.stringify(status).includes(cloudflareEnv.CLOUDFLARE_ACCOUNT_ID));
  assert.throws(()=>characterImageConfiguration({CHARACTER_IMAGE_PROVIDER:"unsupported"}));
  assert.throws(()=>characterImageConfiguration({...cloudflareEnv,CLOUDFLARE_ACCOUNT_ID:"../../other-account"}));
  const openai=characterImageConfiguration({...cloudflareEnv,CHARACTER_IMAGE_PROVIDER:"openai",OPENAI_IMAGE_API_KEY:"openai-test"});
  assert.equal(openai.provider,"openai");assert.equal(openai.apiKey,"openai-test");
  assert.equal(characterImageStatus(openai).imageMime,"image/webp");
});

test("Cloudflare uses the official account endpoint once and keeps maximum prompt within model limits",async()=>{
  let calls=0;
  const prompt="я".repeat(1500);
  const transport:typeof fetch=async(url,init)=>{
    calls++;
    assert.equal(String(url),`https://api.cloudflare.com/client/v4/accounts/${cloudflareEnv.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`);
    assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer synthetic-test-token");
    assert.equal(init?.redirect,"error");assert.equal(init?.method,"POST");
    const body=JSON.parse(String(init?.body));
    assert(body.prompt.length<=2048);assert(body.prompt.endsWith(prompt));assert.equal(body.steps,4);
    assert(!("background" in body));assert(!("output_format" in body));
    return Response.json({success:true,result:{image:jpegHeaderFixture}});
  };
  let refunds=0;
  const result=await createCharacterConcept(prompt,{configured:true,reserve:async()=>({ok:true}),refund:async()=>{refunds++;},generate:cloudflareImageGenerator(cloudflareConfig(),transport)});
  assert.equal(result.image.mime,"image/jpeg");assert.equal(result.rigReady,false);
  assert.equal(calls,1);assert.equal(refunds,0);
  assert.equal(cloudflareImageRequest(prompt).prompt.length<=2048,true);
});

test("Image MIME, signature and download extension agree for both providers",()=>{
  assert.equal(validateImagePayload(jpegHeaderFixture,"image/jpeg"),jpegHeaderFixture);
  assert.throws(()=>validateImagePayload(jpegHeaderFixture,"image/webp"));
  assert.throws(()=>validateImagePayload(jpegHeaderFixture,"image/svg+xml"));
  assert.throws(()=>validateImagePayload(Buffer.from([0xff,0xd8,0xff]).toString("base64"),"image/jpeg"));
  assert.equal(characterImageFormat("image/jpeg")?.extension,"jpg");
  assert.equal(characterImageFormat("image/webp")?.extension,"webp");
  assert.equal(characterImageFormat("text/html"),undefined);
});

test("Cloudflare HTTP failures release quota once without exposing provider details or retrying",async()=>{
  for(const [status,expectedCode] of [[401,"IMAGE_PROVIDER_AUTH_FAILED"],[403,"IMAGE_PROVIDER_AUTH_FAILED"],[429,"IMAGE_PROVIDER_LIMIT_REACHED"],[500,"IMAGE_GENERATION_FAILED"]] as const){
    let calls=0,refunds=0;
    const generate=cloudflareImageGenerator(cloudflareConfig(),async()=>{calls++;return Response.json({error:"PRIVATE_RESPONSE"},{status});});
    await assert.rejects(createCharacterConcept("original character",{configured:true,reserve:async()=>({ok:true}),refund:async()=>{refunds++;},generate}),error=>error instanceof DesignError&&error.code===expectedCode&&!error.message.includes("PRIVATE_RESPONSE"));
    assert.equal(calls,1);assert.equal(refunds,1);
  }
});

test("Cloudflare refuses error envelopes, HTML and mismatched image bytes",async()=>{
  const responses=[
    ()=>Response.json({success:false,result:{image:jpegHeaderFixture},errors:[{message:"PRIVATE_RESPONSE"}]}),
    ()=>new Response("<html>PRIVATE_RESPONSE</html>"),
    ()=>Response.json({success:true,result:{image:"bm90LWFuLWltYWdl"}}),
  ];
  for(const response of responses){
    let refunds=0;
    await assert.rejects(createCharacterConcept("original character",{configured:true,reserve:async()=>({ok:true}),refund:async()=>{refunds++;},generate:cloudflareImageGenerator(cloudflareConfig(),async()=>response())}),error=>error instanceof DesignError&&!error.message.includes("PRIVATE_RESPONSE"));
    assert.equal(refunds,1);
  }
});

test("Cloudflare enforces a streamed response cap even without Content-Length",async()=>{
  let cancelled=false,refunds=0;
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(MAX_IMAGE_RESPONSE_BYTES+1));},cancel(){cancelled=true;}});
  await assert.rejects(createCharacterConcept("original character",{configured:true,reserve:async()=>({ok:true}),refund:async()=>{refunds++;},generate:cloudflareImageGenerator(cloudflareConfig(),async()=>new Response(stream))}),error=>error instanceof DesignError&&error.code==="INVALID_IMAGE_RESPONSE");
  assert.equal(cancelled,true);assert.equal(refunds,1);
});

test("Cloudflare timeout and user cancellation abort transport and release quota",async()=>{
  for(const cancel of [false,true]){
    let refunds=0,aborted=false;
    const controller=new AbortController();
    const transport:typeof fetch=async(_url,init)=>new Promise((_resolve,reject)=>{
      const onAbort=()=>{aborted=true;reject(new Error("PRIVATE_ABORT"));};
      init?.signal?.addEventListener("abort",onAbort,{once:true});
      if(cancel)controller.abort();
    });
    await assert.rejects(createCharacterConcept("original character",{configured:true,reserve:async()=>({ok:true}),refund:async()=>{refunds++;},generate:cloudflareImageGenerator(cloudflareConfig(),transport,15)},controller.signal),error=>error instanceof DesignError&&error.code===(cancel?"IMAGE_GENERATION_CANCELLED":"IMAGE_GENERATION_TIMEOUT"));
    assert.equal(aborted,true);assert.equal(refunds,1);
  }
});
