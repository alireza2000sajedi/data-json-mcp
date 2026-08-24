import {
  readNotes,
  writeNotes,
  upsertNode,
  addSourceMatrixEntry,
  addCandidate,
  setCandidateOutcome,
  addConflict,
  resolveConflict,
  addDiscoveryTask,
  completeDiscoveryTask,
  addResearchCoverage,
  upsertRegistry,
  findNode,
  newId,
} from "./notes.js";
import {
  listEntities,
  findEntityById,
  collectUsedIdsAndSlugs,
  canonicalPath,
  saveEntity,
  generateId,
  generateSlug,
  findExistingEntity,
  entityNodeType,
  writeEntityFile,
  ancestorChain,
} from "./dataset.js";
import {
  getScopeState,
  nextRequiredNode,
  nodeStatus,
  administrativePath,
  REQUIRED_DISCOVERY,
  traverse,
} from "./graph.js";
import { validateEntity, isRawHttpsUrl, normalizeEntityUrls } from "./quality-gate.js";
import { getSchemas } from "./schemas.js";
import { buildDiscoveryQueries, DISCOVERY_NODE_TYPES, type DiscoveryContext } from "./discovery.js";
import type { NotesState, NodeType, OwnershipStatus, PlaceEntity } from "./types.js";

// --- shared helpers ---

const OWNERSHIP_STATUSES: OwnershipStatus[] = [
  "belongs_to_node",
  "belongs_to_parent",
  "belongs_to_child",
  "nearby_only",
  "unverified",
  "rejected",
];

function inferNodeTypeFromId(nodeId: string): NodeType {
  if (/^province-\d/.test(nodeId)) return "province";
  if (/^county-/.test(nodeId)) return "county";
  if (/^district-/.test(nodeId)) return "district";
  if (/^ruralDistrict-|^ruraldistrict-|^rural-/.test(nodeId)) return "ruralDistrict";
  if (/^city-/.test(nodeId)) return "city";
  if (/^village-/.test(nodeId)) return "village";
  if (/^camp-/.test(nodeId)) return "camping";
  return "place";
}

function ensureNode(state: NotesState, nodeId: string, extra?: { nodeType?: NodeType; name?: string; parentNodeId?: string | null }): void {
  if (!findNode(state, nodeId)) {
    upsertNode(state, {
      nodeId,
      nodeType: extra?.nodeType ?? inferNodeTypeFromId(nodeId),
      canonicalName: extra?.name ?? "",
      parentNodeId: extra?.parentNodeId ?? null,
      state: "research_required",
    });
  }
}

// ============================================================================
// 1. get_scope_state
// ============================================================================
export function toolGetScopeState(args: { provinceId: string }) {
  const s = getScopeState(args.provinceId);
  return {
    provinceId: s.provinceId,
    discoveredNodes: s.discoveredNodes,
    activeEntities: s.activeEntities,
    openCandidates: s.openCandidates,
    openConflicts: s.openConflicts,
    nextRequiredNode: s.nextRequiredNode,
    definitionOfDone: s.definitionOfDone,
    blockingReasons: s.blockingReasons,
    scopeStatus: s.scopeStatus,
  };
}

// ============================================================================
// 2. get_next_research_node
// ============================================================================
export function toolGetNextResearchNode(args: { provinceId: string }) {
  const node = nextRequiredNode(args.provinceId);
  if (!node) {
    return { provinceId: args.provinceId, done: true, node: null };
  }
  const state = readNotes(args.provinceId);
  const status = nodeStatus(args.provinceId, node);
  return {
    provinceId: args.provinceId,
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    canonicalName: node.canonicalName,
    parentNodeId: node.parentNodeId,
    administrativePath: administrativePath(state, node.nodeId),
    state: node.state,
    requiredDiscovery: REQUIRED_DISCOVERY[node.nodeType],
    pendingDiscovery: status.pendingDiscovery,
    completedDiscovery: status.completedDiscovery,
  };
}

