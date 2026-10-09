export type BriefAnswer = {questionId: string; question?: string; answer: string};
export type BriefQuestion = {id: string; text: string; hint: string; options: string[]};
export type Clarification = {kind: "clarification"; question: BriefQuestion; answers: BriefAnswer[]; understood: string[]; source?: "local-ai"};
/** Decisions the user left to Atrion; each generation may choose them differently. */
export type HouseAutoChoices = {size?: boolean; roof?: boolean; color?: boolean};
export type HouseBrief = {width: number; depth: number; floors: number; rooms: string[]; roof: "flat" | "gable"; wallColor: string; furnished?: boolean; description?: string; auto?: HouseAutoChoices};
export type ReadyBrief = {kind: "ready"; prompt: string; answers: BriefAnswer[]; understood: string[]; assumptions: string[]; house?: HouseBrief};
export type DesignBrief = Clarification | ReadyBrief;
