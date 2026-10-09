import {db} from "@/backend/db";
import {json} from "@/backend/interior/repository";
import {projectInput,referencedFiles} from "@/shared/forma/document";
import {DesignError} from "@/shared/design/validation";

export async function saveForma(userId:string,raw:unknown,projectId?:string){
  const parsed=projectInput.safeParse(raw);
  if(!parsed.success)throw new DesignError("Некорректный проект FORMA",422,"FORMA_INVALID_DOCUMENT");
  const p=parsed.data;
  if(projectId&&projectId!==p.id)throw new DesignError("ID проекта не совпадает");
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
    const refs=referencedFiles(p.document);
    if(refs.length&&await tx.formaFile.count({where:{id:{in:refs},userId}})!==refs.length)throw new DesignError("Файлы недоступны",404,"NOT_FOUND");
    const existing=await tx.formaProject.findFirst({where:{id:p.id,userId}});
    if(projectId){
      if(!existing)throw new DesignError("Проект не найден",404,"NOT_FOUND");
      if(existing.revision!==p.revision)return {conflict:existing};
      return {project:await tx.formaProject.update({where:{id:p.id},data:{title:p.title,document:json(p.document),archived:p.archived??false,revision:{increment:1}}})};
    }
    if(existing){if(existing.title!==p.title||JSON.stringify(existing.document)!==JSON.stringify(p.document))return {conflict:existing};return {project:existing};}
    if(await tx.formaProject.count({where:{id:p.id}}))throw new DesignError("Идентификатор занят",409,"FORMA_ID_CONFLICT");
    return {project:await tx.formaProject.create({data:{id:p.id,userId,title:p.title,document:json(p.document)}})};
  });
}
