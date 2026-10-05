import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "../db";
import { parseDesignDocument, type DesignDocument, type DesignKind } from "./documents";
import { DesignError } from "./validation";

export const DESIGN_DOCUMENT_LIMIT = 100;
const metadata = { id:true,name:true,kind:true,revision:true,createdAt:true,updatedAt:true } as const;
const json = (document: DesignDocument) => JSON.parse(JSON.stringify(document)) as Prisma.InputJsonValue;

/** Dependency injection lets policy checks run without a live database. */
export function createDesignStore(client: Pick<PrismaClient,"designDocument" | "$transaction">) {
  async function listDesignDocuments(userId: string, kind: DesignKind | undefined, limit: number, offset: number) {
    return client.designDocument.findMany({where:{userId,...(kind ? {kind} : {})},select:metadata,
      orderBy:[{updatedAt:"desc"},{id:"desc"}],take:limit,skip:offset});
  }

  async function createDesignDocument(userId: string, name: string, document: DesignDocument) {
    return client.$transaction(async(tx) => {
      const users = await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (users.length===0) throw new DesignError("Требуется вход",401,"UNAUTHORIZED");
      if (await tx.designDocument.count({where:{userId}}) >= DESIGN_DOCUMENT_LIMIT) {
        throw new DesignError("Лимит хранилища — 100 дизайн-документов",403,"DESIGN_DOCUMENT_LIMIT_REACHED");
      }
      return tx.designDocument.create({data:{userId,name,kind:document.kind,data:json(document)},select:metadata});
    });
  }

  async function readDesignDocument(userId: string, id: string) {
    const saved = await client.designDocument.findFirst({where:{id,userId}});
    if (!saved) throw new DesignError("Документ не найден",404,"NOT_FOUND");
    return { ...saved, data:parseDesignDocument(saved.data) };
  }

  async function replaceDesignDocument(userId: string, id: string, revision: number, name: string, document: DesignDocument) {
    return client.$transaction(async(tx) => {
      // Include ownership and revision in the atomic write, not only in a preceding read.
      const saved = await tx.designDocument.findFirst({where:{id,userId},select:{kind:true}});
      if (!saved) throw new DesignError("Документ не найден",404,"NOT_FOUND");
      if (saved.kind !== document.kind) throw new DesignError("Тип документа нельзя менять",400,"DOCUMENT_KIND_MISMATCH");
      const result = await tx.designDocument.updateMany({where:{id,userId,revision},data:{name,data:json(document),revision:{increment:1}}});
      if (result.count===0) throw new DesignError("Документ изменён другим запросом; загрузите новую версию",409,"REVISION_CONFLICT");
      return tx.designDocument.findFirstOrThrow({where:{id,userId},select:metadata});
    });
  }

  async function deleteDesignDocument(userId: string, id: string, revision: number) {
    const result = await client.designDocument.deleteMany({where:{id,userId,revision}});
    if (result.count===0) {
      const existing = await client.designDocument.findFirst({where:{id,userId},select:{id:true}});
      if (!existing) throw new DesignError("Документ не найден",404,"NOT_FOUND");
      throw new DesignError("Документ изменён другим запросом",409,"REVISION_CONFLICT");
    }
  }

  return {listDesignDocuments,createDesignDocument,readDesignDocument,replaceDesignDocument,deleteDesignDocument};
}

export const {listDesignDocuments,createDesignDocument,readDesignDocument,replaceDesignDocument,deleteDesignDocument} = createDesignStore(db);
