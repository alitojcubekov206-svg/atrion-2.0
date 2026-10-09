import {parsePromptParams} from "../gen/prompt-params";
import {rngFor} from "../../shared/geometry";
import type {HouseArchitecture, HouseRoof, HouseStyle} from "../../shared/house/architecture";

const PROFILES: Record<HouseStyle, {roof: HouseRoof; wall: string; roofColor: string; frame: string; door: string; panoramic?: boolean}> = {
  modern: {roof: "flat", wall: "#eeeae2", roofColor: "#424951", frame: "#30383e", door: "#80583c", panoramic: true},
  scandinavian: {roof: "gable", wall: "#e9e4db", roofColor: "#444b50", frame: "#393f42", door: "#a47850"},
  chalet: {roof: "gable", wall: "#c9a27c", roofColor: "#615143", frame: "#523c2b", door: "#6e4930"},
  classic: {roof: "hip", wall: "#e6d8c0", roofColor: "#715047", frame: "#eee9df", door: "#534333"},
  brick: {roof: "gable", wall: "#ac6d53", roofColor: "#48494b", frame: "#ddd7ca", door: "#473d37"},
};
// Colours belong to the named element, not to every part of the building.
export function houseElementColor(prompt: string, element: string): string | undefined {
  const match = new RegExp(`(?:#[0-9a-f]{6}|[а-яёa-z-]+)\\s+(?:${element})[а-яёa-z]*|(?:${element})[а-яёa-z]*(?:\\s+(?:цвета?|из))?\\s+(?:#[0-9a-f]{6}|[а-яёa-z-]+)`, "gi");
  let result: string | undefined;
  for (const m of prompt.matchAll(match)) result = m[0].match(/#[0-9a-f]{6}/i)?.[0] ?? parsePromptParams(m[0]).color ?? result;
  return result;
}
export function houseArchitecture(prompt: string, width: number, depth: number, variant = "") {
  const rng = rngFor(prompt, variant);
  const explicitStyle: HouseStyle | undefined = /шале|chalet|деревян|брус|бревен|timber/i.test(prompt) ? "chalet"
    : /классичес|неокласс|classic/i.test(prompt) ? "classic" : /кирпич|brick|лофт|loft/i.test(prompt) ? "brick"
    : /сканди|scandi/i.test(prompt) ? "scandinavian" : /современ|модерн|минимал|хай.?тек|modern|minimal/i.test(prompt) ? "modern" : undefined;
  const style = explicitStyle ?? (variant ? rng.pick<HouseStyle>(["modern", "scandinavian", "classic"]) : "scandinavian"), profile = PROFILES[style];
  const roof = parsePromptParams(prompt).roof ?? profile.roof;
  const windows = /маленьк[а-яё]*\s+окн|небольш[а-яё]*\s+окн|small windows/i.test(prompt) ? "small"
    : /панорам|витраж|больш[а-яё]*\s+окн|окн[а-яё]*\s+(?:в пол|от пола)|panoramic|large windows/i.test(prompt) ? "panoramic"
    : /обычн[а-яё]*\s+окн|standard windows/i.test(prompt) ? "standard" : profile.panoramic ? "panoramic" : "standard";
  const windowSize = /(?:окн[а-яё]*|windows?)\s*(?:размер[а-яё]*|ширин[а-яё]*)?\s*(\d+(?:[.,]\d+)?)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)/i.exec(prompt);
  const architecture: HouseArchitecture = {style, windows, windowWidth: windowSize ? Number(windowSize[1].replace(",", ".")) : windows === "panoramic" ? 2.4 : windows === "small" ? .8 : 1.45,
    windowHeight: windowSize ? Number(windowSize[2].replace(",", ".")) : windows === "panoramic" ? 2.1 : windows === "small" ? 1 : 1.45,
    windowSpacing: /много\s+окон|част[а-яё]*\s+окн|many windows/i.test(prompt) ? 2.3 : windows === "panoramic" ? 3.5 : 3,
    roofHeight: Math.min(4.5, Math.max(.5, Math.min(width, depth) * (style === "chalet" ? .34 : roof === "shed" ? .16 : variant ? rng.float(.22, .29) : .25))),
    roofColor: houseElementColor(prompt, "крыш|кровл|roof") ?? profile.roofColor,
    frameColor: houseElementColor(prompt, "рам|frames?") ?? profile.frame,
    doorColor: houseElementColor(prompt, "двер|doors?") ?? profile.door,
    porch: !/без\s+(?:крыльц|навес)|no porch/i.test(prompt)};
  // A bare building colour still works; roof/door/furniture colours never recolour its walls.
  const wallColor = houseElementColor(prompt, "фасад|стен|дом|house|walls?") ?? profile.wall;
  return {architecture, roof, wallColor, explicitStyle};
}
