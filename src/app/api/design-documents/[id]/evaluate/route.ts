import { NextResponse } from "next/server";
import { designAuth, designFailure, readDesignBody } from "@/backend/design/http";
import { evaluateDesign } from "@/backend/design/documents";
import { readDesignDocument } from "@/backend/design/store";
import { id } from "@/backend/design/validation";

export async function POST(req: Request, {params}: {params:Promise<{id:string}>}) {
  try {
    const auth = await designAuth();
    if (auth.response) return auth.response;
    const saved = await readDesignDocument(auth.userId,id((await params).id,"id"));
    const options = await readDesignBody(req);
    return NextResponse.json({kind:saved.kind,revision:saved.revision,result:evaluateDesign(saved.data,options)});
  } catch(error) { return designFailure(error); }
}
