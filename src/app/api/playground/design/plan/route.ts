import {NextResponse} from "next/server";
import {photoPlanConfigured,readPhotoPlan} from "@/backend/design/photo-plan";
import {designFailure} from "@/backend/design/http";
export async function GET(){if(process.env.NODE_ENV!=="development")return new NextResponse(null,{status:404});return NextResponse.json({configured:photoPlanConfigured()});}
export async function POST(req:Request){if(process.env.NODE_ENV!=="development")return new NextResponse(null,{status:404});try{return NextResponse.json(await readPhotoPlan(req));}catch(e){return designFailure(e);}}
