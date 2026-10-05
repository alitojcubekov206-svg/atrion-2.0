"use client";
import { useEffect, useRef, useState } from "react";
import { evaluateRig2D, type Rig2DDocument, type Transform2D } from "@/shared/rigging/rig2d";

export default function RigCanvas({document,pose,time,clipId,selected,onSelect,showBones,addingBone,onDrawBone}: {
  document:Rig2DDocument;pose:Record<string,Transform2D>;time:number;clipId?:string;selected:string;
  onSelect:(id:string)=>void;showBones:boolean;
  addingBone:boolean;onDrawBone:(head:[number,number],tail:[number,number])=>void;
}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [images,setImages]=useState<Map<string,HTMLImageElement>>(new Map());
  const [missing,setMissing]=useState<string[]>([]);
  const [start,setStart]=useState<[number,number]|null>(null),[cursor,setCursor]=useState<[number,number]|null>(null);
  const [view,setView]=useState({x:0,y:0,zoom:1});
  useEffect(()=>{setStart(null);setCursor(null);},[addingBone]);
  const assetsKey=document.assets.map((asset)=>`${asset.id}:${asset.uri}`).join("\n");
  useEffect(()=>{
    let active=true;const loaded=new Map<string,HTMLImageElement>(),failed:string[]=[];
    Promise.all(document.assets.map((asset)=>new Promise<void>((resolve)=>{
      const img=new Image();img.onload=()=>{loaded.set(asset.id,img);resolve();};img.onerror=()=>{failed.push(asset.id);resolve();};img.src=asset.uri;
    }))).then(()=>{if(active){setImages(loaded);setMissing(failed);}});
    return()=>{active=false;};
    // The image sources, rather than new document array identities, control loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[assetsKey]);
  let evaluationError="";
  let result:ReturnType<typeof evaluateRig2D>={units:"px",coordinates:"x-right-y-up",bones:[],layers:[]};
  try {result=evaluateRig2D(document,{clipId,time,pose});} catch(e){evaluationError=(e as Error).message;}
  useEffect(()=>{
    const ctx=canvas.current?.getContext("2d");if(!ctx)return;
    const w=document.canvas.width,h=document.canvas.height,ratio=Math.min(1,1024/Math.max(w,h));ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.save();ctx.scale(ratio,ratio);ctx.translate(w/2,h/2);ctx.scale(view.zoom,-view.zoom);ctx.translate(-view.x,-view.y);
    ctx.strokeStyle="#363347";ctx.lineWidth=1/view.zoom;
    const left=view.x-w/2/view.zoom,right=view.x+w/2/view.zoom,bottom=view.y-h/2/view.zoom,top=view.y+h/2/view.zoom;
    const spacing=40*Math.max(1,Math.pow(2,Math.ceil(Math.log2(1/view.zoom))));
    for(let x=Math.floor(left/spacing)*spacing;x<right;x+=spacing){ctx.beginPath();ctx.moveTo(x,bottom);ctx.lineTo(x,top);ctx.stroke();}
    for(let y=Math.floor(bottom/spacing)*spacing;y<top;y+=spacing){ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
    for(const layer of result.layers) {
      if(!layer.visible)continue;const img=images.get(layer.assetId);if(!img)continue;
      const asset=document.assets.find((item)=>item.id===layer.assetId)!;
      ctx.save();ctx.transform(...layer.matrix);ctx.scale(1,-1);ctx.drawImage(img,0,-asset.height,asset.width,asset.height);ctx.restore();
    }
    if(showBones) for(const bone of result.bones) {
      ctx.strokeStyle=bone.id===selected?"#f7cf72":"#9ff2dd";ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=(bone.id===selected?4:2)/view.zoom;
      ctx.beginPath();ctx.moveTo(bone.head[0],bone.head[1]);ctx.lineTo(bone.tail[0],bone.tail[1]);ctx.stroke();
      ctx.beginPath();ctx.arc(bone.head[0],bone.head[1],5/view.zoom,0,Math.PI*2);ctx.fill();
    }
    if(start&&addingBone){ctx.strokeStyle="#f7cf72";ctx.fillStyle="#f7cf72";ctx.lineWidth=3/view.zoom;ctx.beginPath();ctx.arc(start[0],start[1],6/view.zoom,0,Math.PI*2);ctx.fill();if(cursor){ctx.beginPath();ctx.moveTo(...start);ctx.lineTo(...cursor);ctx.stroke();}}
    ctx.restore();
  },[document,images,pose,time,clipId,selected,showBones,result,view,start,cursor,addingBone]);
  const point=(event:React.PointerEvent<HTMLCanvasElement>):[number,number]=>{
    const rect=event.currentTarget.getBoundingClientRect();return [(event.clientX-rect.left)/rect.width*document.canvas.width/view.zoom-document.canvas.width/2/view.zoom+view.x,
      document.canvas.height/2/view.zoom-(event.clientY-rect.top)/rect.height*document.canvas.height/view.zoom+view.y];
  };
  function fit(){
    const points=result.bones.flatMap((bone)=>[bone.head,bone.tail]);
    for(const layer of result.layers){const asset=document.assets.find((a)=>a.id===layer.assetId);if(!asset)continue;const m=layer.matrix;
      for(const [x,y] of [[0,0],[asset.width,0],[0,asset.height],[asset.width,asset.height]])points.push([m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
    }
    if(!points.length)return;
    const xs=points.map((p)=>p[0]),ys=points.map((p)=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    setView({x:(minX+maxX)/2,y:(minY+maxY)/2,zoom:Math.min(4,document.canvas.width/(maxX-minX+100),document.canvas.height/(maxY-minY+100))});
  }
  return <div className="flex min-h-[400px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#211f2c] p-4">
    <div className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 text-xs"><span className="text-white/55">{addingBone?(start?"Нажмите в точке конца кости":"Нажмите в точке начала кости"):"Выберите сустав на холсте или в дереве"}</span><button className="rounded-lg border border-white/20 px-3 py-2 hover:bg-white/10" onClick={fit}>Вместить риг</button></div>
    <canvas ref={canvas} width={Math.round(document.canvas.width*Math.min(1,1024/Math.max(document.canvas.width,document.canvas.height)))} height={Math.round(document.canvas.height*Math.min(1,1024/Math.max(document.canvas.width,document.canvas.height)))} aria-label="2D-персонаж и скелет" className="h-auto w-full max-w-[640px] touch-none" onPointerDown={(event)=>{
      const [x,y]=point(event);
      if(addingBone){if(!start)setStart([x,y]);else {onDrawBone(start,[x,y]);setStart(null);}return;}
      const closest=result.bones.map((bone)=>({id:bone.id,d:Math.hypot(x-bone.head[0],y-bone.head[1])})).sort((a,b)=>a.d-b.d)[0];
      if(closest&&closest.d<30/view.zoom)onSelect(closest.id);
    }} onPointerMove={(event)=>{if(addingBone&&start)setCursor(point(event));}}/>
    {evaluationError&&<p className="text-sm text-rose-300" role="alert">Поза не отображается: {evaluationError}. Измените значения или отмените действие.</p>}
    {missing.length>0&&<p className="text-sm text-amber-300" role="status">Не загрузились слои: {missing.join(", ")}. Исходные ссылки сохранены.</p>}
  </div>;
}
