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
  /** Policy classification, filled automatically by record_search_result. */
  sourceClass?: "primary" | "fallback" | "other";
  sourceDomain?: string;
  sourceName?: string;
  sourcePriority?: number;
}

/**
 * A single image found during media discovery (best-effort pipeline,
 * prompt §9). Agents record every candidate they find via
 * record_media_candidate; finalize_media then ranks, deduplicates and picks
 * the best set for save_active_entity. Nothing found is ever discarded just
 * because it is below the target count.
 */
export interface MediaCandidate {
  id: string;
  nodeId: string;
  /** Direct raw HTTPS URL of the image file itself. */
  imageUrl: string;
  /** Page hosting / licensing the image (credit + license context). */
  pageUrl: string;
  source: string;
  credit: string;
  license: string;
  alt: string;
  caption: string;
  /** Agent's relevance/quality score, 0..1 (default 0.5). */
  score: number;
  sourceClass?: "primary" | "fallback" | "other";
  sourceDomain?: string;
  createdAt: string;
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
 * Auditable disposition for an entity-bearing node that is closed WITHOUT a
 * JSON file. Under the best-effort media policy a lack of images alone is NOT
 * a reason to use this path (0 images → save WITHOUT media, status
 * "unavailable"); it is reserved for nodes where no valid entity data at all
 * could be gathered. "recorded" is a terminal, non-blocking state; saving an
 * active entity for the same node later flips it to "resolved".
 */
export interface MediaDeficitRecord {
  id: string;
  nodeId: string;
  reason: string;
  /** Always carries "insufficient_verifiable_media". */
  blockingRequirements: string[];
  /** Audit: number of usable images actually found (0..20). */
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
  mediaCandidates: MediaCandidate[];
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
  sources?: unknown[];
  media?: { thumbnail?: Record<string, unknown>; images?: unknown[] };
  relations?: unknown[];
  travelChecklist?: Record<string, unknown>;
  alternativeNames?: string[];
};
