import {NextResponse} from "next/server";
import {designFailure, readDesignBody} from "@/backend/design/http";
import {exportSceneGlb} from "@/backend/design/scene-export";
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, {status: 404});
  try {return await exportSceneGlb((await readDesignBody(req)).scene);}
  catch (error) {return designFailure(error);}
}
