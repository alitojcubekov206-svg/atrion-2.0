import {newScene, type InteriorScene, type SceneObject} from "./scene";
const object = (id: string, assetId: string, x: number, z: number, color: string, angle = 0): SceneObject => ({id, assetId, position:{x,y:0,z}, rotation:{x:0,y:angle,z:0}, scale:{x:1,y:1,z:1}, locked:false, color});
export const ROOM_TEMPLATES = [
  {id:"bedroom", name:"Тёплая спальня", description:"Дуб · лён · мягкий свет", scene:{...newScene(4.8,5.6,2.8,"japandi","bedroom"), objects:[
    object("bed","bed_double",2.4,1.16,"#b9aa91"), object("wardrobe","wardrobe_double",4.44,1.8,"#d5c9b5",-Math.PI/2),
    object("desk","desk_work",.39,1.5,"#b39977",Math.PI/2), object("chair","armchair_soft",3.5,4.2,"#b4b19b"),
    object("lamp","lamp_floor",4.3,4.3,"#e3d5ba"), object("plant","plant_pot",4.25,.4,"#a88a63"),
  ]} as InteriorScene},
  {id:"living", name:"Светлая гостиная", description:"Мягкая мебель · дерево · зелень", scene:{...newScene(5.6,5.2,2.9,"scandinavian","living"), objects:[
    object("sofa","sofa_compact",2.8,.65,"#d1c7b5"), object("coffee","table_coffee",2.8,1.75,"#a78b69"),
    object("armchair","armchair_soft",4.7,2.2,"#94a18b",-Math.PI/2), object("books","bookcase_open",.27,1.6,"#b89e77",Math.PI/2),
    object("console","console_slim",2.8,4.93,"#b19776",Math.PI), object("lamp","lamp_floor",4.8,4.3,"#eee1c9"),
    object("plant","plant_pot",.75,.5,"#a28564"),
  ]} as InteriorScene},
] as const;
export function templateScene(id: string): InteriorScene {
  const template = ROOM_TEMPLATES.find(t => t.id === id);
  if (!template) throw new Error("Шаблон не найден");
  return structuredClone(template.scene);
}
