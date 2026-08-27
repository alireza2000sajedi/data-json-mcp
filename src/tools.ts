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
  updateDodStatus,
  addMediaDeficit,
  findMediaDeficit,
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
  TRACK_CHILD_TYPE,
  traverse,
  getCurrentBranch,
  isOnCurrentBranch,
  isWithinActiveScope,
} from "./graph.js";
import { validateEntity, isRawHttpsUrl, normalizeEntityUrls } from "./quality-gate.js";
import { getSchemas } from "./schemas.js";
import { minImagesForNodeType, MAX_IMAGES_PER_ENTITY, MEDIA_MINIMUMS_SUMMARY } from "./media.js";
import { buildDiscoveryQueries, DISCOVERY_NODE_TYPES, type DiscoveryContext } from "./discovery.js";
import { buildScopeRegistry } from "./scopes.js";
import { scopedNodeIds } from "./graph.js";
import type { NotesState, NodeType, OwnershipStatus, PlaceEntity, MediaDeficitRecord } from "./types.js";

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
    activeScopeId: s.activeScopeId,
    discoveredNodes: s.discoveredNodes,
    activeEntities: s.activeEntities,
    mediaDeficitNodes: s.mediaDeficitNodes,
    openCandidates: s.openCandidates,
    openConflicts: s.openConflicts,
    nextRequiredNode: s.nextRequiredNode,
    definitionOfDone: s.definitionOfDone,
    blockingReasons: s.blockingReasons,
    scopeStatus: s.scopeStatus,
  };
}

// ============================================================================
// 1-a. import_province_scopes (Scope A — Province Discovery, IDs only)
// ============================================================================
/**
 * Stage 1 of the staged workflow: derive the complete administrative scope
 * list of a province from the reference checklist (input/{n}.json) and give
 * every unit a dedicated, deterministic id (county-{p}-{n}, city-{p}-{n},
 * village-{p}-v{n}). Only structure is registered — NO deep research, NO POI
 * extraction, NO entity files. The agent stops after this call.
 */
export function toolImportProvinceScopes(args: { provinceId: string }) {
  const registry = buildScopeRegistry(args.provinceId);
  const state = readNotes(args.provinceId);

  // Province node (root).
  ensureNode(state, registry.provinceId, { nodeType: "province", name: registry.provinceName, parentNodeId: null });
  completeDiscoveryTask(state, registry.provinceId, "counties", registry.counts.counties);

  for (const county of registry.tree) {
    ensureNode(state, county.id, { nodeType: "county", name: county.name, parentNodeId: registry.provinceId });
    // Cities and villages counts are fully known from the reference checklist.
    completeDiscoveryTask(state, county.id, "cities", county.cities.length);
    completeDiscoveryTask(state, county.id, "villages", county.villages.length);
    for (const city of county.cities) {
      ensureNode(state, city.id, { nodeType: "city", name: city.name, parentNodeId: county.id });
    }
    for (const village of county.villages) {
      ensureNode(state, village.id, { nodeType: "village", name: village.name, parentNodeId: county.id });
    }
  }

  state.nextStep =
    `Scope A (Province Discovery) done for ${registry.provinceId}: ${registry.counts.counties} counties, ` +
    `${registry.counts.cities} cities, ${registry.counts.villages} villages registered with dedicated ids. ` +
    `STOP — no deep research was performed. Await the user's scope selection (by name or id, e.g. ` +
    `'${registry.provinceId} → ${registry.tree[0]?.id}') and call set_active_scope.`;

  writeNotes(state);

  const next = nextRequiredNode(args.provinceId);
  return {
    imported: true,
    provinceId: registry.provinceId,
    provinceName: registry.provinceName,
    source: registry.source,
    scopeSummary: registry.counts,
    scopesByCounty: registry.tree.map((c) => ({
      id: c.id,
      name: c.name,
      cities: c.cities.length,
      villages: c.villages.length,
    })),
    registeredNodes: state.nodes.length,
    nextRequiredNode: next ? { nodeId: next.nodeId, nodeType: next.nodeType, canonicalName: next.canonicalName } : null,
    scopesResource: `planro://scopes/${registry.provinceId}`,
    note: "Stage 1 (Discovery) complete: structure + dedicated ids only. Nothing deep-researched. Stop and wait for the user's scope selection.",
  };
}

