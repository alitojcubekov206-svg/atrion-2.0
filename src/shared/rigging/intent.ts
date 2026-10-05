/** Route explicit 2D character requests away from the primitive 3D generator. */
export const CHARACTER_GENERATION_UNAVAILABLE="Автоматическая сборка рига персонажа по тексту пока не реализована. Для первого этапа — генерации рисунка — откройте «2D-риггинг». Запрос не отправлен в 3D-генератор; квота не списана.";
export function is2DRiggingRequest(prompt:string):boolean {
  if(/live\s*2\s*d|лайв\s*2\s*д|(?:^|[^a-z])v[ -]?tuber|витубер|втубер/iu.test(prompt))return true;
  const dimension=/(?:^|[^a-zа-я0-9])2\s*[dд](?:$|[^a-zа-я0-9])/iu.test(prompt)||/двумерн|плоск(?:ий|ого) персонаж/iu.test(prompt);
  return dimension&&/риг{1,2}инг|rigg?ing|скелет|персонаж|девуш|парень|анимац/iu.test(prompt);
}
