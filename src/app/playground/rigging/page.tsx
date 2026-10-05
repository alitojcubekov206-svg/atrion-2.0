import { notFound } from "next/navigation";
import RigEditor from "@/frontend/rigging/RigEditor";
export default function RiggingPlayground(){
  if(process.env.NODE_ENV==="production")notFound();
  return <RigEditor preview/>;
}
