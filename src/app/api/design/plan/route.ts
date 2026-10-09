import {NextResponse} from "next/server";
import {generationApi} from "@/backend/generation-http";
import {photoPlanConfigured,readPhotoPlan} from "@/backend/design/photo-plan";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(){return generationApi(async()=>NextResponse.json({configured:photoPlanConfigured()}));}
export async function POST(req:Request){return generationApi(async()=>NextResponse.json(await readPhotoPlan(req)));}