// ============================================================================
// 3. get_node_context
// ============================================================================
export function toolGetNodeContext(args: { provinceId: string; nodeId: string }) {
  const state = readNotes(args.provinceId);
  const node = findNode(state, args.nodeId);
  if (!node) {
    throw new Error(`Node '${args.nodeId}' is not registered for province '${args.provinceId}'.`);
  }
  const entity = listEntities(args.provinceId).find((e) => e.id === args.nodeId);
  const status = nodeStatus(args.provinceId, node);
  const knownRelations = (entity?.entity.relations as any[]) ?? [];
  return {
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    canonicalName: node.canonicalName,
    parentNodeId: node.parentNodeId,
    administrativePath: administrativePath(state, node.nodeId),
    knownAlternativeNames: (entity?.entity.alternativeNames as string[]) ?? [],
    knownRelations: knownRelations.map((r) => ({ placeId: r?.placeId, relationType: r?.relationType })),
    completedDiscoveryTracks: status.completedDiscovery,
    pendingDiscoveryTracks: status.pendingDiscovery,
  };
}

// ============================================================================
// 4. find_existing_entity
// ============================================================================
export function toolFindExistingEntity(args: {
  provinceId: string;
  name: string;
  alternativeNames?: string[];
  latitude?: number;
  longitude?: number;
  administrativePath?: string[];
}) {
  const { definitive, possible } = findExistingEntity(
    args.provinceId,
    args.name,
    args.alternativeNames ?? [],
    args.latitude,
    args.longitude,
    args.administrativePath ?? [],
  );
  return { definitive, possible };
}

// ============================================================================
// 5. reserve_entity_id
// ============================================================================
export function toolReserveEntityId(args: { provinceId: string; entityKind: string; preferredSlug: string }) {
  const state = readNotes(args.provinceId);
  const { ids, slugs } = collectUsedIdsAndSlugs(args.provinceId, state);
  const id = generateId(args.provinceId, args.entityKind, ids);
  const slug = generateSlug(args.preferredSlug, slugs);

  const kindNodeType: NodeType = args.entityKind === "camping" ? "camping" : args.entityKind === "poi" ? "place" : (args.entityKind as NodeType);
  const nodeType: NodeType = ["province", "county", "city", "village", "place", "camping"].includes(kindNodeType) ? kindNodeType : "place";

  return {
    id,
    slug,
    entityKind: args.entityKind,
    nodeType,
    suggestedCanonicalPath: suggestedPath(nodeType, args.provinceId, id),
  };
}

function suggestedPath(nodeType: NodeType, provinceId: string, id: string): string {
  // The real path is resolved at save time from the registered parent chain;
  // this is only a hint of the shape (folders mirror the admin hierarchy).
  switch (nodeType) {
    case "province":
      return "province.json";
    case "county":
      return `${id}/county.json`;
    case "city":
      return `{countyId}/${id}/city.json`;
    case "village":
      return `{parentFolder}/${id}/village.json`;
    case "camping":
      return `{parentFolder}/${id}.json`;
    default:
      return `{parentFolder}/${id}.json`;
  }
}

// ============================================================================
// 6. record_search_result
// ============================================================================
export function toolRecordSearchResult(args: {
  provinceId: string;
  nodeId: string;
  query: string;
  sourceUrl: string;
  sourceTitle: string;
  resultSummary: string;
  ownershipStatus: string;
  discoveredNames?: string[];
}) {
  if (!OWNERSHIP_STATUSES.includes(args.ownershipStatus as OwnershipStatus)) {
    throw new Error(`ownershipStatus must be one of: ${OWNERSHIP_STATUSES.join(", ")}`);
  }
  if (!isRawHttpsUrl(args.sourceUrl)) {
    throw new Error("sourceUrl must be a raw HTTPS URL.");
  }
  const state = readNotes(args.provinceId);
  ensureNode(state, args.nodeId);
  const entry = {
    id: newId("src"),
    nodeId: args.nodeId,
    query: args.query,
    sourceUrl: args.sourceUrl,
    sourceTitle: args.sourceTitle,
    resultSummary: args.resultSummary,
    ownershipStatus: args.ownershipStatus as OwnershipStatus,
    discoveredNames: args.discoveredNames,
  };
  addSourceMatrixEntry(state, entry);
  writeNotes(state);
  return {
    recorded: true,
    entry,
    nodeId: args.nodeId,
    ownershipStatus: args.ownershipStatus,
  };
}

