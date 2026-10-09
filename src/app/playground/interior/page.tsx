import {notFound} from "next/navigation";
import {templateScene} from "@/shared/interior/templates";
import DesignWorkspace from "@/frontend/components/interior/DesignWorkspace";
export const dynamic = "force-dynamic";
export default async function InteriorPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignWorkspace initialScene={templateScene("living")} preview/>;
}
