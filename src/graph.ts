import { readNotes, findMediaDeficit } from "./notes.js";
import { listEntities, ENTITY_NODE_TYPES } from "./dataset.js";
import type { NotesState, NodeType, NodeRecord, DiscoveryTask } from "./types.js";

/** Fixed required-discovery mapping per node type. */
export const REQUIRED_DISCOVERY: Record<NodeType, string[]> = {
  province: ["counties", "provincePlaces", "camping"],
  county: ["districts", "ruralDistricts", "cities", "villages", "countyPlaces", "camping"],
  district: ["ruralDistricts", "cities", "villages", "places"],
  ruralDistrict: ["villages", "places"],
  city: ["places", "camping"],
  village: ["places", "camping"],
  place: [],
  camping: [],
};

/**
 * Which child node type a discovery track enumerates. Used to verify that a
 * completed track's declared count matches the nodes actually registered.
 */
export const TRACK_CHILD_TYPE: Record<string, NodeType> = {
  counties: "county",
  districts: "district",
  ruralDistricts: "ruralDistrict",
  cities: "city",
  villages: "village",
  provincePlaces: "place",
  countyPlaces: "place",
  places: "place",
  camping: "camping",
};

/** Depth-first sibling ordering (province → county → district → ruralDistrict → city → village → place → camping). */
const NODE_TYPE_ORDER: NodeType[] = [
  "province",
  "county",
  "district",
  "ruralDistrict",
  "city",
  "village",
  "place",
  "camping",
];

export function nodeTypeOrder(t: NodeType): number {
  return NODE_TYPE_ORDER.indexOf(t);
}

/**
 * Priority of a child node type *given its parent's type*.
 *
 * A node's own places/campsites are visited before descending into its child
 * administrative units, matching the mandatory completion order in the prompt:
 *
 *   province → province-level places/camping → counties
 *   county   → districts → ruralDistricts → county-level places → cities → villages → camping
 *   district → ruralDistricts → cities → villages → places → camping
 *   ruralDistrict → villages → places → camping
 *   city     → city-level places → villages → camping
 *   village  → village-level places → camping
 */
/**
 * Priority of a child node type *given its parent's type*.
 *
 * Strict DFS order: complete each node's own places/campsites, then descend
 * into administrative children in hierarchy order. County-level places come
 * AFTER all administrative children (cities, villages) are fully processed.
 *
 *   province → province places → province camping → counties
 *   county   → districts → ruralDistricts → cities → villages → county places → county camping
 *   district → ruralDistricts → cities → villages → places → camping
 *   ruralDistrict → villages → places → camping
 *   city     → city places → city camping
 *   village  → village places → village camping
 */
function siblingPriority(parentType: NodeType | null, childType: NodeType): number {
  let order: Partial<Record<NodeType, number>>;
  switch (parentType) {
    case "province":
      order = { place: 0, camping: 1, county: 2 };
      break;
    case "county":
      // Districts first (structure), then cities, then villages, then county-level places last
      order = { district: 0, ruralDistrict: 1, city: 2, village: 3, place: 4, camping: 5 };
      break;
    case "district":
      order = { ruralDistrict: 0, city: 1, village: 2, place: 3, camping: 4 };
      break;
    case "ruralDistrict":
      order = { village: 0, place: 1, camping: 2 };
      break;
    case "city":
      // City places first, then camping
      order = { place: 0, camping: 1 };
      break;
    case "village":
      // Village places first, then camping
      order = { place: 0, camping: 1 };
      break;
    default:
      return nodeTypeOrder(childType);
  }
  return order[childType] ?? 10;
}

export interface NodeStatus {
  node: NodeRecord;
  entityActive: boolean;
  /** True when the node is closed via the §9 media-deficit disposition (no JSON file, terminal). */
  mediaDeficit: boolean;
  completedDiscovery: string[];
  pendingDiscovery: string[];
  openCandidates: number;
  openConflicts: number;
  complete: boolean;
  blockingReasons: string[];
}

function nodeHasEntity(state: NotesState, nodeId: string): boolean {
  return state.registry.some((r) => r.id === nodeId && r.status === "active");
}

