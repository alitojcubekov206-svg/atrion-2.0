import {NextResponse} from "next/server";
import {requireApiUser} from "@/backend/api-auth";
import {resolveDesignBrief} from "@/backend/design/brief";
import {DesignError, record} from "@/shared/design/validation";

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  try {
    const body = record(await req.json(), "Запрос");
    return NextResponse.json(resolveDesignBrief(body.prompt, body.answers));
  } catch (e) {return NextResponse.json({error: e instanceof DesignError ? e.message : "Некорректное описание"}, {status: 400});}
}
