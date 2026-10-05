import { parseHouse, buildHouse, type HouseDocument } from "../../shared/house/document";
import { DesignError,record,list,text,number } from "./validation";
import {compileHouseLayout} from "./house-layout";

const BRIEF_SCHEMA={type:"object",properties:{rooms:{type:"array",items:{type:"string"}},width:{type:["number","null"]},depth:{type:["number","null"]},floors:{type:["integer","null"]},roof:{type:["string","null"],enum:["flat","gable",null]}},required:["rooms","width","depth","floors","roof"],additionalProperties:false};

export const HOUSE_GENERATION_SYSTEM = `Design an editable architectural concept from the user's brief. Return JSON only:
{"name":"...","plan":{"width":12,"depth":9,"wallThickness":0.2,"floorHeight":2.8,"wallColor":"#e4ddd1","roof":"gable","floors":[{"rooms":[{"name":"room name","share":20},{"name":"another room","share":10}]}]}}
The numbers above illustrate the schema; derive the layout from the brief, not from this example.
Return a FLAT list of ALL rooms on each floor. share is its relative area weight (1..100), not coordinates.
Put the entrance hall first in the list. Choose sensible area shares for each room according to the brief.
The layout compiler partitions the footprint, derives walls, door gaps and exterior windows. Do not emit coordinates or a nested tree.
Honor the requested footprint, floor count, rooms, roof and wall color. Include EVERY explicitly named room, including the entrance hall, bathroom and the exact number of bedrooms; never silently omit or merge requested rooms.
Before returning JSON, count the rooms and compare their names with the brief. Width/depth: 3..100 m; floors: 1..3; rooms per floor: 1..32.
floorHeight: 2.2..6; wallThickness: .05...6; roof: flat or gable; room width/depth >=1.
Names in the user's language. Use balanced shares so each room can fit a doorway.
Current representation has no stairs, furniture, curved outlines, glass panes or door leaves. Do not claim these were generated.
If the brief cannot fit this representation at all, return {"unsupported":true} instead of an unrelated house.`;

/** Check circulation and coverage, in addition to the editable document parser. */
export function checkGeneratedHouse(doc: HouseDocument): string[] {
  const errors: string[] = [], eps=1e-6;
  doc.floors.forEach((floor, index) => {
    const area=floor.rooms.reduce((sum,r)=>sum+r.width*r.depth,0);
    if(Math.abs(area-doc.width*doc.depth)>.01)errors.push(`Этаж ${index+1}: комнаты не покрывают весь контур.`);
    const neighbors=new Map(floor.rooms.map(r=>[r.id,new Set<string>()]));
    const entries=new Set<string>();
    for(const opening of floor.openings.filter(o=>o.kind==="door")){
      const room=floor.rooms.find(r=>r.id===opening.roomId)!;
      const horizontal=opening.side==="north"||opening.side==="south";
      const line=horizontal?room.z+(opening.side==="south"?room.depth:0):room.x+(opening.side==="east"?room.width:0);
      const start=(horizontal?room.x:room.z)+opening.offset,end=start+opening.width;
      const outer=horizontal?doc.depth:doc.width;
      if(Math.abs(line)<eps||Math.abs(line-outer)<eps)entries.add(room.id);
      const opposite=floor.rooms.filter(r=>r.id!==room.id && (
        opening.side==="north"?Math.abs(r.z+r.depth-line)<eps:
        opening.side==="south"?Math.abs(r.z-line)<eps:
        opening.side==="west"?Math.abs(r.x+r.width-line)<eps:Math.abs(r.x-line)<eps
      ) && start>=(horizontal?r.x:r.z)+doc.wallThickness-eps &&
        end<=(horizontal?r.x+r.width:r.z+r.depth)-doc.wallThickness+eps);
      for(const other of opposite){neighbors.get(room.id)!.add(other.id);neighbors.get(other.id)!.add(room.id);}
    }
    if(index===0 && !entries.size)errors.push("Первый этаж: нет наружной входной двери.");
    const reached=new Set<string>();
    // Upper-floor circulation is checked within that floor. Stairs remain an explicit limitation.
    const queue=[index===0?[...entries][0]:floor.rooms[0].id].filter((id):id is string=>Boolean(id));
    while(queue.length){const id=queue.pop()!;if(reached.has(id))continue;reached.add(id);queue.push(...neighbors.get(id)!);}
    if(reached.size!==floor.rooms.length)errors.push(`Этаж ${index+1}: не все комнаты связаны дверями с входной комнатой.`);
  });
  return errors;
}

type Dependencies={
  configured:boolean;
  reserve:()=>Promise<{ok:true}|{ok:false;error:string;code:string}>;
  refund:()=>Promise<void>;
  request:(system:string,user:string,signal?:AbortSignal,schema?:Record<string,unknown>)=>Promise<unknown>;
};

