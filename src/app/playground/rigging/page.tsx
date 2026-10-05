import { notFound } from "next/navigation";
import RigEditor from "@/frontend/rigging/RigEditor";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseRig2D } from "@/shared/rigging/rig2d";
export default async function RiggingPlayground({searchParams}:{searchParams:Promise<{fixture?:string}>}){
  if(process.env.NODE_ENV==="production")notFound();
  if((await searchParams).fixture==="fullbody"){
    // Development-only, fixed local artifact. Never accepts a caller-supplied filesystem path.
    try{
      const raw=await readFile(`${process.cwd()}/.backend-tests/atrion-fullbody-rig.json`,"utf8");
      if(Buffer.byteLength(raw)>1048000)notFound();
      const value=JSON.parse(raw),document=parseRig2D(value.document);
      return <RigEditor preview autoPlayMotion initialDocument={document} draftScope={`fullbody-${createHash("sha256").update(raw).digest("hex").slice(0,12)}`}/>;
    }catch{notFound();}
  }
  return <RigEditor preview/>;
}