// ============================================================================
// 7. create_candidate
// ============================================================================
export function toolCreateCandidate(args: {
  provinceId: string;
  nodeId: string;
  name: string;
  entityKind: string;
  query: string;
  sourceUrls: string[];
  reason: string;
  blockingRequirements?: string[];
}) {
  const state = readNotes(args.provinceId);
  ensureNode(state, args.nodeId, { name: args.name, nodeType: inferNodeTypeFromId(args.nodeId) });
  const candidate = {
    id: newId("cand"),
    provinceId: args.provinceId,
    nodeId: args.nodeId,
    name: args.name,
    entityKind: args.entityKind,
    query: args.query,
    sourceUrls: args.sourceUrls ?? [],
    reason: args.reason,
    blockingRequirements: args.blockingRequirements ?? [],
    state: "open" as const,
    createdAt: new Date().toISOString(),
  };
  addCandidate(state, candidate);
  writeNotes(state);
  // No JSON dataset file is ever written for a candidate.
  return { candidateId: candidate.id, storedIn: "notes.md", jsonCreated: false };
}

// ============================================================================
// 8. resolve_candidate
// ============================================================================
const CANDIDATE_OUTCOMES = ["promoted_to_active", "not_found_after_research", "duplicate_of_entity", "out_of_scope", "needs_more_research"];

export function toolResolveCandidate(args: { provinceId: string; candidateId: string; outcome: string }) {
  if (!CANDIDATE_OUTCOMES.includes(args.outcome)) {
    throw new Error(`outcome must be one of: ${CANDIDATE_OUTCOMES.join(", ")}`);
  }
  const state = readNotes(args.provinceId);
  const candidate = setCandidateOutcome(state, args.candidateId, args.outcome);
  if (!candidate) {
    throw new Error(`Candidate '${args.candidateId}' not found.`);
  }
  writeNotes(state);
  return { candidateId: args.candidateId, outcome: args.outcome, resolved: true };
}

// ============================================================================
// 9. save_active_entity
// ============================================================================
export function toolSaveActiveEntity(args: { provinceId: string; entity: PlaceEntity; expectedNodeId: string }) {
  const state = readNotes(args.provinceId);
  const entity = normalizeEntityUrls(args.entity);
  const result = validateEntity(entity, {
    provinceId: args.provinceId,
    expectedNodeId: args.expectedNodeId,
    state,
  });

  if (!result.accepted) {
    return { accepted: false, errors: result.errors, warnings: result.warnings };
  }

  let pathResult;
  try {
    pathResult = canonicalPath(args.provinceId, state, entity, args.expectedNodeId);
  } catch (e) {
    return {
      accepted: false,
      errors: [{ code: "CANONICAL_PATH_ERROR", path: "entity", message: (e as Error).message }],
      warnings: result.warnings,
    };
  }

  // Resolve any matching open candidate for this node.
  const matchedCandidates = state.candidates.filter(
    (c) => c.state === "open" && c.nodeId === args.expectedNodeId && (c.name === entity.name?.fa || (entity.alternativeNames as string[] | undefined)?.includes(c.name)),
  );
  for (const c of matchedCandidates) {
    setCandidateOutcome(state, c.id, "promoted_to_active");
  }

  saveEntity(args.provinceId, entity, args.expectedNodeId, pathResult);

  return {
    accepted: true,
    entityId: entity.id,
    path: pathResult.relPath,
    warnings: result.warnings,
    resolvedCandidates: matchedCandidates.map((c) => c.id),
    summary: {
      type: entity.type,
      subType: entity.subType,
      name: entity.name?.fa,
      images: (entity.media?.images as any[] | undefined)?.length ?? 0,
    },
  };
}

// ============================================================================
// 9b. save_entities — batch save (order matters: parents before children)
// ============================================================================
export function toolSaveEntities(args: { provinceId: string; entities: Array<{ entity: PlaceEntity; expectedNodeId: string }> }) {
  if (!Array.isArray(args.entities) || args.entities.length === 0) {
    throw new Error("entities must be a non-empty array of { entity, expectedNodeId }.");
  }
  const results = args.entities.map(({ entity, expectedNodeId }) => {
    // Each item is saved sequentially, so a later entity already sees earlier
    // ones on disk (duplicate id/slug and parent relations are enforced).
    const r = toolSaveActiveEntity({ provinceId: args.provinceId, entity, expectedNodeId });
    return {
      entityId: entity?.id,
      accepted: r.accepted,
      path: r.accepted ? r.path : undefined,
      errors: r.accepted ? undefined : r.errors,
      warnings: r.warnings,
    };
  });
  const accepted = results.filter((r) => r.accepted).length;
  return {
    provinceId: args.provinceId,
    submitted: results.length,
    accepted,
    rejected: results.length - accepted,
    results,
  };
}