// ============================================================================
// 1-b. set_active_scope (user picks ONE scope for deep research)
// ============================================================================
/**
 * Stage 2 of the staged workflow: the user selected a scope (by id or name).
 * Lock DFS / next-node / completion to that scope's own subtree so this run
 * deep-researches ONLY that unit (plus its needed sub-units) and nothing else.
 * Pass nodeId: null to return to province-wide mode.
 */
export function toolSetActiveScope(args: { provinceId: string; nodeId: string | null }) {
  const state = readNotes(args.provinceId);
  if (args.nodeId !== null && args.nodeId !== undefined) {
    if (!findNode(state, args.nodeId)) {
      throw new Error(
        `Node '${args.nodeId}' is not registered for '${args.provinceId}'. ` +
          `Run import_province_scopes first, or read planro://scopes/${args.provinceId} for the valid scope ids.`,
      );
    }
  }
  const active = args.nodeId ?? null;
  state.activeScopeId = active;
  const label = active ? `${findNode(state, active)!.canonicalName} (${active})` : "کل استان (whole province)";
  state.nextStep = `Active scope set to ${label}. Deep-research ONLY this scope, save its files, checkpoint (complete), then STOP and await the next command.`;
  writeNotes(state);

  const next = nextRequiredNode(args.provinceId);
  return {
    activeScopeId: state.activeScopeId,
    activeScopeLabel: label,
    nextRequiredNode: next ? { nodeId: next.nodeId, nodeType: next.nodeType, canonicalName: next.canonicalName } : null,
    note: active
      ? `Scope locked to ${label}. Everything else stays pending for separate runs.`
      : "Province-wide mode restored.",
  };
}

