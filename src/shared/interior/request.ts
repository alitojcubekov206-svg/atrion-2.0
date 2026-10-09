/** Route the subject, not a room mentioned inside a house or beside an object. */
export function designPromptTarget(prompt: string): "interior" | "model" {
  const subject = prompt.toLowerCase().split(/\s+(?:с|со|with|рядом|возле|для|внутри|в|in)\s+|[:;.!?]/u)[0];
  if (/офисн[а-яё]*\s+здани|office\s+building/i.test(subject)) return "model";
  const building = /(?:^|\s)(?:дом[а-яё]*|коттедж[а-яё]*|здани[а-яё]*|школ[а-яё]*|замок[а-яё]*|house|building|castle|school)(?=\s|[,;.!?:]|$)/u.exec(subject);
  // Kitchens, bathrooms, kids' rooms and halls are rooms too; they used to fall through to a
  // single procedural object. "кухонный стол" and "детская кроватка" stay single objects.
  const room = /спальн|гостин|кабинет|офис|комнат|интерьер|кухн[яиюеё]|ванн(?:ая|ую|ой)\b|санузел|санузл|туалет|детск(?:ая|ую|ой)(?!\s+(?:кроват|стул|стол|игрушк|площадк))|столов(?:ая|ую|ой)(?!\s+(?:прибор|ложк))|прихож|коридор|bedroom|living\s*room|kitchen|bathroom|nursery|dining\s*room|hallway|office|interior|\broom\b/i.exec(subject);
  if (building && (!room || building.index < room.index)) return "model";
  if (room) return "interior";
  // Keep the established furniture-list workflow; a single chair is a model.
  const furniture = prompt.match(/кроват\S*|диван\S*|шкаф\S*|стол\S*|стул\S*|кресл\S*|торшер\S*|растени\S*|светильник\S*|пуф\S*|комод\S*|стеллаж\S*|\b(?:bed|sofa|chair|desk|lamp|wardrobe|plant)\b/gi);
  if ((furniture?.length ?? 0) >= 2 && !/\s(?:с|with|возле|рядом)\s/i.test(prompt) && /[,;]|\s(?:и|and)\s/i.test(prompt)) return "interior";
  return "model";
}
