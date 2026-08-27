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
  awaitingScopeSelection,
  scopedNodeIds,
} from "./graph.js";
import { validateEntity, isRawHttpsUrl, normalizeEntityUrls } from "./quality-gate.js";
import { getSchemas } from "./schemas.js";
import { mediaPolicyFor, mediaStatusFor } from "./media.js";
import { getSourcePolicy, classifySource, sourceCoverageFor } from "./source-policy.js";
import { buildDiscoveryQueries, DISCOVERY_NODE_TYPES, type DiscoveryContext } from "./discovery.js";
import { buildScopeRegistry, listProvinceScopesIndex } from "./scopes.js";
import type { NotesState, NodeType, OwnershipStatus, PlaceEntity, MediaDeficitRecord, MediaCandidate } from "./types.js";

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
    awaitingScopeSelection: s.awaitingScopeSelection,
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
    `Province stage: structure registered for ${registry.provinceId} (${registry.counts.counties} counties, ` +
    `${registry.counts.cities} cities, ${registry.counts.villages} villages). NEXT: deep-research the PROVINCE node itself — ` +
    `get_next_research_node returns '${registry.provinceId}': search it on the 5 mandatory primary sources (see source policy), ` +
    `save its entity (media is best-effort: target 10 images, partial OK, 0 → save without media), ` +
    `complete its provincePlaces/camping tracks, then mark_node_complete. ` +
    `After that STOP and ask the user which county/city/village to continue with ` +
    `(resolve Persian names to ids with resolve_scope_name).`;

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
    note:
      "Structure + dedicated ids registered. Continue with the PROVINCE STAGE: full research of the province node " +
      "(entity, province-level places, camping, best-effort media from the 5 primary sources), then STOP and ask the user " +
      "for the next scope. County/city/village subtrees are separate runs.",
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
  const state = readNotes(args.provinceId);
  if (awaitingScopeSelection(state)) {
    return {
      provinceId: args.provinceId,
      done: false,
      awaitingScopeSelection: true,
      node: null,
      instruction:
        "PROVINCE STAGE COMPLETE. STOP: report the finished province stage to the user and ask which county/city/village " +
        "to research next. Resolve the user's Persian name with resolve_scope_name, then call set_active_scope. " +
        "(For a continuous whole-province run, call set_active_scope with the province id itself.)",
    };
  }
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
  const classification = classifySource(args.sourceUrl);
  const entry = {
    id: newId("src"),
    nodeId: args.nodeId,
    query: args.query,
    sourceUrl: args.sourceUrl,
    sourceTitle: args.sourceTitle,
    resultSummary: args.resultSummary,
    ownershipStatus: args.ownershipStatus as OwnershipStatus,
    discoveredNames: args.discoveredNames,
    sourceClass: classification.sourceClass,
    sourceDomain: classification.domain,
    sourceName: classification.name,
    sourcePriority: classification.priority,
  };
  addSourceMatrixEntry(state, entry);
  writeNotes(state);
  const coverage = sourceCoverageFor(state, findNode(state, args.nodeId)?.nodeType, args.nodeId);
  return {
    recorded: true,
    entry,
    nodeId: args.nodeId,
    ownershipStatus: args.ownershipStatus,
    sourceClass: classification.sourceClass,
    sourceDomain: classification.domain,
    sourceCoverage: { searchedCount: coverage.searchedCount, required: coverage.required, satisfied: coverage.satisfied },
    reminder:
      classification.sourceClass === "other"
        ? "This source is NOT in the project source policy. The 5 mandatory primary sources (dataset/source_policy.json) must be searched first for every node."
        : undefined,
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
// 8b. mark_node_media_deficit — §9 disposition: close an entity node WITHOUT
// a JSON file. Under the BEST-EFFORT media policy a lack of images is NOT a
// reason to use this path (1..target-1 images → save with status "partial";
// 0 images → save WITHOUT media, status "unavailable"). This disposition is
// reserved for nodes where NO valid entity data at all could be gathered.
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
    throw new Error(`Node '${args.nodeId}' already has an active entity; the file-less disposition is only for nodes WITHOUT an active entity.`);
  }
  if (findMediaDeficit(state, args.nodeId)) {
    throw new Error(`Node '${args.nodeId}' already has a recorded file-less disposition.`);
  }
  const imagesFound = Number(args.imagesFound);
  if (!Number.isInteger(imagesFound) || imagesFound < 0 || imagesFound > 20) {
    throw new Error("imagesFound must be an integer between 0 and 20 (audit of usable images actually found).");
  }
  const usableCandidates = (state.mediaCandidates ?? []).filter(
    (m) => m.nodeId === args.nodeId && getSchemas().approvedLicenses.includes(m.license) && isRawHttpsUrl(m.imageUrl) && isRawHttpsUrl(m.pageUrl),
  );
  if (usableCandidates.length > 0) {
    throw new Error(
      `Node '${args.nodeId}' HAS ${usableCandidates.length} usable media candidate(s) — run finalize_media and save the entity ` +
        `(media is best-effort: even 1 image is saved as "partial"; media alone is never a reason to close a node without a file).`,
    );
  }
  const reason = String(args.reason ?? "").trim();
  if (!reason) {
    throw new Error(
      "reason is required: document why NO valid entity data at all could be gathered for this node " +
        "(media shortage is NOT a valid reason under the best-effort policy — 0 images → save without media).",
    );
  }
  const searchesPerformed = (args.searchesPerformed ?? []).map((x) => String(x).trim()).filter(Boolean);
  if (searchesPerformed.length < 2) {
    throw new Error(
      "searchesPerformed must list at least 2 distinct searches actually run across the mandatory primary sources and the web.",
    );
  }

  // DFS enforcement: the disposition may only be placed on the current required
  // node, same as mark_node_complete — siblings later in the traversal stay closed.
  const current = nextRequiredNode(args.provinceId);
  if (current && current.nodeId !== args.nodeId) {
    const branch = getCurrentBranch(args.provinceId);
    const branchPath = branch.map((n) => `${n.nodeId}(${n.nodeType})`).join(" → ");
    throw new Error(
      `DFS ORDER VIOLATION: Cannot mark '${args.nodeId}' file-less — it is not the current required node. ` +
      `Current required node: '${current.nodeId}' (${current.nodeType}). ` +
      `Current branch: ${branchPath}. ` +
      `You MUST complete '${current.nodeId}' first.`,
    );
  }
  // Staged workflow: closing a node outside the province stage needs an active scope.
  if (!current && awaitingScopeSelection(state)) {
    throw new Error(
      `AWAITING SCOPE SELECTION: the province stage is complete. Ask the user for the next scope, ` +
        `resolve it with resolve_scope_name and call set_active_scope before working on '${args.nodeId}'.`,
    );
  }

  // All other completion conditions still apply: discovery tracks closed, no
  // open candidates/conflicts on the node, primary-source coverage searched.
  const before = nodeStatus(args.provinceId, node);
  const remaining = before.blockingReasons.filter((r) => r !== "entity not saved as active");
  if (remaining.length > 0) {
    throw new Error(
      `Cannot mark '${args.nodeId}' file-less: close these first: ${remaining.join("; ")}. ` +
      `(The disposition only waives the missing active entity — it never waives discovery, candidates, conflicts or source coverage.)`,
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
  state.nextStep = `Marked ${args.nodeId} (${node.nodeType}, ${node.canonicalName}) closed without JSON (no valid entity data). Continue with the next required node.`;
  writeNotes(state);

  const next = nextRequiredNode(args.provinceId);
  return {
    recorded: true,
    dispositionId: record.id,
    nodeId: args.nodeId,
    nodeState: "media_deficit",
    imagesFound,
    note:
      `Node closed WITHOUT a JSON file. This path is ONLY for nodes with no valid entity data at all — a node with ` +
      `usable images (or any valid data) must be saved via save_active_entity (media is best-effort). mark_node_complete is not needed for this node.`,
    nextRequiredNode: next ? { nodeId: next.nodeId, nodeType: next.nodeType, canonicalName: next.canonicalName } : null,
  };
}

// ============================================================================
// 8c. record_media_candidate — best-effort media pipeline (§9), step 1:
// record EVERY attributable image found (never discard partial findings).
// ============================================================================

export function toolRecordMediaCandidate(args: {
  provinceId: string;
  nodeId: string;
  imageUrl: string;
  pageUrl: string;
  license: string;
  source?: string;
  credit?: string;
  alt?: string;
  caption?: string;
  score?: number;
}) {
  const state = readNotes(args.provinceId);
  if (!findNode(state, args.nodeId)) ensureNode(state, args.nodeId);
  const node = findNode(state, args.nodeId)!;
  if (!isRawHttpsUrl(args.imageUrl)) {
    throw new Error("imageUrl must be the raw HTTPS URL of the image file itself (no markdown/whitespace).");
  }
  if (!isRawHttpsUrl(args.pageUrl)) {
    throw new Error("pageUrl must be the raw HTTPS URL of the page hosting/licensing the image.");
  }
  const schemas = getSchemas();
  if (!schemas.approvedLicenses.includes(args.license)) {
    throw new Error(`license must be one of: ${schemas.approvedLicenses.join(", ")}`);
  }
  let score = 0.5;
  if (args.score !== undefined) {
    score = Number(args.score);
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error("score must be a number between 0 and 1.");
  }

  // Idempotent by (nodeId, imageUrl).
  const dup = state.mediaCandidates.find((m) => m.nodeId === args.nodeId && m.imageUrl === args.imageUrl);
  if (dup) {
    const policy = mediaPolicyFor(node.nodeType);
    const total = state.mediaCandidates.filter((m) => m.nodeId === args.nodeId).length;
    return { recorded: false, duplicateOf: dup.id, nodeId: args.nodeId, totals: { candidates: total, target: policy.target } };
  }

  const classification = classifySource(args.pageUrl);
  const candidate: MediaCandidate = {
    id: newId("mc"),
    nodeId: args.nodeId,
    imageUrl: args.imageUrl,
    pageUrl: args.pageUrl,
    source: (args.source ?? classification.name ?? classification.domain).trim(),
    credit: (args.credit ?? "").trim(),
    license: args.license,
    alt: (args.alt ?? "").trim(),
    caption: (args.caption ?? "").trim(),
    score,
    sourceClass: classification.sourceClass,
    sourceDomain: classification.domain,
    createdAt: new Date().toISOString(),
  };
  state.mediaCandidates.push(candidate);

  const policy = mediaPolicyFor(node.nodeType);
  const nodeCandidates = state.mediaCandidates.filter((m) => m.nodeId === args.nodeId).length;
  state.nextStep =
    `Media candidate ${nodeCandidates} recorded for ${args.nodeId} (target ${policy.target}). ` +
    (nodeCandidates >= policy.target
      ? `Target reached — run finalize_media to pick the best set, then save.`
      : `Keep searching the primary sources and web image search; run finalize_media when done (partial is OK).`);
  writeNotes(state);

  const coverage = sourceCoverageFor(state, node.nodeType, args.nodeId);
  return {
    recorded: true,
    candidateId: candidate.id,
    nodeId: args.nodeId,
    sourceClass: classification.sourceClass,
    sourceDomain: classification.domain,
    totals: { candidates: nodeCandidates, target: policy.target },
    sourceCoverage: { searchedCount: coverage.searchedCount, required: coverage.required, satisfied: coverage.satisfied },
    note:
      `Best-effort policy: every attributable image counts — even 1 image is saved as "partial"; 0 images → the entity is ` +
      `saved WITHOUT media. Do NOT discard images because they are below the target.`,
  };
}

// ============================================================================
// 8d. finalize_media — best-effort media pipeline (§9), step 2: dedupe, rank
// and pick the best media set for the node. Returns the media object to
// attach to the entity before save_active_entity (which verifies it).
// ============================================================================

const FREE_LICENSE_HINTS = ["CC0", "Public-Domain", "CC-BY", "CC-BY-SA"];

function candidateRank(m: MediaCandidate): number {
  const licenseBonus = FREE_LICENSE_HINTS.some((h) => m.license.startsWith(h)) ? 0.05 : 0;
  const sourceBonus = m.sourceClass === "primary" ? 0.02 : 0;
  return m.score + licenseBonus + sourceBonus;
}

function candidateToMediaItem(m: MediaCandidate, nodeName: string): Record<string, unknown> {
  const source = m.source || m.sourceDomain || "web";
  return {
    url: m.imageUrl,
    alt: m.alt || `تصویر ${nodeName}`,
    caption: m.caption || m.alt || nodeName,
    credit: m.credit || source,
    license: m.license,
    source,
    sourceUrl: m.pageUrl,
  };
}

export function toolFinalizeMedia(args: { provinceId: string; nodeId: string }) {
  const state = readNotes(args.provinceId);
  const node = findNode(state, args.nodeId);
  if (!node) throw new Error(`Node '${args.nodeId}' is not registered for province '${args.provinceId}'.`);
  const policy = mediaPolicyFor(node.nodeType);

  const all = state.mediaCandidates.filter((m) => m.nodeId === args.nodeId);
  const byUrl = new Map<string, MediaCandidate>();
  for (const m of all) {
    const prev = byUrl.get(m.imageUrl);
    if (!prev || candidateRank(m) > candidateRank(prev)) byUrl.set(m.imageUrl, m);
  }
  const schemas = getSchemas();
  const usable = [...byUrl.values()]
    .filter((m) => isRawHttpsUrl(m.imageUrl) && isRawHttpsUrl(m.pageUrl) && schemas.approvedLicenses.includes(m.license))
    .sort((a, b) => candidateRank(b) - candidateRank(a));

  // FINAL CONTRACT: the stored set is exactly the best min(usable, target)
  // distinct images — NEVER more than target. The thumbnail counts inside this
  // budget: best candidate → thumbnail, the rest (up to target-1) → images.
  // A single-image set may reuse its only image as the thumbnail.
  const selected = Math.min(usable.length, policy.target);
  let thumbnail: MediaCandidate | null = null;
  let images: MediaCandidate[] = [];
  if (selected === 1) {
    thumbnail = usable[0];
    images = [usable[0]];
  } else if (selected >= 2) {
    thumbnail = usable[0];
    images = usable.slice(1, selected);
  }

  const distinct = new Set<string>([...images.map((m) => m.imageUrl), ...(thumbnail ? [thumbnail.imageUrl] : [])]).size;
  const status = mediaStatusFor(node.nodeType, distinct);

  const media: Record<string, unknown> = {
    status,
    ...(thumbnail ? { thumbnail: candidateToMediaItem(thumbnail, node.canonicalName) } : {}),
    ...(images.length > 0 ? { images: images.map((m) => candidateToMediaItem(m, node.canonicalName)) } : {}),
  };

  state.nextStep =
    `Media finalized for ${args.nodeId}: ${all.length} candidate(s) → ${usable.length} usable → best ${distinct} of target ${policy.target} stored ` +
    `(${images.length} in images + distinct thumbnail; ${status}). Attach media to the entity and save_active_entity.`;
  writeNotes(state);

  return {
    provinceId: args.provinceId,
    nodeId: args.nodeId,
    policy,
    audit: {
      candidates: all.length,
      deduplicated: byUrl.size,
      usable: usable.length,
      selectedTotal: distinct,
      target: policy.target,
      keptImages: images.length,
      keptThumbnail: !!thumbnail,
    },
    mediaStatus: status,
    media,
    note:
      status === "unavailable"
        ? "No usable image candidates — save the entity WITHOUT media (media.status 'unavailable' is injected automatically at save; primary-source coverage must be complete)."
        : `Stored the best ${distinct} image(s) (target ${policy.target}, never more): thumbnail + ${images.length} in images. Attach this media object to entity.media and save with save_active_entity.`,
  };
}

// ============================================================================
// 8e. resolve_scope_name — resolve a Persian name (province/county/city/
// village) to its dedicated scope id. The agent must NEVER ask the user for
// raw ids when the name is resolvable (only genuinely ambiguous names are).
// ============================================================================

function normalizeFa(s: string): string {
  return String(s ?? "")
    .trim()
    .replace(/\u200c/g, " ")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function toolResolveScopeName(args: { provinceId?: string; name: string; expectedType?: string }) {
  const name = String(args.name ?? "").trim();
  if (!name) throw new Error("name is required (Persian name or scope id).");

  // Bare scope id → resolve directly from the registry.
  if (/^(province|county|city|village)-[\w-]+$/.test(name)) {
    const pid = args.provinceId ?? (name.startsWith("province-") ? name : undefined);
    if (!pid) {
      throw new Error(`A bare id for '${name}' needs provinceId too (or pass the Persian name instead).`);
    }
    const reg = buildScopeRegistry(pid);
    const unit =
      reg.index[name] ??
      (name === reg.provinceId ? { id: reg.provinceId, name: reg.provinceName, type: "province" as const, parentId: "" } : undefined);
    if (!unit) throw new Error(`'${name}' is not a valid scope id in ${pid}.`);
    return { resolved: true, provinceId: pid, matches: [{ nodeId: unit.id, name: unit.name, type: unit.type, parentId: unit.parentId }] };
  }

  // Province name without provinceId → resolve across all 31 provinces.
  if (!args.provinceId) {
    const idx = listProvinceScopesIndex();
    const hits = idx.filter((px) => normalizeFa(px.provinceName) === normalizeFa(name));
    if (hits.length === 1) {
      return {
        resolved: true,
        provinceId: hits[0].provinceId,
        matches: [{ nodeId: hits[0].provinceId, name: hits[0].provinceName, type: "province", parentId: null }],
        nextAction: "This is the province itself. Run import_province_scopes if not done, then continue the province stage.",
      };
    }
    const suggestions = idx.filter((px) => normalizeFa(px.provinceName).includes(normalizeFa(name))).slice(0, 10);
    throw new Error(
      hits.length === 0
        ? `No province named '${name}' found.${suggestions.length ? ` Did you mean: ${suggestions.map((sx) => `${sx.provinceName} (${sx.provinceId})`).join("، ")}` : ""}`
        : `Ambiguous province name '${name}'.`,
    );
  }

  // Inside a province: county/city/village lookup with type filter.
  const reg = buildScopeRegistry(args.provinceId);
  const target = normalizeFa(name);
  const matches = Object.values(reg.index).filter(
    (u) => normalizeFa(u.name) === target && (!args.expectedType || u.type === args.expectedType),
  );
  if (matches.length === 1) {
    return {
      resolved: true,
      provinceId: args.provinceId,
      matches: [{ nodeId: matches[0].id, name: matches[0].name, type: matches[0].type, parentId: matches[0].parentId }],
      nextAction: `Call set_active_scope with nodeId '${matches[0].id}' and deep-research that scope.`,
    };
  }
  if (matches.length > 1) {
    return {
      resolved: false,
      ambiguous: true,
      provinceId: args.provinceId,
      matches: matches.slice(0, 15).map((u) => ({ nodeId: u.id, name: u.name, type: u.type, parentId: u.parentId })),
      nextAction: `Name '${name}' matches ${matches.length} units — ask the user to pick one of the listed nodeIds (this is the ONLY case where asking is legitimate).`,
    };
  }
  const contains = Object.values(reg.index)
    .filter((u) => normalizeFa(u.name).includes(target) && (!args.expectedType || u.type === args.expectedType))
    .slice(0, 10);
  return {
    resolved: false,
    ambiguous: false,
    provinceId: args.provinceId,
    suggestions: contains.map((u) => ({ nodeId: u.id, name: u.name, type: u.type, parentId: u.parentId })),
    nextAction: contains.length
      ? `No exact match for '${name}'. Closest suggestions listed — verify with the user or the web before set_active_scope.`
      : `No match for '${name}' in ${args.provinceId}. Check the spelling (source: input registry).`,
  };
}

// ============================================================================
// 8f. get_source_coverage — audit of the mandatory primary-source searches.
// ============================================================================

export function toolGetSourceCoverage(args: { provinceId: string; nodeId?: string }) {
  const state = readNotes(args.provinceId);
  if (args.nodeId) {
    const node = findNode(state, args.nodeId);
    if (!node) throw new Error(`Node '${args.nodeId}' is not registered for province '${args.provinceId}'.`);
    const coverage = sourceCoverageFor(state, node.nodeType, args.nodeId);
    return { provinceId: args.provinceId, nodeId: args.nodeId, nodeType: node.nodeType, ...coverage };
  }
  const ENTITY_TYPES: NodeType[] = ["province", "county", "city", "village", "place", "camping"];
  const rows = state.nodes
    .filter((n) => ENTITY_TYPES.includes(n.nodeType))
    .map((n) => {
      const c = sourceCoverageFor(state, n.nodeType, n.nodeId);
      return { nodeId: n.nodeId, nodeType: n.nodeType, name: n.canonicalName, searchedCount: c.searchedCount, required: c.required, satisfied: c.satisfied };
    })
    .filter((r) => !r.satisfied);
  return {
    provinceId: args.provinceId,
    policy: getSourcePolicy().primary.map((px) => `${px.priority}. ${px.name} (${px.domain})`),
    unsatisfiedCount: rows.length,
    unsatisfied: rows.slice(0, 50),
    note: "A node cannot be completed until its required primary-source coverage is satisfied (searches recorded via record_search_result and/or media candidates).",
  };
}

// ============================================================================
// 9. save_active_entity
// ============================================================================
export function toolSaveActiveEntity(args: { provinceId: string; entity: PlaceEntity; expectedNodeId: string }) {
  const state = readNotes(args.provinceId);
  let entity = normalizeEntityUrls(args.entity);

  // Best-effort media policy (§9): always carry a media.status that matches the
  // actual distinct image count (unavailable when there is no usable image).
  let distinctImageCount = 0;
  {
    const nodeType = entityNodeType(entity);
    const media = (entity.media ?? {}) as Record<string, unknown>;
    const distinct = new Set<string>();
    if (typeof (media.thumbnail as any)?.url === "string") distinct.add((media.thumbnail as any).url);
    for (const im of ((media.images as any[]) ?? [])) if (typeof im?.url === "string") distinct.add(im.url);
    distinctImageCount = distinct.size;
    media.status = mediaStatusFor(nodeType, distinct.size);
    entity = { ...entity, media } as PlaceEntity;
  }

  // FINAL CONTRACT (§9): an entity may only be saved WITHOUT images after the
  // mandatory primary-source coverage for its node is complete — "nothing
  // found" is credible only after all required primaries were attempted.
  let mediaAdvisory: string | undefined;
  {
    const nodeType = entityNodeType(entity);
    const policy = mediaPolicyFor(nodeType);
    if (distinctImageCount === 0) {
      const coverage = sourceCoverageFor(state, nodeType, args.expectedNodeId);
      if (!coverage.satisfied) {
        const missing = coverage.searched.filter((x) => !x.searched).map((x) => `${x.name} (${x.domain})`).join("، ");
        return {
          accepted: false,
          errors: [
            {
              code: "MEDIA_ZERO_WITHOUT_PRIMARY_COVERAGE",
              path: "media",
              message:
                `Cannot save '${args.expectedNodeId}' with ZERO images: primary-source coverage is ` +
                `${coverage.searchedCount}/${coverage.required} (missing: ${missing}). Search/attempt every mandatory primary ` +
                `source and record it with record_search_result (a recorded "no result/unreachable" attempt counts), then save. ` +
                `Zero images is NOT a failure — but it is only allowed after the full required coverage.`,
            },
          ],
          warnings: [],
        };
      }
    } else if (distinctImageCount > policy.target) {
      mediaAdvisory =
        `Media advisory: ${distinctImageCount} distinct images exceed the target ${policy.target} for this entity type. ` +
        `The final selection must not exceed the target — keep the best ${policy.target} (finalize_media does this automatically). ` +
        `The save is accepted (hard cap is ${policy.max}), but trim to the best ${policy.target}.`;
    }
  }

  // DFS advisory: warn if saving for a node that's not the current required node
  const current = nextRequiredNode(args.provinceId);
  let dfsWarning: string | undefined;
  if (!current && awaitingScopeSelection(state)) {
    dfsWarning =
      `AWAITING SCOPE SELECTION: the province stage is complete. You may save this entity, but to COMPLETE or close ` +
      `'${args.expectedNodeId}' you must first ask the user for the scope, resolve it with resolve_scope_name and call set_active_scope.`;
  } else if (current && current.nodeId !== args.expectedNodeId) {
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
  if (mediaAdvisory) response.mediaAdvisory = mediaAdvisory;
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

      // Staged workflow gate: after the province stage is complete, no other
      // node may be completed until the user picks the next scope.
      const provinceNode = state.nodes.find((n) => n.nodeType === "province");
      if (awaitingScopeSelection(state) && nodeId !== provinceNode?.nodeId) {
        throw new Error(
          `AWAITING SCOPE SELECTION: the province stage is complete. Ask the user which county/city/village to ` +
            `research next (resolve the Persian name with resolve_scope_name), then call set_active_scope before ` +
            `completing '${nodeId}'. For a continuous whole-province run, set the active scope to the province id.`,
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

      // Gate: refuse unless entity active + all discovery complete + no open candidates/conflicts + source coverage.
      const status = nodeStatus(args.provinceId, findNode(state, nodeId)!);
      if (!status.complete) {
        throw new Error(`Cannot mark node complete: ${status.blockingReasons.join("; ")}`);
      }
      findNode(state, nodeId)!.state = "complete";

      // Province-stage completion → the staged workflow now waits for the user.
      if (provinceNode && nodeId === provinceNode.nodeId && !state.activeScopeId) {
        state.nextStep =
          `PROVINCE STAGE COMPLETE. STOP: report the finished province stage to the user and ask which ` +
          `county/city/village to research next (resolve names with resolve_scope_name, then set_active_scope).`;
        writeNotes(state);
        return {
          updated: true,
          operation: op,
          provinceId: args.provinceId,
          provinceStageComplete: true,
          reminder:
            "Province stage complete! Do NOT auto-dive into counties. Ask the user for the next scope; resolve the " +
            "Persian name with resolve_scope_name and lock it with set_active_scope.",
        };
      }
      
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
      // Best-effort media policy: no minimum count — only structural problems
      // (over-capacity, images without thumbnail) count as incomplete.
      const media = e.entity.media as any;
      const images = (media?.images as any[]) ?? [];
      const policy = mediaPolicyFor(entityNodeType(e.entity));
      if (images.length > policy.max || (images.length > 0 && !media?.thumbnail)) incompleteMedia.push(e.id);
      if (!e.entity.costs) incompleteCosts.push(e.id);
      if (!Array.isArray(e.entity.evidence) || e.entity.evidence.length === 0) missingEvidence.push(e.id);
    }
  }

  // Primary-source coverage across the scope (nodes blocked on missing searches).
  const coverageRows = state.nodes
    .filter((n) => inScope(n.nodeId) && ["province", "county", "city", "village", "place", "camping"].includes(n.nodeType))
    .map((n) => {
      const c = sourceCoverageFor(state, n.nodeType, n.nodeId);
      return { nodeId: n.nodeId, nodeType: n.nodeType, searchedCount: c.searchedCount, required: c.required, satisfied: c.satisfied };
    })
    .filter((r) => !r.satisfied);

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
  if (coverageRows.length > 0) issues.push(`missing source coverage: ${coverageRows.length} node(s)`);

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
    missingSourceCoverage: coverageRows.slice(0, 50),
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
