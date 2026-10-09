import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {db} from "@/backend/db";
import {getSessionUserId} from "@/backend/auth";
import {interiorApi,readDesignBody} from "@/backend/interior/http";
import {saveForma} from "@/backend/forma/projects";
import {DesignError} from "@/shared/design/validation";
import {putPlanFile,getPlanFile,deletePlanFile,assertPlanStorage} from "@/backend/interior/cloudflare";
export const runtime="nodejs";
type Context={params:Promise<{path?:string[]}>};
async function handle(req:Request,ctx:Context){
  const {path=[]}=await ctx.params,[resource,id]=path;
  if(resource==="me"&&path.length===1&&req.method==="GET"){
    const userId=await getSessionUserId();
    return NextResponse.json({user:userId?{id:userId,name:"Пользователь Atrion"}:null},{headers:{"Cache-Control":"private, no-store"}});
  }
  return interiorApi(async userId=>{
    if(path.length>2)throw new DesignError("Маршрут не найден",404,"NOT_FOUND");
    if(resource==="projects"){
      if(req.method==="GET"){
        if(id){const p=await db.formaProject.findFirst({where:{id,userId}});if(!p)throw new DesignError("Проект не найден",404,"NOT_FOUND");return NextResponse.json(p);}
        const rows=await db.formaProject.findMany({where:{userId},orderBy:{updatedAt:"desc"},take:100});
        return NextResponse.json({projects:rows.map(p=>{const d=p.document as {activeVariantId:string;variants:{id:string;preview:string|null;total:number;currency:string}[]};const v=d.variants.find(v=>v.id===d.activeVariantId);return {...p,document:undefined,preview:v?.preview,total:v?.total,currency:v?.currency,variantCount:d.variants.length};})});
      }
      if((req.method==="POST"&&!id)||(req.method==="PATCH"&&id)){
        const result=await saveForma(userId,await readDesignBody(req),id);
        return result.conflict?NextResponse.json({error:"Проект изменён на другом устройстве",current:result.conflict},{status:409}):NextResponse.json(result.project,{status:req.method==="POST"?201:200});
      }
    }
    if(resource==="files"){
      if(req.method==="GET"&&id){const file=await db.formaFile.findFirst({where:{id,userId}});if(!file)throw new DesignError("Файл не найден",404,"NOT_FOUND");return new Response(await getPlanFile(file.objectKey) as BodyInit,{headers:{"Content-Type":"image/jpeg","X-Content-Type-Options":"nosniff"}});}
      if(req.method==="POST"&&!id){
        assertPlanStorage();
        if(!["image/png","image/jpeg","image/webp"].includes(req.headers.get("content-type")??""))throw new DesignError("Нужен PNG, JPG или WebP",415,"UNSUPPORTED_MEDIA");
        const reader=req.body?.getReader();if(!reader)throw new DesignError("Пустой файл");const chunks:Uint8Array[]=[];let size=0;
        try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>4_000_000){await reader.cancel();throw new DesignError("Файл больше 4 МБ",413,"FILE_TOO_LARGE");}chunks.push(r.value);}}finally{reader.releaseLock();}
        let bytes:Buffer;
        try{const input=Buffer.concat(chunks);const meta=await sharp(input,{limitInputPixels:24_000_000}).metadata();if(!["jpeg","png","webp"].includes(meta.format??""))throw new Error("Format");bytes=await sharp(input,{limitInputPixels:24_000_000}).rotate().resize(1600,1600,{fit:"inside",withoutEnlargement:true}).jpeg({quality:85}).toBuffer();}catch{throw new DesignError("Не удалось прочитать изображение",422,"INVALID_IMAGE");}
        if(bytes.length>3*1024*1024)throw new DesignError("Обработанное изображение слишком большое",413,"FILE_TOO_LARGE");
        const fileId=randomUUID(),key=`plans/${userId}/${fileId}/processed.jpg`;
        await putPlanFile(key,bytes,"image/jpeg");
        try{await db.formaFile.create({data:{id:fileId,userId,objectKey:key}});}catch(e){await deletePlanFile(key).catch(()=>{});throw e;}
        return NextResponse.json({url:`/api/forma/files/${fileId}`},{status:201});
      }
    }
    throw new DesignError("Маршрут не найден",404,"NOT_FOUND");
  });
}
export {handle as GET,handle as POST,handle as PATCH};
