import { NextResponse } from "next/server";
import { designAuth, designFailure, readDesignBody } from "@/backend/design/http";
import { evaluateDesign, parseDesignDocument } from "@/backend/design/documents";

export async function POST(req: Request) {
  try {
    const auth = await designAuth();
    if (auth.response) return auth.response;
    const body = await readDesignBody(req);
    const document = parseDesignDocument(body.document);
    return NextResponse.json({kind:document.kind,result:evaluateDesign(document,body.options)});
  } catch(error) { return designFailure(error); }
}
