import type { ModelPart } from "@/shared/types";
import { part, shade, partsBounds } from "@/shared/geometry";
import type { Blueprint } from "./blueprint";

type Vec3 = [number, number, number];
type Body = { halfW: number; halfL: number; y0: number; y1: number };
type Context = { bp: Blueprint; id: () => string; parts: ModelPart[]; body: Body };
type Ring = [number, number, number]; // axis position, x radius, second radius

/** Closed elliptical loft. Vertices are baked in metres, as required by ModelPart.mesh. */
function loft(ctx: Context, name: string, group: string, at: Vec3, rings: Ring[], axis: "y" | "z", color: string, material: string) {
  const position: number[] = [], index: number[] = [], sides = 24;
  for (const [height, rx, ry] of rings) {
    for (let j = 0; j < sides; j++) {
      const angle = j * Math.PI * 2 / sides, x = Math.cos(angle) * rx, other = Math.sin(angle) * ry;
      position.push(...(axis === "y" ? [x, height, other] : [x, other, height]));
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides, c = b + sides, d = a + sides;
    index.push(...(axis === "y" ? [a, d, b, b, d, c] : [a, b, d, b, c, d]));
  }
  for (const end of [0, rings.length - 1]) {
    const center = position.length / 3, h = rings[end][0];
    position.push(...(axis === "y" ? [0, h, 0] : [0, 0, h]));
    for (let j = 0; j < sides; j++) {
      const a = end * sides + j, b = end * sides + (j + 1) % sides;
      const forward = (axis === "y") === (end === 0);
      index.push(...(forward ? [center, a, b] : [center, b, a]));
    }
  }
  const centers: number[] = [];
  const sizes = [0, 1, 2].map(axisIndex => {
    const coordinates = position.filter((_, i) => i % 3 === axisIndex);
    centers.push((Math.max(...coordinates) + Math.min(...coordinates)) / 2);
    return Math.max(...coordinates) - Math.min(...coordinates);
  }) as Vec3;
  const p = part(ctx.id(), name, { shape: "mesh", role: "volume", group, position: at.map((v,i)=>v+centers[i]) as Vec3, size: sizes, color, material, roughness: .82 });
  p.size=sizes;
  p.mesh = { position: position.map((v,i)=>v-centers[i%3]), index }; ctx.parts.push(p);
}

function solid(ctx: Context, name: string, group: string, at: Vec3, size: Vec3, color: string, shape: ModelPart["shape"] = "sphere", rotation: Vec3 = [0, 0, 0]) {
  const p=part(ctx.id(), name, { shape, role: group === "Голова" ? "head" : group === "Ноги" || group === "Руки" ? "limb" : "detail", group, position: at, size, color, material: group === "Волосы" ? "Волосы" : group === "Одежда" ? "Ткань" : "Органическая поверхность", rotation, roughness: .8 });
  // Face details need millimetre precision; the general constructor's 1 cm floor is too coarse.
  p.size=size.map(v=>Math.max(.001,v)) as Vec3;ctx.parts.push(p);
}

/** Connected tapered limb, with an actual joint rather than a detached cylinder. */
function limb(ctx: Context, name: string, group: string, a: Vec3, b: Vec3, r0: number, r1: number, color: string) {
  const d = b.map((v, i) => v - a[i]) as Vec3, length = Math.hypot(...d);
  const at = a.map((v, i) => (v + b[i]) / 2) as Vec3;
  const before = ctx.parts.length;
  const cap=group==="Хвост"?1:.7;
  loft(ctx, name, group, at, [[-length / 2, r0 * cap, r0 * cap], [-length * .35, r0, r0], [length * .3, r1, r1], [length / 2, r1 * cap, r1 * cap]], "y", color, "Органическая поверхность");
  ctx.parts[before].rotation = [Math.atan2(d[2], d[1]), 0, -Math.atan2(d[0], Math.hypot(d[1], d[2]))];
}

export function hasLivingAnatomy(bp: Blueprint) {
  return bp.legStyle === "organic" && (bp.kind === "character" || (bp.kind === "animal" && bp.matched.includes("четвероногое")));
}

export function buildLivingAnatomy(ctx: Context) {
  if (ctx.bp.kind === "character") human(ctx); else quadruped(ctx);
}

function human(ctx: Context) {
  const { bp } = ctx, h = bp.height;
  const skin = /т[её]мная кожа|dark skin/i.test(bp.prompt) ? "#85583e" : "#dcae8c";
  const cloth = bp.primary, trousers = "#343e51", hair = /светл.*волос|блондин|blond/i.test(bp.prompt) ? "#bd934f" : /рыж.*волос|red hair/i.test(bp.prompt) ? "#88482b" : "#372920";
  const w = Math.min(bp.width, h * .29), depth = Math.min(bp.length, h * .17);
  ctx.body = { halfW: w * .36, halfL: depth / 2, y0: h * .49, y1: h * .82 };
  loft(ctx, "Туловище", "Тело", [0, h * .66, 0], [[-h * .17,w * .29,depth * .36],[-h * .12,w * .36,depth * .45],[-h * .05,w * .28,depth * .38],[h * .07,w * .38,depth * .46],[h * .13,w * .42,depth * .43],[h * .16,w * .27,depth * .32]], "y", bp.clothed ? cloth : skin, bp.clothed ? "Ткань" : "Кожа");
  solid(ctx, "Таз", "Тело", [0,h*.49,0], [w*.72,h*.14,depth*.85], bp.clothed ? trousers : skin);
  if (bp.head) {
    solid(ctx, "Шея", "Шея", [0,h*.835,0], [h*.062,h*.09,h*.062], skin, "capsule");
    const cy=h*.918, face=h*.134;
    solid(ctx, "Голова", "Голова", [0,cy,0], [face*.74,face,face*.81], skin);
    solid(ctx, "Подбородок", "Голова", [0,cy-face*.29,face*.13], [face*.51,face*.38,face*.56], skin);
    solid(ctx, "Нос", "Голова", [0,cy-face*.025,face*.405], [face*.115,face*.19,face*.19], shade(skin,-.025));
    solid(ctx, "Губы", "Голова", [0,cy-face*.23,face*.395], [face*.25,face*.038,face*.065], "#b77970");
    // Human ears belong at the sides of the skull, not on its crown.
    if (bp.ears !== "none" || !/без ушей|no ears/i.test(bp.prompt)) for (const s of [-1,1]) solid(ctx,"Ухо","Голова",[s*face*.38,cy-face*.04,0],[face*.14,face*.27,face*.13],skin);
    for (let i=0;i<bp.eyes;i++) {
      const x=(i-(bp.eyes-1)/2)*face*.32, y=cy+face*.065, z=face*.36;
      solid(ctx,"Глаз","Голова",[x,y,z],[face*.21,face*.09,face*.085],"#f3efe7");
      solid(ctx,"Радужка","Голова",[x,y,z+face*.04],[face*.069,face*.072,face*.022],"#586d63");
      solid(ctx,"Зрачок","Голова",[x,y,z+face*.052],[face*.027,face*.04,face*.012],"#171b20");
      solid(ctx,"Бровь","Голова",[x,y+face*.077,z-face*.02],[face*.22,face*.025,face*.048],hair,"capsule");
    }
    if (bp.hair) {
      // Cap ends above the eyes. No opaque hair sphere hiding the whole face.
      loft(ctx,"Причёска","Волосы",[0,cy+face*.32,-face*.02], [[-face*.13,face*.38,face*.405],[0,face*.36,face*.39],[face*.13,face*.27,face*.30],[face*.20,face*.08,face*.12]],"y",hair,"Волосы");
      if (bp.hair>=3) solid(ctx,"Длинные волосы","Волосы",[0,cy-face*.38,-face*.31],[face*.85,face*1.65,face*.39],hair,"capsule");
    }
    for(let i=0;i<bp.horns;i++) solid(ctx,"Рог","Голова",[(i-(bp.horns-1)/2)*face*.55,cy+face*.55,-face*.08],[face*.15,face*.5,face*.15],bp.trim,"cone");
  }
  for (let i=0;i<bp.legs;i++) {
    const x=(i-(bp.legs-1)/2)*w*.4, hip:Vec3=[x,h*.495,0], knee:Vec3=[x,h*.275,h*.006], ankle:Vec3=[x,h*.055,0];
    limb(ctx,"Бедро","Ноги",knee,hip,h*.041,h*.055,bp.clothed?trousers:skin);
    solid(ctx,"Колено","Ноги",knee,[h*.073,h*.077,h*.076],bp.clothed?trousers:skin);
    limb(ctx,"Голень","Ноги",ankle,knee,h*.026,h*.039,bp.clothed?trousers:skin);
    solid(ctx,"Стопа","Ноги",[x,h*.032,h*.032],[h*.055,h*.064,h*.135],bp.clothed?"#282728":skin,"capsule");
  }
  for (let i=0;i<bp.arms;i++) {
    const s=i%2===0?-1:1, z=Math.floor(i/2)*depth*.45, shoulder:Vec3=[s*w*.43,h*.78,z], elbow:Vec3=[s*w*.54,h*.62,z], wrist:Vec3=[s*w*.58,h*.475,z+h*.012];
    solid(ctx,"Плечо","Руки",shoulder,[h*.081,h*.085,h*.088],bp.clothed?cloth:skin);
    limb(ctx,"Плечевая часть","Руки",elbow,shoulder,h*.029,h*.039,bp.clothed?cloth:skin);
    solid(ctx,"Локоть","Руки",elbow,[h*.053,h*.055,h*.054],skin);
    limb(ctx,"Предплечье","Руки",wrist,elbow,h*.020,h*.029,skin);
    if(bp.hands) {
      solid(ctx,"Кисть","Руки",[wrist[0],h*.448,wrist[2]],[h*.043,h*.066,h*.029],skin);
      for(let f=0;f<4;f++) solid(ctx,"Палец","Руки",[wrist[0]+(f-1.5)*h*.009,h*.407,wrist[2]+h*.002],[h*.009,h*(f===0||f===3?.039:.047),h*.012],skin,"capsule");
      solid(ctx,"Большой палец","Руки",[wrist[0]-s*h*.023,h*.435,wrist[2]+h*.014],[h*.015,h*.037,h*.016],skin,"capsule",[0,0,-s*.42]);
    }
  }
}

type Species = "cat"|"dog"|"horse"|"rabbit"|"bear"|"elephant"|"generic";
export function animalSpecies(text: string): Species {
  const patterns: [Species,RegExp][] = [["cat",/(?:^|[^а-яёa-z])(?:кот(?:а|у|ом|ы|ов|ик|ята)?|кошк[а-яё]*|cat|kitten)(?=$|[^а-яёa-z])/ig],["dog",/собак|п[её]с(?:\b|[^а-яё])|щен|\bdog\b|\bpuppy\b|волк|wolf/ig],["horse",/лошад|конь|пони|\bhorse\b|pony/ig],["rabbit",/кролик|заяц|зайц|rabbit|bunny/ig],["bear",/медвед|bear/ig],["elephant",/слон|elephant|мамонт/ig]];
  const found=patterns.map(([species,re])=>({species,index:re.exec(text)?.index??Infinity})).sort((a,b)=>a.index-b.index)[0];
  return found.index<Infinity?found.species:"generic";
}

export function setAnimalDimensions(bp: Blueprint, subject: string) {
  if(bp.kind!=="animal"||!bp.matched.includes("четвероногое"))return;
  const sizes:Partial<Record<Species,Vec3>>={cat:[.22,.38,.58],dog:[.30,.62,.80],horse:[.55,1.75,1.90],rabbit:[.25,.42,.40],bear:[.65,1.2,1.4],elephant:[1.9,3.2,3.8]};
  const size=sizes[animalSpecies(subject)];if(!size)return;
  bp.width=size[0];bp.height=size[1];bp.length=size[2];
}

function quadruped(ctx: Context) {
  const {bp}=ctx, species=animalSpecies(bp.prompt), h=bp.height;
  const horse=species==="horse", rabbit=species==="rabbit", elephant=species==="elephant", cat=species==="cat";
  const w=bp.width, l=bp.length, coat=bp.params.color??(cat?"#bc8854":horse?"#885538":rabbit?"#c8bfb0":elephant?"#9b9991":species==="bear"?"#70513c":"#b9956e");
  const legRatio=horse?.56:rabbit?.26:elephant?.43:.43, low=h*legRatio, high=h*(rabbit?.65:horse?.81:.75), cy=(low+high)/2;
  ctx.body={halfW:w/2,halfL:l*.41,y0:low,y1:high};
  loft(ctx,"Туловище","Тело",[0,cy,0],[[-l*.43,w*.18,(high-low)*.25],[-l*.31,w*.47,(high-low)*.48],[-l*.08,w*.5,(high-low)*.5],[l*.22,w*.43,(high-low)*.45],[l*.37,w*.22,(high-low)*.28]],"z",coat,"Шерсть");
  const headSize=h*(horse?.26:elephant?.31:rabbit?.30:.28), headY=horse?h*.85:rabbit?h*.72:h*.79, headZ=l*(horse?.40:.46);
  if(bp.head) {
    solid(ctx,"Шея","Шея",[0,(high+headY)/2,l*.30],[w*.50,horse?h*.36:h*.24,headSize*.78],coat,"capsule",[horse?.38:.65,0,0]);
    solid(ctx,"Голова","Голова",[0,headY,headZ],[headSize*(horse?.62:1),headSize,headSize*(horse?.94:.89)],coat);
    const muzzle=cat?.27:rabbit?.29:horse?.85:elephant?.50:.62;
    if(bp.muzzle>0) {
      solid(ctx,"Морда","Голова",[0,headY-headSize*.19,headZ+headSize*.37],[headSize*.63,headSize*.42,headSize*muzzle],shade(coat,.13));
      solid(ctx,"Нос","Голова",[0,headY-headSize*.13,headZ+headSize*(.39+muzzle/2)],[headSize*.23,headSize*.15,headSize*.085],cat?"#ba8179":"#302c2a");
    }
    for(let i=0;i<bp.eyes;i++) {
      const x=(i-(bp.eyes-1)/2)*headSize*.64, z=headZ+headSize*.32;
      solid(ctx,"Глаз","Голова",[x,headY+headSize*.06,z],[headSize*.21,headSize*.20,headSize*.115],cat?"#9eae64":"#5d4837");
      solid(ctx,"Зрачок","Голова",[x,headY+headSize*.06,z+headSize*.055],[headSize*(cat?.035:.075),headSize*.13,headSize*.025],"#161719");
      solid(ctx,"Блик глаза","Голова",[x-headSize*.024,headY+headSize*.103,z+headSize*.063],[headSize*.037,headSize*.037,headSize*.012],"#f6f0dc");
    }
    if(bp.ears!=="none") for(const s of [-1,1]) {
      const long=rabbit||bp.ears==="long", tall=long?headSize*(elephant?1.1:1.5):headSize*(horse?.68:.6);
      const at:Vec3=[s*headSize*(elephant?.65:.36),headY+headSize*(elephant?0:.44)+tall*.25,headZ-headSize*.14];
      const size:Vec3=[headSize*(elephant?1.0:long?.27:.44),tall,headSize*(elephant?.16:.18)];
      solid(ctx,"Ухо","Голова",at,size,coat,bp.ears==="pointed"||horse?"cone":"sphere",[0,0,-s*(elephant?.1:.18)]);
      solid(ctx,"Внутренняя часть уха","Голова",[at[0],at[1],at[2]+size[2]*.42],[size[0]*.63,size[1]*.69,size[2]*.2],"#b79087",bp.ears==="pointed"||horse?"cone":"sphere",[0,0,-s*(elephant?.1:.18)]);
    }
    for(let i=0;i<bp.horns;i++) solid(ctx,elephant?"Бивень":"Рог","Голова",[(i-(bp.horns-1)/2)*headSize*.85,headY+headSize*(elephant?-.24:.48),headZ+headSize*(elephant?.58:0)],[headSize*.16,headSize*.65,headSize*.16],"#e1d3b6","cone",[elephant?1.15:0,0,0]);
    if(elephant) limb(ctx,"Хобот","Голова",[0,headY-h*.48,headZ+headSize*.65],[0,headY-headSize*.15,headZ+headSize*.5],headSize*.17,headSize*.23,coat);
    if(bp.mane) solid(ctx,"Грива","Голова",[0,headY-headSize*.25,headZ-headSize*.35],[headSize*(horse?.25:1.4),headSize*(horse?1.9:1.35),headSize*.9],shade(coat,-.38),"capsule");
    if(cat) for(const s of [-1,1]) for(let k=0;k<3;k++) solid(ctx,"Ус","Голова",[s*headSize*.55,headY-headSize*.19+(k-1)*headSize*.04,headZ+headSize*.47],[headSize*.54,headSize*.018,headSize*.018],"#e2d2be","capsule",[0,0,s*(k-1)*.15]);
  }
  for(let i=0;i<bp.legs;i++) {
    const pairs=Math.ceil(bp.legs/2), s=i%2?-1:1, z=pairs===1?0:(Math.floor(i/2)/(pairs-1)-.5)*l*.58, x=s*w*.32;
    const hip:Vec3=[x,cy,z], knee:Vec3=[x,low*.56,z+(z<0?-1:1)*h*.045], ankle:Vec3=[x,h*.055,z+h*.015], r=h*(horse?.029:elephant?.067:.038);
    limb(ctx,"Бедро","Ноги",knee,hip,r*1.1,r*1.8,coat);
    solid(ctx,"Колено","Ноги",knee,[r*2.15,r*2.3,r*2.15],coat);
    limb(ctx,"Голень","Ноги",ankle,knee,r*.75,r*1.12,coat);
    const paw:Vec3=[r*(horse?2.5:3.2),h*.09,h*(rabbit&&z<0?.24:horse?.1:.13)];
    solid(ctx,horse?"Копыто":"Лапа","Ноги",[x,h*.045,z+h*.04],paw,horse?"#39302a":shade(coat,-.07),"capsule");
    if(!horse&&!elephant) for(let t=0;t<3;t++) solid(ctx,"Палец лапы","Ноги",[x+(t-1)*r*.77,h*.028,z+h*.105],[r*.7,h*.038,h*.058],shade(coat,.05),"capsule");
  }
  if(bp.tail) {
    if(rabbit) solid(ctx,"Хвост","Хвост",[0,cy,-l*.44],[h*.16,h*.16,h*.16],shade(coat,.1));
    else {
      const n=Math.max(3,Math.min(12,bp.tail)), length=l*(cat?.68:horse?.46:.43), radius=h*(horse?.036:cat?.029:.043);
      for(let i=0;i<n;i++) {
        const t=i/n, t1=(i+1)/n;
        const point=(v:number):Vec3=>[Math.sin(v*1.5)*h*.04,cy+h*(cat?.3:-.36)*v,-l*.39-length*v];
        limb(ctx,"Хвост","Хвост",point(t),point(t1),radius*(1-t*.78),radius*(1-t1*.78),horse?shade(coat,-.4):coat);
      }
    }
  }
}

/** Include hair/ears/feet in the requested overall height, and honour explicit axes. */
export function fitLivingDimensions(parts: ModelPart[], bp: Blueprint) {
  // A uniform first pass keeps natural proportions, including accessories.
  const bounds=partsBounds(parts), factor=bp.height/(bounds.max[1]-bounds.min[1]);
  for(const p of parts) {
    p.size=p.size.map(v=>v*factor) as Vec3;p.position=p.position.map(v=>v*factor) as Vec3;
    if(p.repeat)p.repeat.step=p.repeat.step.map(v=>v*factor) as Vec3;
    if(p.mesh)p.mesh.position=p.mesh.position.map(v=>v*factor);
  }
  // Resolve explicit body extents against the complete assembled bounds, including tilted limbs.
  for(let pass=0;pass<12&&(bp.explicitAxes.width||bp.explicitAxes.length);pass++) {
    const {min,max}=partsBounds(parts), actual=max.map((v,i)=>v-min[i]);
    const scales=[bp.explicitAxes.width?bp.width/actual[0]:1,bp.height/actual[1],bp.explicitAxes.length?bp.length/actual[2]:1];
    if(scales.every(v=>Math.abs(v-1)<.00001))break;
    for(const p of parts) {
      p.size=p.size.map((v,i)=>v*scales[i]) as Vec3;p.position=p.position.map((v,i)=>v*scales[i]) as Vec3;
      if(p.repeat)p.repeat.step=p.repeat.step.map((v,i)=>v*scales[i]) as Vec3;
      if(p.mesh)p.mesh.position=p.mesh.position.map((v,i)=>v*scales[i%3]);
    }
  }
}
