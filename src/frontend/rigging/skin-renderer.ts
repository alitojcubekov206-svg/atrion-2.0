import { inverseMatrix2D, multiply2D } from "@/shared/rigging/rig2d";

type Point=[number,number];
type Mesh={uv:Point[];vertices:Point[];triangles:[number,number,number][]};

/** Affine texture mapping per triangle; shared vertex positions keep joints continuous. */
export function drawSkin(ctx:CanvasRenderingContext2D,image:HTMLImageElement,width:number,height:number,mesh:Mesh,zoom:number){
  for(const indices of mesh.triangles){
    const [a,b,c]=indices.map((i)=>mesh.vertices[i]),[u,v,w]=indices.map((i):Point=>[mesh.uv[i][0],height-mesh.uv[i][1]]);
    if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-5)continue;
    const transform=multiply2D([b[0]-a[0],b[1]-a[1],c[0]-a[0],c[1]-a[1],...a],inverseMatrix2D([v[0]-u[0],v[1]-u[1],w[0]-u[0],w[1]-u[1],...u]));
    ctx.save();ctx.beginPath();
    // Subpixel overlap hides Canvas clipping seams. UVs and the actual geometry stay unchanged.
    const center:Point=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3];
    for(const [index,p] of [a,b,c].entries()){
      const dx=p[0]-center[0],dy=p[1]-center[1],length=Math.hypot(dx,dy),expand=.45/zoom;
      const x=p[0]+dx/length*expand,y=p[1]+dy/length*expand;if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();ctx.clip();ctx.transform(...transform);ctx.drawImage(image,0,0,width,height);ctx.restore();
  }
}