export async function generateHouse(input:unknown,deps:Dependencies,signal?:AbortSignal){
  if(typeof input!=="string"||input.trim().length<10||input.length>1500)throw new DesignError("Опишите дом: от 10 до 1500 символов",400,"INVALID_HOUSE_PROMPT");
  if(!deps.configured)throw new DesignError("Текстовый AI не настроен на сервере",503,"TEXT_AI_NOT_CONFIGURED");
  if(signal?.aborted)throw new DesignError("Генерация отменена",499,"HOUSE_CANCELLED");
  const quota=await deps.reserve();if(!quota.ok)throw new DesignError(quota.error,429,quota.code);
  try{
    const prompt=input.trim();let correction="";
    const brief=record(await deps.request(
      `Extract only explicit requirements from a house brief. Return JSON: {"rooms":["room name",...],"width":null,"depth":null,"floors":null,"roof":null}.
Expand counts (two bedrooms means two named entries). Keep each explicitly requested room, including halls and bathrooms. Keep combined rooms combined if requested. Names in the user's language. Do not invent rooms. Dimensions in metres; absent/ambiguous values are null. roof: flat, gable or null.`,prompt,signal,BRIEF_SCHEMA),"brief");
    signal?.throwIfAborted();
    const roomNames=list(brief.rooms,"rooms",96).map(name=>text(name,"room.name"));
    const required={width:brief.width==null?null:number(brief.width,"width",3,100),depth:brief.depth==null?null:number(brief.depth,"depth",3,100),floors:brief.floors==null?null:number(brief.floors,"floors",1,3),roof:brief.roof};
    const inventory=`\nRequired rooms, each must appear as a separate entry with this exact name: ${JSON.stringify(roomNames)}. Required dimensions/floors: ${JSON.stringify(required)}.`;
    for(let attempt=0;attempt<2;attempt++){
      signal?.throwIfAborted();
      const raw=await deps.request(HOUSE_GENERATION_SYSTEM,`Brief: ${prompt}${inventory}${correction}`,signal);
      signal?.throwIfAborted();
      if(raw&&typeof raw==="object"&&"unsupported" in raw&&raw.unsupported===true)throw new DesignError("Запрос требует возможностей, которых пока нет в редакторе дома. Квота возвращена.",422,"HOUSE_UNSUPPORTED");
      try{
        if(!raw||typeof raw!=="object"||!("document" in raw||"plan" in raw))throw new Error("Ответ должен содержать plan.");
        const document="plan" in raw?compileHouseLayout(raw.plan):parseHouse(raw.document),issues=checkGeneratedHouse(document);
        const actualNames=document.floors.flatMap(f=>f.rooms.map(r=>r.name.toLocaleLowerCase()));
        for(const name of roomNames){const at=actualNames.indexOf(name.toLocaleLowerCase());if(at<0)issues.push(`Отсутствует запрошенная комната: ${name}`);else actualNames.splice(at,1);}
        if(required.width!==null&&Math.abs(document.width-required.width)>.001)issues.push(`Ширина должна быть ${required.width} м.`);
        if(required.depth!==null&&Math.abs(document.depth-required.depth)>.001)issues.push(`Глубина должна быть ${required.depth} м.`);
        if(required.floors!==null&&document.floors.length!==required.floors)issues.push(`Количество этажей должно быть ${required.floors}.`);
        if(["flat","gable"].includes(String(required.roof))&&document.roof!==required.roof)issues.push(`Крыша должна быть ${required.roof}.`);
        if(issues.length)throw new Error(issues.join(" "));
        const name="name" in raw&&typeof raw.name==="string"&&raw.name.trim()?raw.name.trim().slice(0,120):"Проект дома";
        return {name,document,warnings:[...buildHouse(document).warnings,"Расположение дверей и окон рассчитано автоматически и доступно для ручной правки. Проверьте удобство проходов и соответствие заданию."],source:"ai" as const};
      }catch(error){
        if(attempt===1)throw new DesignError("AI не создал корректную планировку. Текущий дом сохранён, квота возвращена.",502,"INVALID_HOUSE_RESPONSE");
        // Only locally generated validation messages are included, not provider error payloads.
        correction=`\nThe previous layout failed validation: ${error instanceof Error?error.message:"invalid document"}. Generate a complete corrected document for the same brief.`;
      }
    }
    throw new Error("No house result");
  }catch(error){
    await deps.refund();
    if(error instanceof DesignError&&error.code!=="INVALID_DOCUMENT")throw error;
    if(signal?.aborted)throw new DesignError("Генерация отменена",499,"HOUSE_CANCELLED");
    throw new DesignError("Сервис не вернул планировку. Квота возвращена; попробуйте позже.",502,"HOUSE_GENERATION_FAILED");
  }
}
