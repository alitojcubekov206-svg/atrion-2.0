import { NextResponse } from "next/server";
import { designAuth, designFailure, readDesignBody } from "@/backend/design/http";
import { parseDesignDocument } from "@/backend/design/documents";
import { deleteDesignDocument, readDesignDocument, replaceDesignDocument } from "@/backend/design/store";
import { id as parseId, integer, text } from "@/backend/design/validation";
type Params = {params:Promise<{id:string}>};

export async function GET(_req: Request, {params}: Params) {
  try {
    const auth = await designAuth();
    if (auth.response) return auth.response;
    return NextResponse.json({document:await readDesignDocument(auth.userId,parseId((await params).id,"id"))});
  } catch(error) { return designFailure(error); }
}

export async function PATCH(req: Request, {params}: Params) {
  try {
    const auth = await designAuth();
    if (auth.response) return auth.response;
    const body = await readDesignBody(req);
    const document = parseDesignDocument(body.document);
    const revision = integer(body.revision,"revision",1,2147483646);
    const name = text(body.name,"name",120);
    return NextResponse.json({document:await replaceDesignDocument(auth.userId,parseId((await params).id,"id"),revision,name,document)});
  } catch(error) { return designFailure(error); }
}

export async function DELETE(req: Request, {params}: Params) {
  try {
    const auth = await designAuth();
    if (auth.response) return auth.response;
    const body = await readDesignBody(req);
    await deleteDesignDocument(auth.userId,parseId((await params).id,"id"),integer(body.revision,"revision",1,2147483647));
    return NextResponse.json({ok:true});
  } catch(error) { return designFailure(error); }
}
