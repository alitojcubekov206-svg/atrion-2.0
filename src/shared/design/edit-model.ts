import type {LocalModelResult} from "./result";
import type {ModelPart} from "../types";
import {check} from "./validation";
import {compositionParts, compositionIssues, parseComposition} from "./composition";
import {dimensionsOf,structureFromGroups} from "../geometry";

export function removeModelPart(result:LocalModelResult,id:string):LocalModelResult {
  check(!result.document,"Мебель дома редактируется через комнату");
  const index=result.concept.parts.findIndex(p=>p.id===id);
  check(index>=0,"Деталь не найдена");
  check(result.concept.parts.length>1,"Последнюю деталь нельзя удалить. Создайте новую модель.");
  const composition=result.composition?parseComposition({...result.composition,nodes:result.composition.nodes.filter((_,i)=>i!==index)}):undefined;
  const parts=composition?compositionParts(composition):result.concept.parts.filter(p=>p.id!==id);
  return {...result,composition,concept:{...result.concept,parts,dimensions:dimensionsOf(parts),structure:structureFromGroups(parts)}};
}

/** Apply the same transforms to the displayed model, exported geometry and quantities. */
export function editModelPart(result:LocalModelResult,id:string,patch:Partial<ModelPart>):LocalModelResult {
  check(!result.document,"Мебель дома редактируется через комнату");
  const existing=result.concept.parts.find(p=>p.id===id);check(existing,"Деталь не найдена");
  const part={...existing,...patch,id:existing.id};
  for(const [label,vector] of [["Положение",part.position],["Размер",part.size],["Поворот",part.rotation??[0,0,0]]] as const) {
    check(vector.length===3&&vector.every(Number.isFinite),`${label}: нужны три конечных числа`);
    check(vector.every(n=>Math.abs(n)<=1000),`${label}: значение слишком велико`);
  }
  check(part.size.every(n=>n>=.01),"Размер должен быть не меньше 0,01 м");
  let composition=result.composition,parts=result.concept.parts.map(p=>p.id===id?part:p);
  if(composition) {
    const index=parts.findIndex(p=>p.id===id),nodes=composition.nodes.map((node,i)=>i===index?{...node,p:part.position,s:part.size,r:(part.rotation??[0,0,0]).map(n=>n*180/Math.PI),color:part.color}:node);
    composition=parseComposition({...composition,nodes});
    const issues=compositionIssues(composition);check(!issues.length,issues.join(" "));
    parts=compositionParts(composition);
  }
  return {...result,composition,concept:{...result.concept,parts,dimensions:dimensionsOf(parts),structure:structureFromGroups(parts)}};
}
