import { NextResponse } from "next/server";
import { designAuth, designFailure } from "@/backend/design/http";
import { readDesignDocument } from "@/backend/design/store";
import { id } from "@/backend/design/validation";

export async function GET(_req: Request, {params}: {params:Promise<{id:string}>}) {
  try {
    const auth = await designAuth();
    if (auth.response) return auth.response;
    const saved = await readDesignDocument(auth.userId,id((await params).id,"id"));
    return NextResponse.json({name:saved.name,document:saved.data},{headers:{
      "Content-Disposition":`attachment; filename="atrion-design-${saved.id}.json"`,"Cache-Control":"private, no-store"
    }});
  } catch(error) { return designFailure(error); }
}
