import type {HouseDocument} from "./document";
import type {ModelPart} from "../types";

/** Closed roofs share the same metre coordinates in the viewer and all exports. */
export function houseRoofParts(doc: HouseDocument, elevation: number): ModelPart[] {
  const overhang = doc.architecture?.style === "chalet" ? .65 : .3;
  const w = doc.width + 2 * overhang, d = doc.depth + 2 * overhang;
  const h = doc.roof === "flat" ? .2 : doc.architecture?.roofHeight ?? Math.min(3, doc.width * .2);
  const roof: ModelPart = {id: "house_roof", name: "Крыша", role: "roof", group: "roof", shape: "box", size: [w,h,d],
    position: [0,elevation+h/2,0], rotation: [0,0,0], color: doc.architecture?.roofColor ?? "#676d7c", material: "Кровля", roughness: .7, quantity: 1};
  if (doc.roof === "gable") {roof.shape = "prism"; return [roof];}
  if (doc.roof === "shed") {roof.shape = "wedge"; return [roof];}
  if (doc.roof === "flat") return [roof];
  const corners = (scale: number, y: number): number[][] => [[-w/2*scale,y,-d/2*scale],[w/2*scale,y,-d/2*scale],[w/2*scale,y,d/2*scale],[-w/2*scale,y,d/2*scale]];
  const vertices = corners(1,-h/2), triangles: number[][] = [[0,2,1],[0,3,2]];
  if (doc.roof === "hip") {
    const alongX = w >= d, ridge = Math.abs(w-d)/2;
    vertices.push(alongX ? [-ridge,h/2,0] : [0,h/2,-ridge], alongX ? [ridge,h/2,0] : [0,h/2,ridge]);
    // Clockwise footprint, outward faces; a square becomes a four-sided hip roof.
    if (alongX) triangles.push([0,1,5],[0,5,4],[1,2,5],[2,3,4],[2,4,5],[3,0,4]);
    else triangles.push([0,1,4],[1,2,5],[1,5,4],[2,3,5],[3,0,4],[3,4,5]);
  } else {
    vertices.push(...corners(.76,h*.05), ...corners(.62,h/2));
    for (let i=0;i<4;i++) {const n=(i+1)%4; triangles.push([i,n,n+4],[i,n+4,i+4],[i+4,n+4,n+8],[i+4,n+8,i+8]);}
    triangles.push([8,9,10],[8,10,11]);
  }
  // Square hips must not contain zero-area triangles where the ridge ends coincide.
  const valid = triangles.filter(([a,b,c]) => {
    const u=vertices[b].map((n,i)=>n-vertices[a][i]),v=vertices[c].map((n,i)=>n-vertices[a][i]);
    return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]) > 1e-8;
  });
  roof.shape = "mesh"; roof.mesh = {position: valid.flatMap(([a,b,c])=>[a,c,b].flatMap(i=>vertices[i]))};
  return [roof];
}
