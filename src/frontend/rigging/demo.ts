import { blank2D } from "@/shared/rigging/editor";
import type { Rig2DDocument } from "@/shared/rigging/rig2d";

/** Small original canvas drawings, packed into the document as transparent PNG layers. */
export function demo2D(): Rig2DDocument {
  const rig=blank2D();
  for(const bone of rig.bones) {
    const head=bone.id==="head",body=bone.id==="body";
    const canvas=document.createElement("canvas");canvas.width=head?90:bone.length;canvas.height=head?90:body?115:26;
    const ctx=canvas.getContext("2d")!;
    if(head) {
      ctx.fillStyle="#7053a3";ctx.beginPath();ctx.ellipse(45,45,42,44,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#f5cfae";ctx.beginPath();ctx.ellipse(45,47,29,32,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#493756";ctx.beginPath();ctx.arc(34,46,3,0,Math.PI*2);ctx.arc(56,46,3,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#bc788c";ctx.lineWidth=2;ctx.beginPath();ctx.arc(45,56,8,0,Math.PI);ctx.stroke();
      ctx.fillStyle="#7053a3";ctx.beginPath();ctx.ellipse(42,21,32,15,-0.2,0,Math.PI*2);ctx.fill();
    } else if(body) {
      ctx.fillStyle="#aa8bdf";ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(canvas.width,30);ctx.lineTo(canvas.width,85);ctx.lineTo(0,115);ctx.closePath();ctx.fill();
      ctx.fillStyle="#c4aff0";ctx.fillRect(105,28,20,59);
    } else {
      ctx.fillStyle=bone.id.startsWith("leg")?"#e2c8ef":"#f5cfae";
      ctx.beginPath();ctx.roundRect(0,0,canvas.width,26,13);ctx.fill();
      if(bone.id.startsWith("leg")){ctx.fillStyle="#7755a7";ctx.beginPath();ctx.roundRect(canvas.width-22,0,22,26,7);ctx.fill();}
    }
    rig.assets.push({id:bone.id,uri:canvas.toDataURL("image/png"),mime:"image/png",width:canvas.width,height:canvas.height});
    rig.layers.push({id:`layer_${bone.id}`,assetId:bone.id,zIndex:head?5:body?3:1,visible:true,
      pivot:head?[45,45]:[0,canvas.height/2],transform:{position:[0,0],rotation:0,scale:[1,1]}});
    rig.attachments.push({layerId:`layer_${bone.id}`,boneId:bone.id,offset:{position:[0,0],rotation:0,scale:[1,1]}});
  }
  return rig;
}
