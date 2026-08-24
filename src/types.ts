// Shared domain types for Planro MCP.

export type NodeType =
  | "province"
  | "county"
  | "district"
  | "ruralDistrict"
  | "city"
  | "village"
  | "place"
  | "camping";

export type NodeState = "research_required" | "in_progress" | "complete";

export type OwnershipStatus =
  | "belongs_to_node"
  | "belongs_to_parent"
  | "belongs_to_child"
  | "nearby_only"
  | "unverified"
  | "rejected";

export interface NodeRecord {
  nodeId: string;
  nodeType: NodeType;
  canonicalName: string;
  parentNodeId: string | null;
  state: NodeState;
}

export interface DiscoveryTask {
  id: string;
  nodeId: string;
  track: string;
  state: "open" | "complete";
}

export interface Candidate {
  id: string;
  provinceId: string;
  nodeId: string;
  name: string;
  entityKind: string;
  query: string;
  sourceUrls: string[];
  reason: string;
  blockingRequirements: string[];
  state: "open" | "resolved";
  outcome?: string;
  createdAt: string;
}

export interface Conflict {
  id: string;
  nodeId: string;
  description: string;
  state: "open" | "resolved";
  resolution?: string;
}

export interface SourceMatrixEntry {
  id: string;
  nodeId: string;
  query: string;
  sourceUrl: string;
  sourceTitle: string;
  resultSummary: string;
  ownershipStatus: OwnershipStatus;
  discoveredNames?: string[];
}

export interface RegistryEntry {
  id: string;
  slug: string;
  path: string;
  status: "active" | "pending";
  name: string;
  type: string;
  subType?: string;
}

export interface ResearchCoverageEntry {
  entity: string;
  sites: string;
  queryCodes: string;
  resultSummary: string;
}

export interface NotesState {
  provinceId: string;
  lastUpdate: string;
  scopeStatus: "in_progress" | "complete";
  nodes: NodeRecord[];
  discoveryTasks: DiscoveryTask[];
  candidates: Candidate[];
  conflicts: Conflict[];
  sourceMatrix: SourceMatrixEntry[];
  registry: RegistryEntry[];
  researchCoverage: ResearchCoverageEntry[];
  nextStep: string;
}

export interface QualityError {
  code: string;
  path: string;
  message: string;
}

export interface QualityResult {
  accepted: boolean;
  errors: QualityError[];
  warnings: QualityError[];
}

// A stored entity is a plain JSON document matching place.schema.json.
export type PlaceEntity = Record<string, unknown> & {
  id: string;
  slug: string;
  type: string;
  status: string;
  name: { fa: string; en?: string };
  location: Record<string, unknown>;
  evidence: unknown[];
  sources?: unknown[];
  media?: { thumbnail?: Record<string, unknown>; images?: unknown[] };
  relations?: unknown[];
  costs?: Record<string, unknown>;
  travelChecklist?: Record<string, unknown>;
  alternativeNames?: string[];
};