// ============================================================================
// 10. link_entities
// ============================================================================
export function toolLinkEntities(args: {
  provinceId: string;
  fromId: string;
  toId: string;
  relationType: string;
  distanceKm?: number;
  travelTimeMinutes?: number;
  note?: string;
}) {
  const schemas = getSchemas();
  if (!schemas.relationTypes.includes(args.relationType)) {
    throw new Error(`relationType must be one of: ${schemas.relationTypes.join(", ")}`);
  }
  if (args.fromId === args.toId) {
    throw new Error("fromId and toId must be different entities.");
  }

  const from = findEntityById(args.provinceId, args.fromId);
  const to = findEntityById(args.provinceId, args.toId);
  if (!from) throw new Error(`Entity '${args.fromId}' not found.`);
  if (!to) throw new Error(`Entity '${args.toId}' not found.`);

  const fromRel = (from.entity.relations as any[]) ?? [];
  if (fromRel.some((r) => r?.placeId === args.toId && r?.relationType === args.relationType)) {
    throw new Error(`Relation '${args.relationType}' from '${args.fromId}' to '${args.toId}' already exists.`);
  }

  const relation = {
    placeId: args.toId,
    slug: to.entity.slug,
    name: to.entity.name?.fa,
    relationType: args.relationType,
    ...(args.distanceKm !== undefined ? { distanceKm: args.distanceKm } : {}),
    ...(args.travelTimeMinutes !== undefined ? { travelTimeMinutes: args.travelTimeMinutes } : {}),
    ...(args.note !== undefined ? { note: args.note } : {}),
  };

  from.entity.relations = [...fromRel, relation];
  writeEntityFile(from.path, from.entity);

  // Mirror for nearby/alternative when possible.
  if (args.relationType === "nearby" || args.relationType === "alternative") {
    const toRel = (to.entity.relations as any[]) ?? [];
    if (!toRel.some((r) => r?.placeId === args.fromId && r?.relationType === args.relationType)) {
      to.entity.relations = [
        ...toRel,
        { placeId: args.fromId, slug: from.entity.slug, name: from.entity.name?.fa, relationType: args.relationType },
      ];
      writeEntityFile(to.path, to.entity);
    }
  }

  return { linked: true, fromId: args.fromId, toId: args.toId, relationType: args.relationType };
}

