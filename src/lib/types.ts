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
