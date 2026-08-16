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

/**
 * Primitive vocabulary for procedural / AI-authored geometry.
 *
 * `size` is ALWAYS the full bounding box of the primitive in local axes —
 * [width(x), height(y), depth(z)] — measured before `rotation` is applied.
 * This one rule holds for every shape, so positions and sizes stay easy to
 * reason about for both the generators and the model.
 */
export type PartShape =
  /** Rectangular block. */
  | "box"
  /** Vertical cylinder; elliptical when x and z differ. */
  | "cylinder"
  /** Ellipsoid. */
  | "sphere"
  /** Cone, apex up. */
  | "cone"
  /** Square-base pyramid, apex up (hip roofs, spires). */
  | "pyramid"
  /** Triangular prism, ridge along z at top centre (gable roofs). */
  | "prism"
  /** Right-triangle prism rising along +x (ramps, single-slope roofs). */
  | "wedge"
  /** Ring lying in the xz plane (tyres, rims, hoops). */
  | "torus"
  /** Cylinder with hemispherical caps (limbs, bottles). */
  | "capsule"
  /** Hollow cylinder — see `hole` (pipes, railings, window frames). */
  | "tube"
  /** Thin slab (glass panes, floors, signage). */
  | "plane"
  /** Baked triangle soup — the result of a boolean operation. See `mesh`. */
  | "mesh";

/** Linear array of copies — window rows, columns, fence posts, stair treads. */
export interface PartRepeat {
  /** Total instances including the original, 2–64. */
  count: number;
  /** Offset applied per successive instance. */
  step: [number, number, number];
  /** Optional extra rotation per successive instance (radians). */
  rotationStep?: [number, number, number];
}

export interface ModelPart {
  id: string;
  name: string;
  shape: PartShape;
  position: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  color: string;
  material: string;
  quantity: number;
  /** Semantic role for structure tree, e.g. foundation, wall, roof, window */
  role?: string;
  /** Optional parent part id for hierarchy */
  parentId?: string | null;
  /** Group label shown in the structure tree */
  group?: string;
  /** Radial or base segment count for cylinder, cone, pyramid, tube, torus (3–64). */
  sides?: number;
  /** Inner/outer radius ratio for `tube`, tube thickness ratio for `torus` (0–0.95). */
  hole?: number;
  /** Repeat this part along a direction instead of duplicating it by hand. */
  repeat?: PartRepeat;
  /** Mirror copies across the model axes. */
  mirror?: "x" | "z" | "xz";
  /** 0–1, below 1 renders translucent (glass, water). */
  opacity?: number;
  /** 0–1 PBR metalness override. */
  metalness?: number;
  /** 0–1 PBR roughness override. */
  roughness?: number;
  /** 0–1 self-illumination (screens, lamps, neon). */
  emissive?: number;
  /**
   * Baked geometry for `shape: "mesh"`. Vertices are in the part's own frame,
   * centred on its origin and already at real size — `size` mirrors the
   * bounding box so bounds, snapping and the CAD gizmo keep working.
   */
  mesh?: {
    position: number[];
    normal?: number[];
  };
}

export interface ThreeDConcept {
  name: string;
  description: string;
  units: "m" | "cm" | "mm";
  dimensions: { width: number; height: number; depth: number };
  parts: ModelPart[];
  structure?: { id: string; label: string; partIds: string[] }[];
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
  /** Detected object category, e.g. "house", "character". */
  category?: string;
  /** Prompt-derived seed — same prompt reproduces the same model. */
  seed?: number;
  /** Where the geometry came from. */
  source?: "procedural" | "ai";
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