// ============================================================================
// 11. update_notes
// ============================================================================
export function toolUpdateNotes(args: { provinceId: string; operation: string; payload: Record<string, any> }) {
  const state = readNotes(args.provinceId);
  const op = args.operation;
  const p = args.payload ?? {};

  switch (op) {
    case "add_research_coverage":
      addResearchCoverage(state, {
        entity: String(p.entity ?? ""),
        sites: String(p.sites ?? ""),
        queryCodes: String(p.queryCodes ?? ""),
        resultSummary: String(p.resultSummary ?? ""),
      });
      break;

    case "add_conflict":
      addConflict(state, {
        id: newId("conf"),
        nodeId: String(p.nodeId ?? ""),
        description: String(p.description ?? ""),
        state: "open",
      });
      break;

    case "resolve_conflict":
      resolveConflict(state, String(p.conflictId), String(p.resolution ?? ""));
      break;

    case "add_discovery_task": {
      const nodeId = String(p.nodeId);
      ensureNode(state, nodeId, {
        nodeType: (p.nodeType as NodeType) ?? inferNodeTypeFromId(nodeId),
        name: p.nodeName as string,
        parentNodeId: (p.parentNodeId as string | null) ?? null,
      });
      addDiscoveryTask(state, nodeId, String(p.track));
      break;
    }

    case "complete_discovery_task": {
      const nodeId = String(p.nodeId);
      const track = String(p.track);
      if (!nodeId || !track) throw new Error("complete_discovery_task requires nodeId and track.");
      if (!findNode(state, nodeId)) throw new Error(`Node '${nodeId}' is not registered. Register it first (register_node / add_discovery_task).`);
      completeDiscoveryTask(state, nodeId, track);
      break;
    }

    case "mark_node_complete": {
      const nodeId = String(p.nodeId);
      if (!findNode(state, nodeId)) {
        throw new Error(`Node '${nodeId}' is not registered.`);
      }
      // Gate: refuse unless entity active + all discovery complete + no open candidates/conflicts.
      const status = nodeStatus(args.provinceId, findNode(state, nodeId)!);
      if (!status.complete) {
        throw new Error(`Cannot mark node complete: ${status.blockingReasons.join("; ")}`);
      }
      findNode(state, nodeId)!.state = "complete";
      break;
    }

    case "add_source_matrix_entry":
      ensureNode(state, String(p.nodeId));
      addSourceMatrixEntry(state, {
        id: newId("src"),
        nodeId: String(p.nodeId),
        query: String(p.query ?? ""),
        sourceUrl: String(p.sourceUrl ?? ""),
        sourceTitle: String(p.sourceTitle ?? ""),
        resultSummary: String(p.resultSummary ?? ""),
        ownershipStatus: (p.ownershipStatus as OwnershipStatus) ?? "unverified",
        discoveredNames: p.discoveredNames,
      });
      break;

    case "update_registry":
      upsertRegistry(state, {
        id: String(p.id),
        slug: String(p.slug),
        path: String(p.path),
        status: "active",
        name: String(p.name ?? ""),
        type: String(p.type ?? ""),
        subType: p.subType as string | undefined,
      });
      break;

    case "register_node":
      ensureNode(state, String(p.nodeId), {
        nodeType: (p.nodeType as NodeType) ?? inferNodeTypeFromId(String(p.nodeId)),
        name: p.nodeName as string,
        parentNodeId: (p.parentNodeId as string | null) ?? null,
      });
      break;

    default:
      throw new Error(`Unknown notes operation: ${op}`);
  }

  writeNotes(state);
  return { updated: true, operation: op, provinceId: args.provinceId };
}

// ============================================================================
// 12. check_definition_of_done
// ============================================================================
export function toolCheckDefinitionOfDone(args: { provinceId: string }) {
  const state = readNotes(args.provinceId);
  const scope = getScopeState(args.provinceId);

  const missingAdministrativeNodes: string[] = [];
  const nodes = state.nodes;
  const nodeTypesSeen = new Set(nodes.map((n) => n.nodeType));
  for (const nt of ["province", "county", "city", "village"] as NodeType[]) {
    if (!nodeTypesSeen.has(nt)) missingAdministrativeNodes.push(nt);
  }

  const openCandidates = state.candidates.filter((c) => c.state === "open");
  const unresolvedConflicts = state.conflicts.filter((c) => c.state === "open");

  const invalidRelations: string[] = [];
  const knownIds = new Set(listEntities(args.provinceId).map((e) => e.id));
  for (const e of listEntities(args.provinceId)) {
    for (const rel of (e.entity.relations as any[]) ?? []) {
      if (rel?.placeId && !knownIds.has(rel.placeId)) invalidRelations.push(`${e.id} -> ${rel.placeId}`);
    }
  }

  const incompleteMedia: string[] = [];
  const incompleteCosts: string[] = [];
  const missingEvidence: string[] = [];
  for (const e of listEntities(args.provinceId)) {
    if (e.entity.status === "active") {
      const images = (e.entity.media?.images as any[]) ?? [];
      if (!e.entity.media?.thumbnail || images.length < 10 || images.length > 20) incompleteMedia.push(e.id);
      if (!e.entity.costs) incompleteCosts.push(e.id);
      if (!Array.isArray(e.entity.evidence) || e.entity.evidence.length === 0) missingEvidence.push(e.id);
    }
  }

  const complete = scope.definitionOfDone && invalidRelations.length === 0;

  return {
    complete,
    missingAdministrativeNodes,
    openCandidates: openCandidates.map((c) => c.id),
    unresolvedConflicts: unresolvedConflicts.map((c) => c.id),
    invalidRelations,
    incompleteMedia,
    incompleteCosts,
    missingEvidence,
    nextAction: complete ? null : scope.nextRequiredNode?.nodeId ?? "discover province administrative structure",
  };
}

