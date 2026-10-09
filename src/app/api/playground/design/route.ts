import {NextResponse} from "next/server";
import {resolveDesignBrief} from "@/backend/design/brief";
import {buildBriefModel} from "@/backend/design/brief-model";
import {prepareInteriorScene} from "@/backend/interior/request";
import {designWithPlanner} from "@/shared/interior/engine";
import {designPromptTarget} from "@/shared/interior/request";
import {DesignError, record, text} from "@/shared/design/validation";
import {parseScene} from "@/shared/interior/scene";
import {composeWithLocalAI, localDesignEndpoint} from "@/backend/design/local-ai";

export async function GET() {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, {status: 404});
  return NextResponse.json({localAI: Boolean(localDesignEndpoint())});
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, {status: 404});
  try {
    const raw = await req.text();
    if (raw.length > 100_000) return NextResponse.json({error: "Запрос слишком большой"}, {status: 413});
    const body = record(JSON.parse(raw), "Запрос");
    if (body.engine === "local-ai") return NextResponse.json(await composeWithLocalAI(body, {signal: req.signal}));
    let prompt = text(body.prompt, "Описание", 1500);
    if (!body.editing) {
      const brief = resolveDesignBrief(prompt, body.answers);
      if (brief.kind === "clarification") return NextResponse.json(brief);
      prompt = brief.prompt;
      if (brief.house || designPromptTarget(prompt) === "model") return NextResponse.json(buildBriefModel(brief, crypto.randomUUID()));
    }
    const scene = prepareInteriorScene(parseScene(body.scene), prompt, body.editing === true);
    return NextResponse.json({kind: "interior", ...await designWithPlanner(scene, prompt, body.editing === true, Math.floor(Math.random() * 1000))});
  } catch (e) {
    return NextResponse.json({error: e instanceof DesignError ? e.message : "Не удалось обработать запрос", code: e instanceof DesignError ? e.code : "DESIGN_FAILED"}, {status: e instanceof DesignError ? e.status : e instanceof SyntaxError ? 400 : 500});
  }
}