/** Compute per-node completion status against notes + stored entities. */
export function nodeStatus(provinceId: string, node: NodeRecord): NodeStatus {
  const state = readNotes(provinceId);
  const isEntityType = ENTITY_NODE_TYPES.includes(node.nodeType);
  const entityActive = isEntityType ? nodeHasEntity(state, node.nodeId) : true;
  // §9 media-deficit disposition: an entity-bearing node that could not meet the
  // 10-image bar after an exhaustive search is closed WITHOUT a JSON file. All
  // other completion conditions (discovery, candidates, conflicts, counts)
  // still apply — only the missing active entity is waived.
  const mediaDeficit = isEntityType && !entityActive && !!findMediaDeficit(state, node.nodeId);

  const required = REQUIRED_DISCOVERY[node.nodeType] ?? [];
  const tasks = state.discoveryTasks.filter((t) => t.nodeId === node.nodeId);
  const completedDiscovery = required.filter((track) =>
    tasks.some((t) => t.track === track && t.state === "complete"),
  );
  const pendingDiscovery = required.filter((track) => !completedDiscovery.includes(track));

  const openCandidates = state.candidates.filter((c) => c.nodeId === node.nodeId && c.state === "open");
  const openConflicts = state.conflicts.filter((c) => c.nodeId === node.nodeId && c.state === "open");

  const blockingReasons: string[] = [];
  if (isEntityType && !entityActive && !mediaDeficit) blockingReasons.push("entity not saved as active");
  if (pendingDiscovery.length > 0) blockingReasons.push(`pending discovery: ${pendingDiscovery.join(", ")}`);
  if (openCandidates.length > 0) blockingReasons.push(`${openCandidates.length} open candidate(s)`);
  if (openConflicts.length > 0) blockingReasons.push(`${openConflicts.length} open conflict(s)`);

  // A completed discovery track with a declared count must actually have that
  // many child nodes registered. This is what prevents an agent from declaring
  // a province "done" after registering only 1 of its 10 counties.
  for (const t of tasks) {
    if (t.state !== "complete" || typeof t.declaredCount !== "number") continue;
    const childType = TRACK_CHILD_TYPE[t.track];
    if (!childType) continue;
    const actual = state.nodes.filter((n) => n.parentNodeId === node.nodeId && n.nodeType === childType).length;
    if (actual !== t.declaredCount) {
      blockingReasons.push(`${t.track}: declared ${t.declaredCount} but ${actual} registered`);
    }
  }

  return {
    node,
    entityActive,
    mediaDeficit,
    completedDiscovery,
    pendingDiscovery,
    openCandidates: openCandidates.length,
    openConflicts: openConflicts.length,
    complete: blockingReasons.length === 0,
    blockingReasons,
  };
}

/** Depth-first traversal of the node tree, parents before children, siblings in type order. */
export function traverse(provinceId: string): NodeRecord[] {
  const state = readNotes(provinceId);
  const byParent = new Map<string | null, NodeRecord[]>();
  for (const n of state.nodes) {
    const key = n.parentNodeId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }
  for (const [parentId, arr] of byParent) {
    const parentType = parentId === null ? null : (state.nodes.find((n) => n.nodeId === parentId)?.nodeType ?? null);
    arr.sort((a, b) => siblingPriority(parentType, a.nodeType) - siblingPriority(parentType, b.nodeType));
  }

  const order: NodeRecord[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string | null, depth: number) => {
    if (depth > 1000) return; // cycle guard
    const children = byParent.get(nodeId) ?? [];
    for (const child of children) {
      if (visited.has(child.nodeId)) continue;
      visited.add(child.nodeId);
      order.push(child);
      visit(child.nodeId, depth + 1);
    }
  };
  // Roots = nodes with parentNodeId null; also include orphaned subtrees.
  visit(null, 0);
  // Append any nodes not reachable (e.g. parent id not yet registered).
  for (const n of state.nodes) {
    if (!visited.has(n.nodeId)) order.push(n);
  }
  return order;
}

/** True when `nodeId` equals `rootId` or is a descendant of it. */
export function isSubtreeNode(state: NotesState, nodeId: string, rootId: string): boolean {
  let cur = state.nodes.find((n) => n.nodeId === nodeId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.nodeId)) {
    if (cur.nodeId === rootId) return true;
    seen.add(cur.nodeId);
    cur = cur.parentNodeId ? state.nodes.find((n) => n.nodeId === cur!.parentNodeId) : undefined;
  }
  return false;
}

/** True when the node belongs to the currently selected scope (or when no scope is active). */
export function isWithinActiveScope(state: NotesState, nodeId: string): boolean {
  if (!state.activeScopeId) return true;
  return isSubtreeNode(state, nodeId, state.activeScopeId);
}

