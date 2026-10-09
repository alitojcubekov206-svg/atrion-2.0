import {parseHouse, type HouseDocument} from "../../shared/house/document";
import {check,record,number,text,list,choice} from "./validation";
import {footprintRects,exteriorRoomSides} from "../../shared/house/footprint";

/** Compile a recursively partitioned layout: coverage and non-overlap follow from construction. */
export function compileHouseLayout(input:unknown):HouseDocument{
  const plan=record(input,"plan"),width=number(plan.width,"width",3,100),depth=number(plan.depth,"depth",3,100);
  const floors=list(plan.floors,"floors",3,1).map((value,index)=>{
    const rooms:HouseDocument["floors"][number]["rooms"]=[];
    function split(value:unknown,x:number,z:number,w:number,d:number,level=0){
      check(level<=6,"План содержит слишком глубокое деление");
      const node=record(value,"layout");
      if(node.name!==undefined){
        check(w>=1&&d>=1,"После деления комната меньше одного метра");
        rooms.push({id:`room_${rooms.length+1}`,name:text(node.name,"room.name"),x,z,width:w,depth:d});return;
      }
      const axis=choice(node.axis,["x","z"] as const,"axis"),ratio=number(node.ratio,"ratio",.05,.95);
      const cut=(axis==="x"?w:d)*ratio;
      split(node.first,x,z,axis==="x"?cut:w,axis==="z"?cut:d,level+1);
      split(node.second,axis==="x"?x+cut:x,axis==="z"?z+cut:z,axis==="x"?w-cut:w,axis==="z"?d-cut:d,level+1);
    }
    const floor=record(value,"floor");
    // A flat room program is easier for text models to preserve than a deeply
    // nested tree. Balanced area partitioning derives the tree without templates.
    function partition(items:{name:string;share:number}[],w:number,d:number):unknown{
      if(items.length===1)return {name:items[0].name};
      const total=items.reduce((sum,item)=>sum+item.share,0);let sum=0,best=Infinity,at=1,ratio=.5;
      for(let i=1;i<items.length;i++){
        sum+=items[i-1].share;const distance=Math.abs(sum-total/2);
        if(distance<best){best=distance;at=i;ratio=sum/total;}
      }
      const axis=w>=d?"x":"z";
      return {axis,ratio,first:partition(items.slice(0,at),axis==="x"?w*ratio:w,axis==="z"?d*ratio:d),
        second:partition(items.slice(at),axis==="x"?w*(1-ratio):w,axis==="z"?d*(1-ratio):d)};
    }
    const program=floor.rooms!==undefined?list(floor.rooms,"rooms",32,1).map(value=>{
      const room=record(value,"room");return {name:text(room.name,"room.name"),share:number(room.share,"share",1,100)};
    }):undefined;
    if(plan.footprint==="l-shaped"){
      check(program&&program.length>=2,"Для двух крыльев нужны минимум два помещения на каждом этаже");
      const zones=footprintRects({width,depth,footprint:"l-shaped"}),total=program.reduce((n,r)=>n+r.share,0),target=zones[0].width*zones[0].depth/zones.reduce((n,r)=>n+r.width*r.depth,0);
      let at=1,best=Infinity,sum=0;
      for(let i=1;i<program.length;i++){sum+=program[i-1].share;const gap=Math.abs(sum/total-target);if(gap<best){best=gap;at=i;}}
      zones.forEach((r,i)=>split(partition(i===0?program.slice(0,at):program.slice(at),r.width,r.depth),r.x,r.z,r.width,r.depth));
    } else split(program?partition(program,width,depth):floor.layout,0,0,width,depth);
    return {id:`floor_${index+1}`,rooms,openings:[]};
  });
  const doc=parseHouse({...plan,kind:"house",schemaVersion:1,units:"m",floors});
  const eps=1e-6,doorWidth=.8,margin=doc.wallThickness;
  doc.floors.forEach((floor, floorIndex)=>{
    type Room=typeof floor.rooms[number];type Side="north"|"south"|"west"|"east";
    const openings:typeof floor.openings=[];
    const exterior=(room:Room)=>exteriorRoomSides(doc,room).filter(e=>e.length>=doorWidth+2*margin);
    const root=floor.rooms.find(r=>/прихож|холл|коридор|entrance|hall/i.test(r.name)&&exterior(r).length)??floor.rooms.find(r=>exterior(r).some(e=>e.side==="south"))??floor.rooms.find(r=>exterior(r).length);
    check(root,"Нет места для входной двери");
    const entry=exterior(root).find(e=>e.side==="south")??exterior(root)[0];
    if(floorIndex===0)openings.push({id:"entry",roomId:root.id,side:entry.side,kind:"door",offset:(entry.length-doorWidth)/2,width:doorWidth,bottom:0,height:Math.min(2.1,doc.floorHeight-.1)});
    const reached=new Set([root.id]);
    while(reached.size<floor.rooms.length){
      let added=false;
      for(const a of floor.rooms.filter(r=>reached.has(r.id))){
        for(const b of floor.rooms.filter(r=>!reached.has(r.id))){
          let side:Side|undefined,start=0,end=0;
          if(Math.abs(a.x+a.width-b.x)<eps)side="east";
          else if(Math.abs(a.x-b.x-b.width)<eps)side="west";
          else if(Math.abs(a.z+a.depth-b.z)<eps)side="south";
          else if(Math.abs(a.z-b.z-b.depth)<eps)side="north";
          if(!side)continue;
          const horizontal=side==="north"||side==="south";
          start=Math.max(horizontal?a.x:a.z,horizontal?b.x:b.z);
          end=Math.min(horizontal?a.x+a.width:a.z+a.depth,horizontal?b.x+b.width:b.z+b.depth);
          if(end-start<doorWidth+2*margin)continue;
          openings.push({id:`door_${openings.length}`,roomId:a.id,side,kind:"door",offset:(start+end-doorWidth)/2-(horizontal?a.x:a.z),width:doorWidth,bottom:0,height:Math.min(2.1,doc.floorHeight-.1)});
          reached.add(b.id);added=true;
        }
      }
      check(added,"Нет достаточной общей стены для дверного прохода между комнатами");
    }
    for(const room of floor.rooms)for(const wall of exterior(room)){
      const a=doc.architecture, bathroom=/сануз|ванн|bath|кладов|pantry/i.test(room.name);
      const desiredWidth=bathroom?.8:a?.windowWidth??1.45, desiredHeight=bathroom?1:a?.windowHeight??1.45;
      const bottom=bathroom?1.35:a?.windows==="panoramic"?.3:.85,height=Math.min(desiredHeight,doc.floorHeight-bottom-.15);
      // Split around door openings. Windows cut the wall, including beside the entrance.
      const blocked=openings.filter(o=>o.roomId===room.id&&o.side===wall.side).map(o=>[Math.max(margin,o.offset-.3),Math.min(wall.length-margin,o.offset+o.width+.3)]).sort((a,b)=>a[0]-b[0]);
      let start=margin;
      const intervals:number[][]=[];
      for(const [low,high] of blocked){if(low>start)intervals.push([start,low]);start=Math.max(start,high);}
      if(start<wall.length-margin)intervals.push([start,wall.length-margin]);
      for(const [low,high] of intervals){
        const available=high-low;if(available<.75)continue;
        const count=bathroom?1:Math.min(12,Math.max(1,Math.floor((available+.4)/(a?.windowSpacing??3))));
        const cell=available/count,windowWidth=Math.min(desiredWidth,cell-.35);if(windowWidth<.4)continue;
        for(let i=0;i<count&&openings.length<128;i++)openings.push({id:`window_${openings.length}`,roomId:room.id,side:wall.side,kind:"window",offset:low+cell*(i+.5)-windowWidth/2,width:windowWidth,bottom,height});
      }
    }
    floor.openings=openings;
  });
  return parseHouse(doc);
}
