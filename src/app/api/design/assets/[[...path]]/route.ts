import {NextResponse} from "next/server";
import {interiorApi} from "@/backend/interior/http";
import {ASSETS, searchAssets} from "@/shared/interior/catalog";
import {detailedAsset,disposeDetailed} from "@/shared/interior/detailed";
import {detailedGlb} from "@/backend/interior/detailed-glb";
import {DesignError} from "@/shared/design/validation";
export async function GET(req: Request, context: {params: Promise<{path?: string[]}>}) {
  return interiorApi(async () => {
    const {path = []} = await context.params;
    if (path.length === 2 && path[1] === "model" && ASSETS.some(a => a.id === path[0])) {const model=detailedAsset(path[0]);try{return new Response(await detailedGlb(model) as BodyInit,{headers:{"Content-Type":"model/gltf-binary"}});}finally{disposeDetailed(model);}}
    if (path.length) throw new DesignError("Модель не найдена", 404, "NOT_FOUND");
    const query = new URL(req.url).searchParams;
    return NextResponse.json({assets: searchAssets({category: query.get("category") || undefined, style: query.get("style") || undefined, query: query.get("q") || undefined, maxWidth: query.has("maxWidth") ? Number(query.get("maxWidth")) : undefined})});
  });
}
