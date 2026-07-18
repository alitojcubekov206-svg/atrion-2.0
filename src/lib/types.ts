export interface InterviewQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface InterviewState {
  questions: InterviewQuestion[];
  answers: Record<string, string>;
}

export interface StackLayer {
  layer: string; // e.g. "Frontend", "Backend", "Database", "AI", "Storage"
  technologies: string[];
  reason: string;
}

export interface DbTable {
  name: string;
  fields: { name: string; type: string; note?: string }[];
}

export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
}

export interface RoadmapPhase {
  phase: string;
  title: string;
  duration: string;
  tasks: string[];
}

export interface ProjectScore {
  innovation: number;
  difficulty: number;
  market: number;
  cost: string; // e.g. "$5k–$15k"
  risk: "Low" | "Medium" | "High";
  explanation: string;
}

export interface Competitor {
  name: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
}

export interface Blueprint {
  overview: {
    name: string;
    tagline: string;
    description: string;
    audience: string;
    problem: string;
    solution: string;
  };
  discovery: {
    productType: string;
    targetUsers: string;
    problemSolved: string;
    competitors: Competitor[];
    potential: string;
  };
  architecture: StackLayer[];
  database: DbTable[];
  api: ApiEndpoint[];
  roadmap: RoadmapPhase[];
  score: ProjectScore;
  critique: string[]; // honest criticism from AI Critic Mode
  risks: { risk: string; severity: "Low" | "Medium" | "High"; mitigation: string }[];
}

export interface ModelPart {
  id: string;
  name: string;
  shape: "box" | "cylinder";
  position: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  color: string;
  material: string;
  quantity: number;
}

export interface ThreeDConcept {
  name: string;
  description: string;
  units: "m" | "cm" | "mm";
  dimensions: { width: number; height: number; depth: number };
  parts: ModelPart[];
  materials: {
    name: string;
    specification: string;
    estimatedQuantity: string;
    reason: string;
  }[];
  equipment: {
    name: string;
    purpose: string;
    access: "buy" | "rent" | "specialist";
  }[];
  requirements: string[];
  assemblySteps: string[];
  costEstimate: {
    currency: string;
    minimum: number;
    maximum: number;
    breakdown: {
      item: string;
      quantity: string;
      estimatedCost: number;
    }[];
    note: string;
  };
  advantages: string[];
  disadvantages: string[];
  risks: {
    risk: string;
    severity: "Low" | "Medium" | "High";
    mitigation: string;
  }[];
  engineeringNotes: string[];
  disclaimer: string;
}

export type ExpertRole =
  | "architect"
  | "programmer"
  | "product"
  | "security"
  | "critic";

export interface ExpertReply {
  answer: string;
  actionItems: string[];
  warnings: string[];
}

export interface StarterKit {
  summary: string;
  files: {
    path: string;
    language: string;
    content: string;
  }[];
  nextSteps: string[];
}
