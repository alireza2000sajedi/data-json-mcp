import { readNotes } from "./notes.js";
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

export interface NodeStatus {
  node: NodeRecord;
  entityActive: boolean;
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

  const required = REQUIRED_DISCOVERY[node.nodeType] ?? [];
  const tasks = state.discoveryTasks.filter((t) => t.nodeId === node.nodeId);
  const completedDiscovery = required.filter((track) =>
    tasks.some((t) => t.track === track && t.state === "complete"),
  );
  const pendingDiscovery = required.filter((track) => !completedDiscovery.includes(track));

  const openCandidates = state.candidates.filter((c) => c.nodeId === node.nodeId && c.state === "open");
  const openConflicts = state.conflicts.filter((c) => c.nodeId === node.nodeId && c.state === "open");

  const blockingReasons: string[] = [];
  if (isEntityType && !entityActive) blockingReasons.push("entity not saved as active");
  if (pendingDiscovery.length > 0) blockingReasons.push(`pending discovery: ${pendingDiscovery.join(", ")}`);
  if (openCandidates.length > 0) blockingReasons.push(`${openCandidates.length} open candidate(s)`);
  if (openConflicts.length > 0) blockingReasons.push(`${openConflicts.length} open conflict(s)`);

  return {
    node,
    entityActive,
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
  for (const arr of byParent.values()) {
    arr.sort((a, b) => nodeTypeOrder(a.nodeType) - nodeTypeOrder(b.nodeType));
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

/** First unfinished node in depth-first traversal, or null. */
export function nextRequiredNode(provinceId: string): NodeRecord | null {
  for (const node of traverse(provinceId)) {
    if (!nodeStatus(provinceId, node).complete) return node;
  }
  return null;
}

export interface ScopeState {
  provinceId: string;
  discoveredNodes: number;
  activeEntities: number;
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
    discoveredNodes: nodes.length,
    activeEntities,
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
