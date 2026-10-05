"use client";
import {useEffect,useRef,useState} from "react";
import {drawCanvasSkin,drawSkin,releaseSkinRenderer} from "./skin-renderer";
import type {TexturedMesh} from "./mesh-texture-renderer";

const mesh:TexturedMesh={vertices:[],uv:[],triangles:[]};
for(let y=0;y<=8;y++)for(let x=0;x<=8;x++){mesh.vertices.push([x*16,y*16]);mesh.uv.push([x*16,y*16]);}
for(let y=0;y<8;y++)for(let x=0;x<8;x++){const a=y*9+x;mesh.triangles.push([a,a+1,a+10],[a,a+10,a+9]);}
const imageFrom=(canvas:HTMLCanvasElement)=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=canvas.toDataURL();});

/** Development-only pixel regression: alpha seams, UV orientation, and Canvas transforms. */
export default function RendererCheck(){
  const oldCanvas=useRef<HTMLCanvasElement>(null),newCanvas=useRef<HTMLCanvasElement>(null);
  const [results,setResults]=useState<string[]>([]);
  useEffect(()=>{
    let active=true;
    const run=async()=>{
      const source=document.createElement("canvas");source.width=source.height=128;const texture=source.getContext("2d")!;
      const rows:string[]=[];
      for(const alpha of [1,.5]){
        texture.clearRect(0,0,128,128);texture.fillStyle=`rgba(255,255,255,${alpha})`;texture.fillRect(0,0,128,128);
        const img=await imageFrom(source);if(!active)return;
        for(const scale of [.65,1,1.45]){
          const countErrors=(canvas:HTMLCanvasElement,gpu:boolean)=>{
            const ctx=canvas.getContext("2d")!;ctx.resetTransform();ctx.fillStyle="black";ctx.fillRect(0,0,256,256);
            ctx.translate(128.3,127.7);ctx.rotate(.17);ctx.scale(scale,-scale);ctx.translate(-64,-64);
            if(gpu)drawSkin(ctx,img,128,128,mesh,scale);else drawCanvasSkin(ctx,img,128,128,mesh,scale);
            const pixels=ctx.getImageData(0,0,256,256).data,inverse=ctx.getTransform().inverse();let errors=0,total=0;
            for(let y=0;y<256;y++)for(let x=0;x<256;x++){
              const p=new DOMPoint(x+.5,y+.5).matrixTransform(inverse);
              if(p.x<4||p.x>124||p.y<4||p.y>124)continue;
              total++;if(Math.abs(pixels[(y*256+x)*4]-Math.round(alpha*255))>2)errors++;
            }
            return {errors,total,renderer:canvas.dataset.meshRenderer};
          };
          const before=countErrors(oldCanvas.current!,false),after=countErrors(newCanvas.current!,true);
          rows.push(`${after.errors===0&&after.renderer==='webgl'?'PASS':'FAIL'} alpha=${alpha}, масштаб=${scale}: ошибок ${after.errors}/${after.total}; прежний Canvas ${before.errors}`);
        }
      }
      texture.fillStyle="red";texture.fillRect(0,0,128,64);texture.fillStyle="blue";texture.fillRect(0,64,128,64);
      const img=await imageFrom(source);if(!active)return;
      const canvas=document.createElement("canvas");canvas.width=canvas.height=128;const ctx=canvas.getContext("2d")!;ctx.translate(0,128);ctx.scale(1,-1);
      drawSkin(ctx,img,128,128,mesh,1);const top=ctx.getImageData(64,16,1,1).data,bottom=ctx.getImageData(64,112,1,1).data;
      rows.push(`${top[0]>250&&top[2]<3&&bottom[2]>250&&bottom[0]<3?'PASS':'FAIL'} ориентация UV: верх красный, низ синий`);
      releaseSkinRenderer(canvas);setResults(rows);
    };
    run().catch(error=>{if(active)setResults([`FAIL ${String(error)}`]);});
    const canvases=[oldCanvas.current,newCanvas.current];
    return()=>{active=false;for(const canvas of canvases)if(canvas)releaseSkinRenderer(canvas);};
  },[]);
  return <main className="p-8"><h1>Проверка швов сетки</h1><p>Равномерная текстура, 128 треугольников, поворот и разные масштабы. Проверяются все внутренние пиксели.</p><div className="flex gap-6"><figure><figcaption>Прежний Canvas</figcaption><canvas ref={oldCanvas} width={256} height={256}/></figure><figure><figcaption>Текущая отрисовка</figcaption><canvas ref={newCanvas} width={256} height={256}/></figure></div><ul aria-label="Результаты проверки">{results.map(row=><li key={row}>{row}</li>)}</ul></main>;
}
