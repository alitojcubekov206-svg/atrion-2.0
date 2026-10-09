/** Route the subject, not a room mentioned inside a house or beside an object. */
export function designPromptTarget(prompt: string): "interior" | "model" {
  const subject = prompt.toLowerCase().split(/\s+(?:с|со|with|рядом|возле|для|внутри|в|in)\s+|[:;.!?]/u)[0];
  const building = /(?:^|\s)(?:дом[а-яё]*|коттедж[а-яё]*|здани[а-яё]*|школ[а-яё]*|замок[а-яё]*|house|building|castle|school)(?=\s|[,;.!?:]|$)/u.exec(subject);
  const room = /спальн|гостин|кабинет|комнат|интерьер|bedroom|living\s*room|office|interior|\broom\b/i.exec(subject);
  if (building && (!room || building.index < room.index)) return "model";
  if (room) return "interior";
  // Keep the established furniture-list workflow; a single chair is a model.
  const furniture = prompt.match(/кроват\S*|диван\S*|шкаф\S*|стол\S*|стул\S*|кресл\S*|торшер\S*|растени\S*|светильник\S*|пуф\S*|комод\S*|стеллаж\S*|\b(?:bed|sofa|chair|desk|lamp|wardrobe|plant)\b/gi);
  if ((furniture?.length ?? 0) >= 2 && !/\s(?:с|with|возле|рядом)\s/i.test(prompt) && /[,;]|\s(?:и|and)\s/i.test(prompt)) return "interior";
  return "model";
}
