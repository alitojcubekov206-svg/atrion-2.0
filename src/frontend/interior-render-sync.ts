import {Group} from "three";
import {detailedAsset, disposeDetailed} from "@/shared/interior/detailed";
import type {SceneObject} from "@/shared/interior/scene";

export type RenderItem = {object: SceneObject; offset: [number, number, number]};
/** Own each item's resources independently. A move updates matrices, not geometry. */
export function syncInteriorObjects(root: Group, items: RenderItem[]) {
  const existing = new Map(root.children.filter(n => n.userData.editableFurniture).map(n => [n.userData.objectId as string, n as Group]));
  for (const {object: item, offset} of items) {
    let holder = existing.get(item.id);
    existing.delete(item.id);
    if (!holder) {
      holder = new Group(); holder.name = item.id;
      holder.userData = {objectId: item.id, editableFurniture: true}; root.add(holder);
    }
    const signature = `${item.assetId}:${item.color}`;
    if (holder.userData.assetSignature !== signature) {
      disposeDetailed(holder); holder.clear();
      holder.add(detailedAsset(item.assetId, item.color));
      holder.userData.assetSignature = signature;
    }
    holder.position.set(item.position.x + offset[0], item.position.y + offset[1], item.position.z + offset[2]);
    holder.rotation.y = item.rotation.y; holder.scale.set(item.scale.x, item.scale.y, item.scale.z);
    holder.userData.locked = item.locked;
  }
  for (const holder of existing.values()) {root.remove(holder); disposeDetailed(holder);}
  root.updateMatrixWorld(true);
}
