import { z } from 'zod';

const bounded = (min: number, max: number) => z.number().finite().min(min).max(max);
const key = z.string().regex(/^[\w-]{1,80}$/);
const money = bounded(0, 1e8);
const types = ['sofa','armchair','ottoman','bench','bed','table','coffee','desk','chair','cabinet','wardrobe','nightstand','bookcase','console','lamp','plant','rug','vase','books','cup','bowl','bottle','candle','radio'] as const;
const image = z.string().regex(/^\/api\/forma\/files\/[\w-]{1,80}$/).nullable().optional();
const point = z.object({x:bounded(-15,15),z:bounded(-15,15)});
const plan = z.object({width:bounded(3,30),length:bounded(3,30),height:bounded(2.4,6),image,
  walls:z.array(z.object({a:point,b:point})).max(150),
  rooms:z.array(point.extend({name:z.string().min(1).max(35)})).min(1).max(12)
}).superRefine((p,ctx)=>{
  const inside=(a:{x:number,z:number})=>Math.abs(a.x)<=p.width/2+.00001&&Math.abs(a.z)<=p.length/2+.00001;
  if(p.rooms.some(r=>!inside(r))||p.walls.some(w=>!inside(w.a)||!inside(w.b)||(w.a.x!==w.b.x&&w.a.z!==w.b.z)))ctx.addIssue({code:'custom',message:'Стены или комнаты выходят за границы плана'});
});
const item=z.object({id:key,type:z.enum(types),name:z.string().max(60),color:z.string().regex(/^#[0-9a-f]{6}$/i),scale:bounded(.5,1.5),rotation:bounded(-100,100),x:bounded(-30,30),y:bounded(0,5),z:bounded(-30,30)});
const items=z.array(item).max(60).refine(a=>new Set(a.map(i=>i.id)).size===a.length,'Повторяющиеся предметы');
const priceMap=z.record(z.enum(types),money);
export const snapshotSchema=z.object({
 config:z.object({type:bounded(0,1).int(),style:bounded(0,7).int(),wall:bounded(0,7).int(),floor:bounded(0,7).int(),fabric:bounded(0,7).int(),layout:bounded(0,7).int(),light:bounded(0,7).int(),decor:bounded(0,7).int()}),
 workshop:z.object({items,objectPositions:z.array(z.object({id:z.string().regex(/^builtin-[01]-\d+$/),x:bounded(-30,30),y:bounded(0,6),z:bounded(-30,30)})).max(250).optional(),plan:plan.nullable(),catalogItems:items,planItems:items,savedPlan:plan.nullable(),planDraft:plan.nullable().optional(),
 budget:z.object({currency:z.enum(['USD','KGS','RUB']),prices:priceMap,rates:z.object({floor:money,walls:money,ceiling:money,labor:money}),reserve:bounded(0,50),includeBase:z.boolean(),target:money.optional(),sources:z.record(z.enum(types),z.string().max(180)).optional(),confirmed:z.record(z.enum(types),z.boolean()).optional(),exchange:z.object({from:z.enum(['USD','KGS','RUB']),to:z.enum(['USD','KGS','RUB']),rate:bounded(.000001,1e6),date:z.string().max(40)}).optional()})})
});
export const documentSchema=z.object({schemaVersion:z.literal(2),role:z.enum(['owner','designer']),activeVariantId:key,
 variants:z.array(z.object({id:key,name:z.string().trim().min(1).max(80),snapshot:snapshotSchema,preview:image,total:bounded(0,1e14),currency:z.enum(['USD','KGS','RUB']),updatedAt:z.string().max(40)})).min(1).max(12)
}).refine(d=>d.variants.some(v=>v.id===d.activeVariantId)&&new Set(d.variants.map(v=>v.id)).size===d.variants.length,'Некорректные варианты');
export const projectInput=z.object({id:key,title:z.string().trim().min(1).max(100),document:documentSchema,revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),archived:z.boolean().optional()});
export function referencedFiles(document:unknown):string[]{
 const refs=new Set<string>();
 const visit=(v:unknown)=>{if(typeof v==='string'&&/^\/api\/forma\/files\/[\w-]+$/.test(v))refs.add(v.split('/').pop()!);else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit)};
 visit(document);return [...refs];
}
