import {notFound} from "next/navigation";
import RendererCheck from "@/frontend/rigging/RendererCheck";
export default function Page(){
  if(process.env.NODE_ENV==="production")notFound();
  return <RendererCheck/>;
}
