import { readNotes, findMediaDeficit } from "./notes.js";
import { listEntities, ENTITY_NODE_TYPES } from "./dataset.js";
import { sourceCoverageFor } from "./source-policy.js";
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
  // §9 disposition: an entity-bearing node for which NO valid entity data at
  // all could be gathered is closed WITHOUT a JSON file. All other completion
  // conditions (discovery, candidates, conflicts, counts, source coverage)
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

  // Source-policy coverage: the mandatory primary sources must have been
  // searched (and recorded) for this node before it can count as complete.
  // Only checked when nothing else blocks, to keep large provinces fast.
  if (blockingReasons.length === 0 && isEntityType) {
    const coverage = sourceCoverageFor(state, node.nodeType, node.nodeId);
    if (!coverage.satisfied) {
      blockingReasons.push(
        `source coverage ${coverage.searchedCount}/${coverage.required} primary sources ` +
          `(search the mandatory sources first: ${coverage.searched.filter((s) => !s.searched).map((s) => s.domain).join(", ")})`,
      );
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
 * True when a node belongs to a county subtree (county itself or any
 * descendant of a county). Everything else — the province node and the
 * places/campsites registered directly under it — belongs to the PROVINCE
 * STAGE (Scope A) of the staged workflow.
 */
function isInsideCounty(state: NotesState, node: NodeRecord): boolean {
  if (node.nodeType === "county") return true;
  const countyIds = new Set(state.nodes.filter((n) => n.nodeType === "county").map((n) => n.nodeId));
  let cur: NodeRecord | undefined = node;
  const seen = new Set<string>();
  while (cur?.parentNodeId && !seen.has(cur.nodeId)) {
    seen.add(cur.nodeId);
    if (countyIds.has(cur.parentNodeId)) return true;
    cur = state.nodes.find((x) => x.nodeId === cur!.parentNodeId);
  }
  return false;
}

/** Node ids that make up the province stage: the province node + everything directly under it. */
export function provinceStageNodeIds(state: NotesState): Set<string> {
  return new Set(state.nodes.filter((n) => !isInsideCounty(state, n)).map((n) => n.nodeId));
}

/**
 * True when the province stage is finished (province node complete) and the
 * staged workflow is waiting for the USER to pick the next scope
 * (county/city/village). In this state DFS pauses: completing or closing any
 * other node requires set_active_scope first. Selecting the province itself as
 * the active scope switches to a continuous whole-province run.
 */
export function awaitingScopeSelection(state: NotesState): boolean {
  if (state.activeScopeId) return false;
  const province = state.nodes.find((n) => n.nodeType === "province");
  if (!province || (province.state !== "complete" && province.state !== "media_deficit")) return false;
  const isDone = (n: NodeRecord) => n.state === "complete" || n.state === "media_deficit";
  const pending = state.nodes.filter((n) => !isDone(n));
  if (pending.length === 0) return false;

  // The province stage also covers places/camping directly under the province:
  // while those are still open, DFS continues inside the province stage.
  if (pending.some((n) => !isInsideCounty(state, n))) return false;
  return true;
}

/**
 * The scope a run is currently evaluated against.
 *
 *  - `scope`          — the user selected one unit with set_active_scope; only
 *                       that node + its descendants count (Scope B/C).
 *  - `province-stage` — no scope selected yet: the run is in Scope A, so only
 *                       the province node and the places/campsites registered
 *                       directly under it count. Counties stay pending for
 *                       their own runs, which is what lets the province stage
 *                       reach complete:true and stop (STAGED workflow).
 *  - `unscoped`       — nothing imported yet (no province node at all).
 *
 * Selecting the province node itself as the active scope switches to the
 * classic continuous whole-province run (its subtree = every node).
 */
export type ScopeMode = "scope" | "province-stage" | "unscoped";

export interface EffectiveScope {
  mode: ScopeMode;
  scopeId: string | null;
  /** null = every node counts. */
  nodeIds: Set<string> | null;
  label: string;
}

export function effectiveScope(state: NotesState): EffectiveScope {
  if (state.activeScopeId) {
    const ids = new Set<string>([state.activeScopeId]);
    for (const n of state.nodes) {
      if (isSubtreeNode(state, n.nodeId, state.activeScopeId)) ids.add(n.nodeId);
    }
    const node = state.nodes.find((n) => n.nodeId === state.activeScopeId);
    return {
      mode: "scope",
      scopeId: state.activeScopeId,
      nodeIds: ids,
      label: node ? `${node.canonicalName} (${state.activeScopeId})` : state.activeScopeId,
    };
  }
  const province = state.nodes.find((n) => n.nodeType === "province");
  if (province) {
    return {
      mode: "province-stage",
      scopeId: province.nodeId,
      nodeIds: provinceStageNodeIds(state),
      label: `Province stage — ${province.canonicalName} (${province.nodeId})`,
    };
  }
  return { mode: "unscoped", scopeId: null, nodeIds: null, label: "(nothing imported yet)" };
}

/**
 * Node ids that belong to the current effective scope, or null when every node
 * counts. Used by every DoD/complete check so a finished scope (or a finished
 * province stage) can report complete:true while sibling scopes stay pending
 * for their own runs (staged workflow).
 */
export function scopedNodeIds(state: NotesState): Set<string> | null {
  return effectiveScope(state).nodeIds;
}

/**
 * First unfinished node in depth-first traversal, or null.
 *
 * Traversal is restricted to the effective scope: inside a selected scope only
 * that subtree is walked, and during the province stage only the province node
 * and its direct places/campsites are — the agent must never auto-dive into a
 * county without an explicit set_active_scope.
 */
export function nextRequiredNode(provinceId: string): NodeRecord | null {
  const state = readNotes(provinceId);
  // Staged workflow: after the province stage is complete and no scope has
  // been selected, DFS pauses — the agent must ask the user for the next
  // scope (planro://scopes/{provinceId} + set_active_scope) instead of
  // auto-diving into the first county.
  if (awaitingScopeSelection(state)) return null;
  const order = traverse(provinceId);
  const ids = scopedNodeIds(state);
  const scoped = ids === null ? order : order.filter((n) => ids.has(n.nodeId));
  for (const node of scoped) {
    if (!nodeStatus(provinceId, node).complete) return node;
  }
  return null;
}

export interface ScopeState {
  provinceId: string;
  /** Currently selected staged scope nodeId (null = province stage / not selected). */
  activeScopeId: string | null;
  /** How the DoD is evaluated right now: selected scope, province stage, or unscoped. */
  scopeMode: ScopeMode;
  scopeLabel: string;
  /** True when the province stage is done and the user must pick the next scope. */
  awaitingScopeSelection: boolean;
  discoveredNodes: number;
  /** Nodes counted for this scope's Definition of Done. */
  scopeNodes: number;
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
  const scope = effectiveScope(state);
  const scopeIds = scope.nodeIds;
  const openCandidates = state.candidates.filter(
    (c) => c.state === "open" && (scopeIds === null || scopeIds.has(c.nodeId)),
  );
  const openConflicts = state.conflicts.filter(
    (c) => c.state === "open" && (scopeIds === null || scopeIds.has(c.nodeId)),
  );

  const next = nextRequiredNode(provinceId);
  const blockingReasons: string[] = [];
  if (nodes.length === 0) blockingReasons.push("no administrative nodes discovered");
  // Scope-aware DoD: only the nodes of the effective scope count. During the
  // province stage that is the province node + its direct places; inside a
  // selected scope it is that subtree. Everything else stays pending for its
  // own run (staged workflow) and must not keep a finished scope at
  // complete:false forever.
  const doDNodes = scopeIds === null ? nodes : nodes.filter((n) => scopeIds.has(n.nodeId));
  for (const n of doDNodes) {
    blockingReasons.push(...nodeStatus(provinceId, n).blockingReasons.map((r) => `${n.nodeId}: ${r}`));
  }
  if (openCandidates.length > 0) blockingReasons.push(`${openCandidates.length} open candidate(s)`);
  if (openConflicts.length > 0) blockingReasons.push(`${openConflicts.length} open conflict(s)`);

  const definitionOfDone = blockingReasons.length === 0 && doDNodes.length > 0;

  return {
    provinceId,
    activeScopeId: state.activeScopeId,
    scopeMode: scope.mode,
    scopeLabel: scope.label,
    awaitingScopeSelection: awaitingScopeSelection(state),
    discoveredNodes: nodes.length,
    scopeNodes: doDNodes.length,
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
