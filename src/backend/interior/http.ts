import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {designAuth} from "@/backend/design/http";
import {DesignError} from "@/shared/design/validation";
export {readDesignBody} from "@/backend/design/body";
export async function interiorApi(run: (userId: string) => Promise<Response>) {
  const requestId = randomUUID();
  try {
    const auth = await designAuth();
    if (auth.response) {
      const data = await auth.response.json();
      return NextResponse.json({error: {code: data.code ?? "AUTH_REQUIRED", message: data.error, requestId}}, {status: auth.response.status, headers: auth.response.headers});
    }
    const response = await run(auth.userId);
    response.headers.set("Cache-Control", "private, no-store"); response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    const known = error instanceof DesignError;
    console.error("Interior request failed", {requestId, code, kind: error instanceof Error ? error.name : "UnknownError"});
    return NextResponse.json({error: {requestId, code: known ? error.code : code === "P2021" || code === "P2022" ? "DATABASE_SCHEMA_NOT_READY" : "DESIGN_SERVICE_ERROR",
      message: known ? error.message : code === "P2021" || code === "P2022" ? "Схема Дизайна ещё не установлена на сервере" : "Сервис дизайна временно недоступен"}}, {status: known ? error.status : code === "P2021" || code === "P2022" ? 503 : 500});
  }
}