// ============================================================================
// 13. discover_node — generates node-scoped queries (query generator, no network)
// ============================================================================
export function toolDiscoverNode(args: {
  provinceId: string;
  nodeType: string;
  canonicalName: string;
  context?: DiscoveryContext;
}) {
  if (!DISCOVERY_NODE_TYPES.includes(args.nodeType as NodeType)) {
    throw new Error(`nodeType must be one of: ${DISCOVERY_NODE_TYPES.join(", ")}`);
  }
  const queries = buildDiscoveryQueries(args.nodeType as NodeType, args.canonicalName, args.context ?? {});
  return {
    provinceId: args.provinceId,
    nodeType: args.nodeType,
    canonicalName: args.canonicalName,
    context: args.context ?? {},
    queries,
    note: "Run each query with your own search tools, then record every result via record_search_result with an ownershipStatus. A query for this node must not be reused to back facts of a parent or child node.",
  };
}

// ============================================================================
// 14. validate_province — re-validate every stored entity and report errors
// ============================================================================
export function toolValidateProvince(args: { provinceId: string }) {
  const state = readNotes(args.provinceId);
  const stored = listEntities(args.provinceId);
  const entities = stored.map((e) => {
    const result = validateEntity(e.entity, { provinceId: args.provinceId, expectedNodeId: e.entity.id, state });
    return {
      entityId: e.entity.id,
      path: e.path,
      name: e.entity.name?.fa ?? "",
      accepted: result.accepted,
      errors: result.errors,
      warnings: result.warnings,
    };
  });
  const invalid = entities.filter((e) => !e.accepted);
  return {
    provinceId: args.provinceId,
    total: entities.length,
    valid: entities.length - invalid.length,
    invalid: invalid.length,
    entities: invalid,
  };
}

// ============================================================================
// 15. discover_subtree — bulk query generation for a whole subtree (parallel search)
// ============================================================================
function contextForNode(state: NotesState, nodeId: string): DiscoveryContext {
  const ctx: DiscoveryContext = {};
  for (const n of ancestorChain(state, nodeId)) {
    if (n.nodeType === "province") ctx.province = n.canonicalName;
    else if (n.nodeType === "county") ctx.county = n.canonicalName;
    else if (n.nodeType === "district") ctx.district = n.canonicalName;
    else if (n.nodeType === "ruralDistrict") ctx.ruralDistrict = n.canonicalName;
    else if (n.nodeType === "city") ctx.city = n.canonicalName;
    else if (n.nodeType === "village") ctx.village = n.canonicalName;
  }
  return ctx;
}

export function toolDiscoverSubtree(args: { provinceId: string; nodeId?: string }) {
  const state = readNotes(args.provinceId);

  let nodes = state.nodes;
  if (args.nodeId) {
    const root = findNode(state, args.nodeId);
    if (!root) throw new Error(`Node '${args.nodeId}' is not registered for province '${args.provinceId}'.`);
    const childrenOf = new Map<string, string[]>();
    for (const n of state.nodes) {
      const k = n.parentNodeId ?? "";
      if (!childrenOf.has(k)) childrenOf.set(k, []);
      childrenOf.get(k)!.push(n.nodeId);
    }
    const ids = new Set<string>();
    const collect = (id: string) => {
      ids.add(id);
      for (const c of childrenOf.get(id) ?? []) collect(c);
    };
    collect(args.nodeId);
    nodes = state.nodes.filter((n) => ids.has(n.nodeId));
  }

  const results = nodes
    .map((n) => {
      const context = contextForNode(state, n.nodeId);
      let queries: ReturnType<typeof buildDiscoveryQueries> = [];
      try {
        queries = buildDiscoveryQueries(n.nodeType, n.canonicalName, context);
      } catch {
        queries = [];
      }
      return { nodeId: n.nodeId, nodeType: n.nodeType, canonicalName: n.canonicalName, context, queries };
    })
    .filter((r) => r.queries.length > 0);

  return {
    provinceId: args.provinceId,
    nodeId: args.nodeId ?? null,
    nodeCount: results.length,
    note: "All query strings for the subtree at once, so you can run searches in parallel. Every query is already scoped to its own node — do not reuse a node's query to back a parent/child fact.",
    nodes: results,
  };
}