// ============================================================================
// 2. get_next_research_node
// ============================================================================
export function toolGetNextResearchNode(args: { provinceId: string }) {
  const node = nextRequiredNode(args.provinceId);
  if (!node) {
    const state = readNotes(args.provinceId);
    return {
      provinceId: args.provinceId,
      done: true,
      node: null,
      reminder: "All nodes complete! You MUST now run check_definition_of_done and validate_province. Only when both pass (complete:true AND invalid:0) can you produce the final report.",
      dodStatus: state.dodStatus
        ? { checked: true, complete: state.dodStatus.dodComplete, invalid: state.dodStatus.validateInvalid }
        : { checked: false, complete: false, invalid: -1 },
    };
  }
  const state = readNotes(args.provinceId);
  const status = nodeStatus(args.provinceId, node);
  const branch = getCurrentBranch(args.provinceId);
  const branchPath = branch.map((n) => `${n.canonicalName}(${n.nodeType})`).join(" → ");

  return {
    provinceId: args.provinceId,
    activeScopeId: state.activeScopeId,
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    canonicalName: node.canonicalName,
    parentNodeId: node.parentNodeId,
    administrativePath: administrativePath(state, node.nodeId),
    state: node.state,
    requiredDiscovery: REQUIRED_DISCOVERY[node.nodeType],
    pendingDiscovery: status.pendingDiscovery,
    completedDiscovery: status.completedDiscovery,
    currentBranch: branchPath,
    dfsInstruction:
      `DFS ORDER: You MUST work on '${node.nodeId}' (${node.canonicalName}) NOW. ` +
      `Complete this node FULLY (research, save entity, resolve candidates, complete discovery) before moving to any other node. ` +
      `Do NOT save entities or mark nodes complete for any other branch. ` +
      `Order: this node → its places → its first child → that child's places → ... → next sibling.`,
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
  const deficit = findMediaDeficit(state, args.nodeId);
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
    mediaDeficit: status.mediaDeficit,
    mediaDeficitDetail: deficit
      ? { reason: deficit.reason, imagesFound: deficit.imagesFound, searchesPerformed: deficit.searchesPerformed, createdAt: deficit.createdAt }
      : null,
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

  // Real reservation: persist a pending registry entry so a later reserve call
  // (or a concurrent agent) cannot return the same id/slug. save_active_entity
  // promotes it to "active" when the entity is committed.
  upsertRegistry(state, {
    id,
    slug,
    path: "",
    status: "pending",
    name: "",
    type: "",
  });
  writeNotes(state);

  return {
    id,
    slug,
    entityKind: args.entityKind,
    nodeType,
    status: "pending",
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
// 8b. mark_node_media_deficit — §9 disposition: close an entity node that
// cannot meet its per-type minimum image bar after an exhaustive search
// (BOTH free-license archives AND general web image search).
// ============================================================================

/** Node types that legitimately own a place-schema JSON entity. */
const MEDIA_DEFICIT_ENTITY_TYPES: NodeType[] = ["province", "county", "city", "village", "place", "camping"];

export function toolMarkNodeMediaDeficit(args: {
  provinceId: string;
  nodeId: string;
  reason: string;
  imagesFound: number;
  searchesPerformed?: string[];
}) {
  const state = readNotes(args.provinceId);
  const node = findNode(state, args.nodeId);
  if (!node) {
    throw new Error(`Node '${args.nodeId}' is not registered for province '${args.provinceId}'.`);
  }
  if (!MEDIA_DEFICIT_ENTITY_TYPES.includes(node.nodeType)) {
    throw new Error(`mark_node_media_deficit is for entity-bearing nodes (${MEDIA_DEFICIT_ENTITY_TYPES.join(", ")}); node '${args.nodeId}' is a ${node.nodeType}.`);
  }
  if (state.registry.some((r) => r.id === args.nodeId && r.status === "active")) {
    throw new Error(`Node '${args.nodeId}' already has an active entity; the media-deficit disposition is only for nodes WITHOUT an active entity.`);
  }
  if (findMediaDeficit(state, args.nodeId)) {
    throw new Error(`Node '${args.nodeId}' already has a recorded media-deficit disposition.`);
  }
  const minImages = minImagesForNodeType(node.nodeType);
  const imagesFound = Number(args.imagesFound);
  if (!Number.isInteger(imagesFound) || imagesFound < 0 || imagesFound >= minImages) {
    throw new Error(
      `imagesFound must be an integer between 0 and ${minImages - 1} for a ${node.nodeType} node ` +
        `(its active-entity minimum is ${minImages} attributable images). A node with ${minImages}+ distinct attributable images ` +
        `(free-license OR credited web images with all-rights-reserved license) MUST be saved as an active entity, not marked deficit.`,
    );
  }
  const reason = String(args.reason ?? "").trim();
  if (!reason) {
    throw new Error(
      "reason is required: document which image sources were searched (free-license archives AND general web image search) and why the available images do not belong to this node.",
    );
  }
  const searchesPerformed = (args.searchesPerformed ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (searchesPerformed.length < 2) {
    throw new Error(
      "searchesPerformed must list at least 2 distinct searches actually run — the media-deficit disposition is only legitimate " +
        "after BOTH free-license archives (e.g. Wikimedia Commons category/geosearch) AND general web image search " +
        "(Google/Bing Images, Persian tourism sites, news agencies) were tried for this node's own name.",
    );
  }

  // DFS enforcement: the disposition may only be placed on the current required
  // node, same as mark_node_complete — siblings later in the traversal stay closed.
  const current = nextRequiredNode(args.provinceId);
  if (current && current.nodeId !== args.nodeId) {
    const branch = getCurrentBranch(args.provinceId);
    const branchPath = branch.map((n) => `${n.nodeId}(${n.nodeType})`).join(" → ");
    throw new Error(
      `DFS ORDER VIOLATION: Cannot mark '${args.nodeId}' media-deficit — it is not the current required node. ` +
      `Current required node: '${current.nodeId}' (${current.nodeType}). ` +
      `Current branch: ${branchPath}. ` +
      `You MUST complete '${current.nodeId}' first.`,
    );
  }

  // All other completion conditions still apply: discovery tracks closed, no
  // open candidates/conflicts on the node. The only thing waived is the active
  // entity itself.
  const before = nodeStatus(args.provinceId, node);
  const remaining = before.blockingReasons.filter((r) => r !== "entity not saved as active");
  if (remaining.length > 0) {
    throw new Error(
      `Cannot mark '${args.nodeId}' media-deficit: close these first: ${remaining.join("; ")}. ` +
      `(The media-deficit disposition only waives the missing active entity — it never waives discovery, candidates or conflicts.)`,
    );
  }

  const record: MediaDeficitRecord = {
    id: newId("def"),
    nodeId: args.nodeId,
    reason,
    blockingRequirements: ["insufficient_verifiable_media"],
    imagesFound,
    searchesPerformed,
    state: "recorded",
    createdAt: new Date().toISOString(),
  };
  addMediaDeficit(state, record);
  upsertNode(state, { ...node, state: "media_deficit" });
  state.nextStep = `Marked ${args.nodeId} (${node.nodeType}, ${node.canonicalName}) media-deficit (${imagesFound}/${minImages} attributable images after exhaustive search incl. web image search). Continue DFS with the next required node.`;
  writeNotes(state);

  const next = nextRequiredNode(args.provinceId);
  return {
    recorded: true,
    dispositionId: record.id,
    nodeId: args.nodeId,
    nodeState: "media_deficit",
    imagesFound,
    note:
      `Node closed WITHOUT a JSON file (no fabricated data). DFS will move to the next node; mark_node_complete is not needed for this node. ` +
      `If ${minImages}+ attributable images (free-license or credited web images) are ever found, save_active_entity for this node flips the disposition to resolved.`,
    nextRequiredNode: next ? { nodeId: next.nodeId, nodeType: next.nodeType, canonicalName: next.canonicalName } : null,
  };
}

// ============================================================================
// 9. save_active_entity
// ============================================================================
export function toolSaveActiveEntity(args: { provinceId: string; entity: PlaceEntity; expectedNodeId: string }) {
  const state = readNotes(args.provinceId);
  const entity = normalizeEntityUrls(args.entity);

  // DFS advisory: warn if saving for a node that's not the current required node
  const current = nextRequiredNode(args.provinceId);
  let dfsWarning: string | undefined;
  if (current && current.nodeId !== args.expectedNodeId) {
    const branch = getCurrentBranch(args.provinceId);
    const branchPath = branch.map((n) => `${n.nodeId}(${n.nodeType})`).join(" → ");
    dfsWarning =
      `DFS ADVISORY: You are saving entity for '${args.expectedNodeId}' but the current required node is '${current.nodeId}'. ` +
      `Current branch: ${branchPath}. ` +
      `You can save entities for discovered nodes, but you CANNOT mark them complete until '${current.nodeId}' is fully done.`;
  }

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

  const response: Record<string, unknown> = {
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
  if (dfsWarning) response.dfsWarning = dfsWarning;
  return response;
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

  // Semantic validation (structural checks are not enough):
  const state = readNotes(args.provinceId);
  const fromAncestors = new Set(ancestorChain(state, args.fromId).map((n) => n.nodeId));
  const toAncestors = new Set(ancestorChain(state, args.toId).map((n) => n.nodeId));
  const toType = entityNodeType(to.entity);
  if (args.relationType === "parent" && !fromAncestors.has(args.toId)) {
    throw new Error(`relationType 'parent' requires the target '${args.toId}' to be a real administrative ancestor of '${args.fromId}'.`);
  }
  if (args.relationType === "child" && !toAncestors.has(args.fromId)) {
    throw new Error(`relationType 'child' requires '${args.fromId}' to be a real administrative ancestor of the target '${args.toId}'.`);
  }
  if (args.relationType === "gateway_city" && toType !== "city") {
    throw new Error(`relationType 'gateway_city' requires the target '${args.toId}' to be a city (got ${toType}).`);
  }
  if (args.relationType === "nearby" && (fromAncestors.has(args.toId) || toAncestors.has(args.fromId))) {
    throw new Error(`relationType 'nearby' must not point at an administrative parent/child; '${args.fromId}' and '${args.toId}' are in a parent-child line.`);
  }

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

      const childType = TRACK_CHILD_TYPE[track];
      if (childType) {
        const count = Number(p.count);
        if (!Number.isInteger(count) || count < 0) {
          throw new Error(
            `complete_discovery_task track '${track}' requires a non-negative integer 'count' = the full number of ${track} you discovered (e.g. 10 for counties). This is the completion contract.`,
          );
        }
        completeDiscoveryTask(state, nodeId, track, count);
      } else {
        completeDiscoveryTask(state, nodeId, track);
      }
      break;
    }

    case "mark_node_complete": {
      const nodeId = String(p.nodeId);
      if (!findNode(state, nodeId)) {
        throw new Error(`Node '${nodeId}' is not registered.`);
      }

      // Staged-scope enforcement: when a scope is active, only nodes inside its
      // subtree may be completed; ancestors (e.g. the province) need their own
      // scope run.
      if (!isWithinActiveScope(state, nodeId)) {
        throw new Error(
          `SCOPE VIOLATION: active scope is '${state.activeScopeId}'. Node '${nodeId}' is outside this scope. ` +
            `Select it first with set_active_scope, or complete the current scope and stop.`,
        );
      }

      // DFS enforcement: only the current required node can be marked complete
      const current = nextRequiredNode(args.provinceId);
      if (current && current.nodeId !== nodeId) {
        const branch = getCurrentBranch(args.provinceId);
        const branchPath = branch.map((n) => `${n.nodeId}(${n.nodeType})`).join(" → ");
        throw new Error(
          `DFS ORDER VIOLATION: Cannot mark '${nodeId}' complete — it is not the current required node. ` +
          `Current required node: '${current.nodeId}' (${current.nodeType}). ` +
          `Current branch: ${branchPath}. ` +
          `You MUST complete '${current.nodeId}' first before marking other nodes complete.`,
        );
      }

      // Gate: refuse unless entity active + all discovery complete + no open candidates/conflicts.
      const status = nodeStatus(args.provinceId, findNode(state, nodeId)!);
      if (!status.complete) {
        throw new Error(`Cannot mark node complete: ${status.blockingReasons.join("; ")}`);
      }
      findNode(state, nodeId)!.state = "complete";
      
      // Check if this is the last pending node
      const pendingCount = traverse(args.provinceId).filter((n) => {
        const st = nodeStatus(args.provinceId, n);
        return !st.complete;
      }).length;
      
      if (pendingCount === 0) {
        writeNotes(state);
        return { 
          updated: true, 
          operation: op, 
          provinceId: args.provinceId,
          reminder: "All nodes complete! You MUST now run check_definition_of_done and validate_province. Only when both pass (complete:true AND invalid:0) can you produce the final report.",
          dodStatus: state.dodStatus 
            ? { checked: true, complete: state.dodStatus.dodComplete, invalid: state.dodStatus.validateInvalid }
            : { checked: false, complete: false, invalid: -1 }
        };
      }
      break;
    }

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
  // Scope-aware DoD: with an active scope, only that subtree's candidates,
  // conflicts and node types count. Sibling scopes stay pending for their own
  // runs and must not keep a finished scope at complete:false forever.
  const scopeIds = scopedNodeIds(state);
  const inScope = (nodeId: string) => scopeIds === null || scopeIds.has(nodeId);

  const missingAdministrativeNodes: string[] = [];
  if (scopeIds === null) {
    // Province-wide mode: the four administrative levels must all be present.
    // (Inside an active scope — e.g. a single county or village — ancestor
    // levels are intentionally out of scope, so this check does not apply.)
    const nodeTypesSeen = new Set(state.nodes.map((n) => n.nodeType));
    for (const nt of ["province", "county", "city", "village"] as NodeType[]) {
      if (!nodeTypesSeen.has(nt)) missingAdministrativeNodes.push(nt);
    }
  }

  const openCandidates = state.candidates.filter((c) => c.state === "open" && inScope(c.nodeId));
  const unresolvedConflicts = state.conflicts.filter((c) => c.state === "open" && inScope(c.nodeId));
  const mediaDeficitNodes = state.mediaDeficits
    .filter((d) => d.state === "recorded" && inScope(d.nodeId))
    .map((d) => {
      const n = state.nodes.find((x) => x.nodeId === d.nodeId);
      return { nodeId: d.nodeId, nodeType: n?.nodeType ?? null, name: n?.canonicalName ?? "", imagesFound: d.imagesFound };
    });

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
      const minImages = minImagesForNodeType(entityNodeType(e.entity));
      if (!e.entity.media?.thumbnail || images.length < minImages || images.length > MAX_IMAGES_PER_ENTITY) incompleteMedia.push(e.id);
      if (!e.entity.costs) incompleteCosts.push(e.id);
      if (!Array.isArray(e.entity.evidence) || e.entity.evidence.length === 0) missingEvidence.push(e.id);
    }
  }

  const complete =
    scope.definitionOfDone &&
    invalidRelations.length === 0 &&
    incompleteMedia.length === 0 &&
    incompleteCosts.length === 0 &&
    missingEvidence.length === 0 &&
    openCandidates.length === 0 &&
    unresolvedConflicts.length === 0 &&
    missingAdministrativeNodes.length === 0;

  // Build compact issues list for DoD status
  const issues: string[] = [];
  if (missingAdministrativeNodes.length > 0) issues.push(`missing admin: ${missingAdministrativeNodes.length}`);
  if (openCandidates.length > 0) issues.push(`open candidates: ${openCandidates.length}`);
  if (unresolvedConflicts.length > 0) issues.push(`unresolved conflicts: ${unresolvedConflicts.length}`);
  if (invalidRelations.length > 0) issues.push(`invalid relations: ${invalidRelations.length}`);
  if (incompleteMedia.length > 0) issues.push(`incomplete media: ${incompleteMedia.length}`);
  if (incompleteCosts.length > 0) issues.push(`incomplete costs: ${incompleteCosts.length}`);
  if (missingEvidence.length > 0) issues.push(`missing evidence: ${missingEvidence.length}`);

  // Update DoD status in notes
  updateDodStatus(state, complete, state.dodStatus?.validateInvalid ?? -1, state.dodStatus?.validateTotal ?? -1, issues);
  writeNotes(state);

  return {
    complete,
    scopeId: state.activeScopeId,
    missingAdministrativeNodes,
    mediaDeficitNodes,
    openCandidates: openCandidates.map((c) => c.id),
    unresolvedConflicts: unresolvedConflicts.map((c) => c.id),
    invalidRelations,
    incompleteMedia,
    incompleteCosts,
    missingEvidence,
    nextAction: complete ? null : scope.nextRequiredNode?.nodeId ?? "discover province administrative structure",
    reminder: complete
      ? `DoD check PASSED${state.activeScopeId ? ` for scope '${state.activeScopeId}'` : ""}. Now run validate_province to verify invalid:0 before the final report of this scope.`
      : `DoD check FAILED (${issues.length} issues). Fix all issues before final report.`,
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
    const result = validateEntity(e.entity, { provinceId: args.provinceId, expectedNodeId: e.entity.id, state, skipSelfDuplicate: true });
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

  // Build compact issues list for DoD status
  const issues: string[] = [];
  if (invalid.length > 0) {
    issues.push(`${invalid.length} invalid entities`);
    // Add first few entity IDs as examples
    const examples = invalid.slice(0, 5).map(e => e.entityId);
    if (examples.length > 0) {
      issues.push(`examples: ${examples.join(", ")}`);
    }
  }

  // Update DoD status in notes (preserve dodComplete from last check)
  updateDodStatus(
    state,
    state.dodStatus?.dodComplete ?? false,
    invalid.length,
    entities.length,
    issues,
  );
  writeNotes(state);

  return {
    provinceId: args.provinceId,
    total: entities.length,
    valid: entities.length - invalid.length,
    invalid: invalid.length,
    entities: invalid,
    reminder: invalid.length === 0
      ? "Validation PASSED (invalid:0). If DoD also passed, you may proceed to final report."
      : `Validation FAILED (${invalid.length} invalid). Fix all errors before final report.`,
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

// ============================================================================
// 16. list_pending_nodes — full work queue (all incomplete nodes in DFS order)
// ============================================================================
export function toolListPendingNodes(args: { provinceId: string }) {
  const nodes = traverse(args.provinceId).map((n) => {
    const st = nodeStatus(args.provinceId, n);
    return {
      nodeId: n.nodeId,
      nodeType: n.nodeType,
      canonicalName: n.canonicalName,
      parentNodeId: n.parentNodeId,
      entityActive: st.entityActive,
      mediaDeficit: st.mediaDeficit,
      pendingDiscovery: st.pendingDiscovery,
      openCandidates: st.openCandidates,
      openConflicts: st.openConflicts,
      complete: st.complete,
    };
  });
  const pending = nodes.filter((n) => !n.complete);
  const state = readNotes(args.provinceId);
  return {
    provinceId: args.provinceId,
    total: nodes.length,
    complete: nodes.length - pending.length,
    pending: pending.length,
    nodes: pending,
    reminder: pending.length === 0
      ? "All nodes complete! You MUST now run check_definition_of_done and validate_province. Only when both pass (complete:true AND invalid:0) can you produce the final report."
      : undefined,
    dodStatus: pending.length === 0
      ? (state.dodStatus
          ? { checked: true, complete: state.dodStatus.dodComplete, invalid: state.dodStatus.validateInvalid }
          : { checked: false, complete: false, invalid: -1 })
      : undefined,
  };
}
