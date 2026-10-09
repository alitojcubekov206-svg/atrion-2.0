import {designAuth, designFailure, readDesignBody} from "@/backend/design/http";
import {exportSceneGlb} from "@/backend/design/scene-export";
export async function POST(req: Request) {
  const auth = await designAuth();
  if (auth.response) return auth.response;
  try {return await exportSceneGlb((await readDesignBody(req)).scene);}
  catch (error) {return designFailure(error);}
}
