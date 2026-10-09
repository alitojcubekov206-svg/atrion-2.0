import {check, choice, number, record, text} from "../design/validation";

export const HOUSE_ROOFS = ["flat", "gable", "hip", "shed", "mansard"] as const;
export type HouseRoof = typeof HOUSE_ROOFS[number];
export const HOUSE_STYLES = ["modern", "scandinavian", "chalet", "classic", "brick"] as const;
export type HouseStyle = typeof HOUSE_STYLES[number];
export type HouseArchitecture = {
  style: HouseStyle;
  windows: "standard" | "panoramic" | "small";
  windowWidth: number;
  windowHeight: number;
  windowSpacing: number;
  roofHeight: number;
  roofColor: string;
  frameColor: string;
  doorColor: string;
  porch: boolean;
};
export function parseHouseArchitecture(input: unknown): HouseArchitecture {
  const a = record(input, "architecture");
  const color = (key: string) => {const v = text(a[key], key); check(/^#[0-9a-f]{6}$/i.test(v), `${key}: ожидается #RRGGBB`); return v;};
  check(typeof a.porch === "boolean", "porch: ожидается boolean");
  return {style: choice(a.style, HOUSE_STYLES, "style"), windows: choice(a.windows, ["standard", "panoramic", "small"] as const, "windows"),
    windowWidth: number(a.windowWidth, "windowWidth", .4, 8), windowHeight: number(a.windowHeight, "windowHeight", .4, 5),
    windowSpacing: number(a.windowSpacing, "windowSpacing", .5, 12), roofHeight: number(a.roofHeight, "roofHeight", .2, 6),
    roofColor: color("roofColor"), frameColor: color("frameColor"), doorColor: color("doorColor"), porch: a.porch};
}
