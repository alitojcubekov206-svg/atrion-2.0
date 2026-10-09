import sharp from "sharp";
import {randomUUID} from "node:crypto";
import {DesignError, check} from "@/shared/design/validation";
import {assertPlanStorage, putPlanFile, deletePlanFile} from "./cloudflare";
const MB = 1024 * 1024;
/** Stream limit applies even without Content-Length; caller authorizes before reading. */
export async function readPlanBytes(req: Request): Promise<{bytes: Buffer; mime: string; extension: string}> {
  const mime = req.headers.get("content-type")?.split(";")[0] ?? "";
  const extension = ({"image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf", "image/svg+xml": "svg"} as Record<string,string>)[mime];
  if (!extension) throw new DesignError("Нужен PNG, JPEG, PDF или SVG", 415, "DESIGN_FILE_TYPE");
  const limit = mime === "application/pdf" ? 25 * MB : 15 * MB;
  if (Number(req.headers.get("content-length")) > limit) throw new DesignError("План превышает лимит размера", 413, "DESIGN_FILE_TOO_LARGE");
  if (!req.body) throw new DesignError("Файл отсутствует");
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try {while (true) {const {done, value} = await reader.read(); if (done) break; total += value.length; if (total > limit) {await reader.cancel(); throw new DesignError("План превышает лимит размера", 413, "DESIGN_FILE_TOO_LARGE");} chunks.push(value);}}
  finally {reader.releaseLock();}
  const bytes = Buffer.concat(chunks);
  const valid = mime === "image/png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mime === "application/pdf" ? bytes.subarray(0,5).toString() === "%PDF-" : /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(bytes.toString("utf8"));
  check(valid, "Содержимое не соответствует типу файла");
  if (mime === "image/svg+xml") check(!/<!|<\s*(?:script|foreignObject|image|use)\b|\b(?:href|on\w+)\s*=|url\s*\(|@import/i.test(bytes.toString("utf8")), "SVG содержит внешние ссылки или активное содержимое");
  return {bytes, mime, extension};
}
export async function uploadPlan(req: Request, projectId: string) {
  assertPlanStorage();
  const {bytes, mime, extension} = await readPlanBytes(req), folder = `plans/${projectId}/${randomUUID()}`;
  const originalKey = `${folder}/original.${extension}`, processedKey = mime === "application/pdf" ? null : `${folder}/processed.jpg`;
  // Decode before uploading; cap decompressed pixels to reject image bombs.
  let preview: Buffer | undefined;
  if (processedKey) {
    try {preview = await sharp(bytes, {limitInputPixels: 24_000_000, failOn: "error"}).rotate().resize({width: 1600, height: 1600, fit: "inside", withoutEnlargement: true}).flatten({background: "#ffffff"}).jpeg({quality: 85}).toBuffer();}
    catch {throw new DesignError("Изображение повреждено или превышает допустимое разрешение", 400, "DESIGN_INVALID_IMAGE");}
    check(preview.length <= 3 * MB, "Обработанный план слишком большой");
  }
  try {await putPlanFile(originalKey, bytes, mime); if (preview && processedKey) await putPlanFile(processedKey, preview, "image/jpeg");}
  catch (error) {await Promise.allSettled([deletePlanFile(originalKey), ...(processedKey ? [deletePlanFile(processedKey)] : [])]); throw error;}
  return {originalKey, processedKey, mime, size: bytes.length, analysis: null};
}
