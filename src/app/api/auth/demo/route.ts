import { NextResponse } from "next/server";

// Keep obsolete links inert, including deployments with the old flag still set.
export async function GET(_req: Request) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
