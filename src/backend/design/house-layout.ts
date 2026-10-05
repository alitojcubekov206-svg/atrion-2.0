import {parseHouse, type HouseDocument} from "../../shared/house/document";
import {check,record,number,text,list,choice} from "./validation";

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
    const layout=floor.rooms!==undefined?partition(list(floor.rooms,"rooms",32,1).map(value=>{
      const room=record(value,"room");return {name:text(room.name,"room.name"),share:number(room.share,"share",1,100)};
    }),width,depth):floor.layout;
    split(layout,0,0,width,depth);
    return {id:`floor_${index+1}`,rooms,openings:[]};
  });
  const doc=parseHouse({...plan,kind:"house",schemaVersion:1,units:"m",floors});
  const eps=1e-6,doorWidth=.8,margin=doc.wallThickness;
  doc.floors.forEach(floor=>{
    type Room=typeof floor.rooms[number];type Side="north"|"south"|"west"|"east";
    const openings:typeof floor.openings=[];
    const exterior=(room:Room)=>[
      {side:"north" as Side,edge:room.z,length:room.width},
      {side:"south" as Side,edge:doc.depth-room.z-room.depth,length:room.width},
      {side:"west" as Side,edge:room.x,length:room.depth},
      {side:"east" as Side,edge:doc.width-room.x-room.width,length:room.depth},
    ].filter(e=>Math.abs(e.edge)<eps&&e.length>=doorWidth+2*margin);
    const root=floor.rooms.find(r=>/прихож|холл|коридор|entrance|hall/i.test(r.name)&&exterior(r).length)??floor.rooms.find(r=>exterior(r).length);
    check(root,"Нет места для входной двери");
    const entry=exterior(root)[0];
    openings.push({id:"entry",roomId:root.id,side:entry.side,kind:"door",offset:(entry.length-doorWidth)/2,width:doorWidth,bottom:0,height:Math.min(2.1,doc.floorHeight-.1)});
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
    for(const room of floor.rooms){
      const wall=exterior(room).find(e=>!openings.some(o=>o.roomId===room.id&&o.side===e.side));
      if(!wall)continue;
      const windowWidth=Math.min(1.2,wall.length-2*margin),bottom=.8,height=Math.min(1.2,doc.floorHeight-bottom-.1);
      openings.push({id:`window_${openings.length}`,roomId:room.id,side:wall.side,kind:"window",offset:(wall.length-windowWidth)/2,width:windowWidth,bottom,height});
    }
    floor.openings=openings;
  });
  return parseHouse(doc);
}