/**
 * First unfinished node in depth-first traversal, or null.
 *
 * When a staged scope is active (`activeScopeId` set), the traversal is
 * restricted to the scope's own subtree (the scope node + its descendants):
 * ancestors like the province no longer block DFS inside the selected scope.
 */
export function nextRequiredNode(provinceId: string): NodeRecord | null {
  const state = readNotes(provinceId);
  const order = traverse(provinceId);
  const active = state.activeScopeId ? state.nodes.find((n) => n.nodeId === state.activeScopeId) : null;
  const scoped = active ? order.filter((n) => isSubtreeNode(state, n.nodeId, active.nodeId)) : order;
  for (const node of scoped) {
    if (!nodeStatus(provinceId, node).complete) return node;
  }
  return null;
}

export interface ScopeState {
  provinceId: string;
  /** Currently selected staged scope nodeId (null = province-wide). */
  activeScopeId: string | null;
  discoveredNodes: number;
  activeEntities: number;
  /** Nodes closed via the §9 media-deficit disposition (recorded, unresolved). */
  mediaDeficitNodes: unknown[];
  openCandidates: unknown[];
  openConflicts: unknown[];
  nextRequiredNode: NodeRecord | null;
  definitionOfDone: boolean;
  blockingReasons: string[];
  scopeStatus: "in_progress" | "complete";
}

export function getScopeState(provinceId: string): ScopeState {
  const state = readNotes(provinceId);
  const nodes = state.nodes;
  const activeEntities = listEntities(provinceId).filter((e) => e.entity.status === "active").length;
  const mediaDeficitNodes = state.mediaDeficits.filter((d) => d.state === "recorded");
  const openCandidates = state.candidates.filter((c) => c.state === "open");
  const openConflicts = state.conflicts.filter((c) => c.state === "open");

  const next = nextRequiredNode(provinceId);
  const blockingReasons: string[] = [];
  if (nodes.length === 0) blockingReasons.push("no administrative nodes discovered");
  for (const n of nodes) {
    blockingReasons.push(...nodeStatus(provinceId, n).blockingReasons.map((r) => `${n.nodeId}: ${r}`));
  }
  if (openCandidates.length > 0) blockingReasons.push(`${openCandidates.length} open candidate(s)`);
  if (openConflicts.length > 0) blockingReasons.push(`${openConflicts.length} open conflict(s)`);

  const definitionOfDone = blockingReasons.length === 0 && nodes.length > 0;

  return {
    provinceId,
    activeScopeId: state.activeScopeId,
    discoveredNodes: nodes.length,
    activeEntities,
    mediaDeficitNodes,
    openCandidates,
    openConflicts,
    nextRequiredNode: next,
    definitionOfDone,
    blockingReasons,
    scopeStatus: definitionOfDone ? "complete" : "in_progress",
  };
}

/** Administrative path from the province down to this node, prefixed with "Iran". */
export function administrativePath(state: NotesState, nodeId: string): string[] {
  const path: string[] = [];
  let cur = state.nodes.find((n) => n.nodeId === nodeId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.nodeId)) {
    seen.add(cur.nodeId);
    if (cur.canonicalName) path.unshift(cur.canonicalName);
    cur = cur.parentNodeId ? state.nodes.find((n) => n.nodeId === cur!.parentNodeId) : undefined;
  }
  return ["Iran", ...path];
}

/**
 * Returns the current branch in DFS traversal — the path from root to the
 * current required node. This is the ONLY branch the agent should be working on.
 */
export function getCurrentBranch(provinceId: string): NodeRecord[] {
  const state = readNotes(provinceId);
  const current = nextRequiredNode(provinceId);
  if (!current) return []; // All nodes complete

  // Build path from current node up to root
  const branch: NodeRecord[] = [];
  let cur: NodeRecord | undefined = current;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.nodeId)) {
    seen.add(cur.nodeId);
    branch.unshift(cur);
    cur = cur.parentNodeId ? state.nodes.find((n) => n.nodeId === cur!.parentNodeId) : undefined;
  }
  return branch;
}

/**
 * Check if a nodeId is allowed for entity saving under DFS rules.
 * Allowed: any registered node (we can save entities for discovered nodes).
 * The strict DFS enforcement is on mark_node_complete, not on saving.
 */
export function isOnCurrentBranch(provinceId: string, nodeId: string): boolean {
  const state = readNotes(provinceId);
  // Allow saving for any registered node
  return state.nodes.some((n) => n.nodeId === nodeId);
}
