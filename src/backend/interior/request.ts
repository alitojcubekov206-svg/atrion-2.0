import {parsePromptParams} from "@/backend/gen/prompt-params";
import {parseScene, type InteriorScene} from "@/shared/interior/scene";

/** Preview and queue use the same dimensions; invalid openings stay explicit. */
export function prepareInteriorScene(input: InteriorScene, prompt: string, editing: boolean): InteriorScene {
  const scene = parseScene(input);
  const dims = parsePromptParams(prompt);
  const width = dims.width ?? scene.width, length = dims.depth ?? scene.length, height = dims.height ?? scene.height;
  const lights = scene.lights.map(l => ({...l, position: {
    x: l.position.x / scene.width * width,
    y: l.position.y / scene.height * height,
    z: l.position.z / scene.length * length,
  }}));
  return parseScene({...scene, width, length, height, lights,
    objects: editing ? scene.objects : scene.objects.filter(o => o.locked)});
}
