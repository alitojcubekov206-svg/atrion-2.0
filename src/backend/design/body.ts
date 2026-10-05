import { DesignError, record } from "./validation";

export const MAX_DESIGN_BODY_BYTES = 1024 * 1024;

/** Enforce the limit while reading, including requests without Content-Length. */
export async function readDesignBody(req: Request): Promise<Record<string,unknown>> {
  if (Number(req.headers.get("content-length")) > MAX_DESIGN_BODY_BYTES) {
    throw new DesignError("Документ превышает 1 MiB",413,"DOCUMENT_TOO_LARGE");
  }
  if (!req.body) throw new DesignError("Требуется JSON-тело",400,"INVALID_REQUEST");
  const reader = req.body.getReader();
  const decoder = new TextDecoder("utf-8",{fatal:true});
  let bytes=0, raw="";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes+=chunk.value.byteLength;
      if (bytes>MAX_DESIGN_BODY_BYTES) {
        await reader.cancel();
        throw new DesignError("Документ превышает 1 MiB",413,"DOCUMENT_TOO_LARGE");
      }
      raw+=decoder.decode(chunk.value,{stream:true});
    }
    raw+=decoder.decode();
    return record(JSON.parse(raw),"body");
  } catch(error) {
    if (error instanceof DesignError) throw error;
    throw new DesignError("Некорректный JSON",400,"INVALID_REQUEST");
  } finally { reader.releaseLock(); }
}
