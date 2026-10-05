import { NextResponse } from "next/server";
import { designAuth, designFailure, readDesignBody } from "@/backend/design/http";
import { DESIGN_KINDS, parseDesignDocument } from "@/backend/design/documents";
import { createDesignDocument, listDesignDocuments } from "@/backend/design/store";
import { choice, integer, text } from "@/backend/design/validation";

export async function GET(req: Request) {
  try {
    const auth = await designAuth();
    if (auth.response) return auth.response;
    const params = new URL(req.url).searchParams;
    const kind = params.has("kind") ? choice(params.get("kind"),DESIGN_KINDS,"kind") : undefined;
    const limit = integer(Number(params.get("limit") ?? 20),"limit",1,50);
    const offset = integer(Number(params.get("offset") ?? 0),"offset",0,100);
    return NextResponse.json({documents:await listDesignDocuments(auth.userId,kind,limit,offset),limit,offset});
  } catch(error) { return designFailure(error); }
}

export async function POST(req: Request) {
  try {
    const auth = await designAuth();
    if (auth.response) return auth.response;
    const body = await readDesignBody(req);
    const name = text(body.name,"name",120);
    const document = parseDesignDocument(body.document);
    return NextResponse.json({document:await createDesignDocument(auth.userId,name,document)},{status:201});
  } catch(error) { return designFailure(error); }
}
