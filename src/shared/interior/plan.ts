export type PlanMeasurement = {value: number | null; confidence: number; requiresConfirmation: boolean};
export type PlanAnalysis = {units: "m"; rooms: {id: string; name: string; width: PlanMeasurement; length: PlanMeasurement; height: PlanMeasurement}[]; warnings: string[]; requiresConfirmation: true};
export type StoredPlan = {originalKey: string; processedKey: string | null; mime: string; size: number; analysis: PlanAnalysis | null};
