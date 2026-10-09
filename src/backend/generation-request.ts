import {planFor} from "./procedural-3d";
import {parsePromptParams, type PromptParams} from "./gen/prompt-params";
import {check, list, record, text} from "@/shared/design/validation";

export type GenerationAnswer = {question: string; answer: string};
export function readGenerationRequest(raw: unknown) {
  const body=record(raw,"Запрос"),prompt=text(body.prompt,"Описание",1500);
  check(prompt.length>=3,"Укажите название объекта — минимум 3 символа.");
  const answers=list(body.answers??[],"Ответы",10).map(value=>{
    const a=record(value,"Ответ");
    return {question:text(a.question,"Вопрос",500),answer:text(a.answer,"Ответ",500)};
  });
  check(prompt.length+answers.reduce((n,a)=>n+a.question.length+a.answer.length,0)<=6500,"Диалог слишком длинный");
  return {prompt,answers};
}

/** Questions label short values; their example words and budget numbers are not geometry. */
function geometryAnswer({question,answer}:GenerationAnswer):string {
  if(/бюджет|стоимост|цен[аыу]|budget|cost|price/i.test(question))return "";
  if(/^\d+(?:[.,]\d+)?(?:\s*(?:м|см|мм|метр[а-яё]*|m|cm|mm))?$/i.test(answer)) {
    if(/этаж|уровн|floors?|storeys?/i.test(question))return `${answer} этажей`;
    const axis=/ширин|width/i.test(question)?"ширина":/длин|глубин|length|depth/i.test(question)?"длина":/высот|рост|height/i.test(question)?"высота":null;
    if(axis)return `${axis} ${answer}`;
  }
  return answer;
}
export function generationPlan(prompt:string,answers:GenerationAnswer[]=[],variant="") {
  const clauses=answers.map(geometryAnswer).filter(Boolean);
  const overrides:Partial<PromptParams>={};
  for(const clause of clauses) {
    const parsed=parsePromptParams(clause);
    // A later labelled dimension supersedes an earlier unlabelled overall size.
    if(parsed.size===undefined&&(parsed.width!==undefined||parsed.depth!==undefined||parsed.height!==undefined))overrides.size=undefined;
    for(const key of ["width","depth","height","size","floors","roof","count"] as const)
      if(parsed[key]!==undefined)Object.assign(overrides,{[key]:parsed[key]});
  }
  if(overrides.width!==undefined||overrides.depth!==undefined||overrides.height!==undefined||overrides.size!==undefined)overrides.hasExplicitSize=true;
  const source=clauses.length?`${prompt}. ${clauses.join(". ")}`:prompt;
  return planFor(source,variant,overrides);
}
