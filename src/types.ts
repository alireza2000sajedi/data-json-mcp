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

export type NodeState = "research_required" | "in_progress" | "media_deficit" | "complete";

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
  /** Declared number of child units discovered for this track (e.g. 10 counties). */
  declaredCount?: number;
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

/**
 * Auditable disposition for an entity-bearing node that could not meet the
 * active-entity media requirement (10–20 free-license images) after an
 * exhaustive search (prompt §9). The node is CLOSED without a JSON file;
 * "recorded" is a terminal, non-blocking state. Saving an active entity for
 * the same node later flips it to "resolved" (promoted_to_active).
 */
export interface MediaDeficitRecord {
  id: string;
  nodeId: string;
  reason: string;
  /** Always carries "insufficient_verifiable_media". */
  blockingRequirements: string[];
  /** Number of distinct, attributable, free-license images actually found (0–9). */
  imagesFound: number;
  /** Archives/queries actually searched (audit trail). */
  searchesPerformed: string[];
  state: "recorded" | "resolved";
  outcome?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ResearchCoverageEntry {
  entity: string;
  sites: string;
  queryCodes: string;
  resultSummary: string;
}

export interface DodStatus {
  lastCheck: string;       // ISO timestamp
  dodComplete: boolean;    // from check_definition_of_done
  validateInvalid: number; // from validate_province
  validateTotal: number;
  issues: string[];        // compact list of blocking issues (max 10)
}

export interface NotesState {
  provinceId: string;
  lastUpdate: string;
  scopeStatus: "in_progress" | "complete";
  /**
   * The currently selected staged scope (a registered nodeId). When set,
   * DFS order and the "current branch" are computed inside that scope's
   * subtree only, so a single scope (county / city / village / place) can be
   * deep-researched, check-pointed and completed without touching ancestors.
   * null = province-wide scope (classic whole-province run).
   */
  activeScopeId: string | null;
  nodes: NodeRecord[];
  discoveryTasks: DiscoveryTask[];
  candidates: Candidate[];
  conflicts: Conflict[];
  sourceMatrix: SourceMatrixEntry[];
  registry: RegistryEntry[];
  researchCoverage: ResearchCoverageEntry[];
  mediaDeficits: MediaDeficitRecord[];
  nextStep: string;
  dodStatus: DodStatus | null;
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
