/** Removes only near-white pixels connected to the image border, never enclosed white details. */
export function removeWhiteBorder(rgba:Uint8ClampedArray,width:number,height:number,tolerance:number,seeds:readonly (readonly [number,number])[]=[]):Uint8ClampedArray {
  if(width*height*4!==rgba.length||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>4194304||!Number.isFinite(tolerance)||tolerance<0||tolerance>80)throw new Error("Некорректная маска фона");
  const result=new Uint8ClampedArray(rgba),visited=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=0;
  function push(index:number){
    if(visited[index])return;visited[index]=1;
    const offset=index*4;
    if(rgba[offset+3]===0||Math.min(rgba[offset],rgba[offset+1],rgba[offset+2])>=255-tolerance)queue[tail++]=index;
  }
  for(let x=0;x<width;x++){push(x);push((height-1)*width+x);}
  for(let y=0;y<height;y++){push(y*width);push(y*width+width-1);}
  for(const [x,y] of seeds)if(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<width&&y>=0&&y<height)push(y*width+x);
  while(head<tail){
    const p=queue[head++],x=p%width,y=Math.floor(p/width);result[p*4+3]=0;
    if(x>0)push(p-1);if(x+1<width)push(p+1);if(y>0)push(p-width);if(y+1<height)push(p+width);
  }
  return result;
}
