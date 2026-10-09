export type BriefAnswer = {questionId: string; question?: string; answer: string};
export type BriefQuestion = {id: string; text: string; hint: string; options: string[]};
export type Clarification = {kind: "clarification"; question: BriefQuestion; answers: BriefAnswer[]; understood: string[]; source?: "local-ai"};
export type HouseBrief = {width: number; depth: number; floors: number; rooms: string[]; roof: import("../house/architecture").HouseRoof; wallColor: string; footprint?: import("../house/footprint").HouseFootprint; furnished?: boolean; description?: string; architecture?: import("../house/architecture").HouseArchitecture; automaticArchitecture?: boolean; automaticRoof?: boolean; automaticWallColor?: boolean};
export type ReadyBrief = {kind: "ready"; prompt: string; answers: BriefAnswer[]; understood: string[]; assumptions: string[]; house?: HouseBrief};
export type DesignBrief = Clarification | ReadyBrief;
