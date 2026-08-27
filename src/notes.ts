import fs from "node:fs";
import path from "node:path";
import { config, safeJoin, assertProvinceId } from "./config.js";
import type {
  NotesState,
  DodStatus,
  NodeRecord,
  DiscoveryTask,
  Candidate,
  Conflict,
  SourceMatrixEntry,
  RegistryEntry,
  ResearchCoverageEntry,
  MediaDeficitRecord,
  OwnershipStatus,
} from "./types.js";

const STATE_MARKER = "<!-- planro:state -->";
const STATE_MARKER_END = "<!-- /planro:state -->";

export function notesPath(provinceId: string): string {
  return safeJoin(config.outputDir, [assertProvinceId(provinceId), "notes.md"]);
}

/** Separate state file — keeps the markdown lean for agent context. */
function statePath(provinceId: string): string {
  return safeJoin(config.outputDir, [assertProvinceId(provinceId), "notes.state.json"]);
}

export function provinceDir(provinceId: string): string {
  return safeJoin(config.outputDir, [assertProvinceId(provinceId)]);
}

function emptyState(provinceId: string): NotesState {
  return {
    provinceId,
    lastUpdate: new Date().toISOString(),
    scopeStatus: "in_progress",
    activeScopeId: null,
    nodes: [],
    discoveryTasks: [],
    candidates: [],
    conflicts: [],
    sourceMatrix: [],
    registry: [],
    researchCoverage: [],
    mediaDeficits: [],
    nextStep: "",
    dodStatus: null,
  };
}

/** Parse notes state from the separate JSON file, falling back to embedded state in notes.md. */
export function readNotes(provinceId: string): NotesState {
  // Primary: read from separate state file (new format)
  const sFile = statePath(provinceId);
  if (fs.existsSync(sFile)) {
    try {
      const json = fs.readFileSync(sFile, "utf8");
      const parsed = JSON.parse(json) as Partial<NotesState>;
      return normalizeState(provinceId, parsed);
    } catch {
      // Fall through to markdown parsing
    }
  }

  // Fallback: parse embedded state from notes.md (legacy format)
  const file = notesPath(provinceId);
  if (!fs.existsSync(file)) {
    return emptyState(provinceId);
  }
  const text = fs.readFileSync(file, "utf8");
  const start = text.indexOf(STATE_MARKER);
  const end = text.indexOf(STATE_MARKER_END);
  if (start === -1 || end === -1 || end <= start) {
    return { ...emptyState(provinceId), nextStep: extractNextStep(text) };
  }
  const json = text.slice(start + STATE_MARKER.length, end).trim();
  try {
    const parsed = JSON.parse(json) as Partial<NotesState>;
    return normalizeState(provinceId, parsed);
  } catch {
    return { ...emptyState(provinceId), nextStep: extractNextStep(text) };
  }
}

function extractNextStep(text: string): string {
  const m = text.match(/## Next mandatory step\s*\n\s*- (.+)/);
  return m ? m[1].trim() : "";
}

function normalizeState(provinceId: string, p: Partial<NotesState>): NotesState {
  const base = emptyState(provinceId);

  // Restore full shape for compacted candidates (resolved ones may have stripped fields).
  const candidates: Candidate[] = Array.isArray(p.candidates)
    ? (p.candidates as Partial<Candidate>[]).map((c) => ({
        id: c.id ?? "",
        provinceId: c.provinceId ?? provinceId,
        nodeId: c.nodeId ?? "",
        name: c.name ?? "",
        entityKind: c.entityKind ?? "",
        query: c.query ?? "",
        sourceUrls: c.sourceUrls ?? [],
        reason: c.reason ?? "",
        blockingRequirements: c.blockingRequirements ?? [],
        state: c.state === "open" ? "open" : "resolved",
        outcome: c.outcome,
        createdAt: c.createdAt ?? "",
      }))
    : [];

  // Restore full shape for compacted conflicts.
  const conflicts: Conflict[] = Array.isArray(p.conflicts)
    ? (p.conflicts as Partial<Conflict>[]).map((c) => ({
        id: c.id ?? "",
        nodeId: c.nodeId ?? "",
        description: c.description ?? "",
        state: c.state === "open" ? "open" : "resolved",
        resolution: c.resolution,
      }))
    : [];

  // Restore full shape for media-deficit dispositions.
  const mediaDeficits: MediaDeficitRecord[] = Array.isArray((p as Partial<NotesState>).mediaDeficits)
    ? (((p as Partial<NotesState>).mediaDeficits ?? []) as Partial<MediaDeficitRecord>[]).map((d) => ({
        id: d.id ?? "",
        nodeId: d.nodeId ?? "",
        reason: d.reason ?? "",
        blockingRequirements: d.blockingRequirements ?? ["insufficient_verifiable_media"],
        imagesFound: typeof d.imagesFound === "number" ? d.imagesFound : 0,
        searchesPerformed: Array.isArray(d.searchesPerformed) ? d.searchesPerformed : [],
        state: d.state === "resolved" ? "resolved" : "recorded",
        outcome: d.outcome,
        createdAt: d.createdAt ?? "",
        resolvedAt: d.resolvedAt,
      }))
    : [];

  return {
    provinceId: provinceId,
    lastUpdate: p.lastUpdate ?? base.lastUpdate,
    scopeStatus: p.scopeStatus === "complete" ? "complete" : "in_progress",
    activeScopeId: typeof p.activeScopeId === "string" && p.activeScopeId.length > 0 ? p.activeScopeId : null,
    nodes: Array.isArray(p.nodes) ? p.nodes : [],
    discoveryTasks: Array.isArray(p.discoveryTasks) ? p.discoveryTasks : [],
    candidates,
    conflicts,
    sourceMatrix: Array.isArray(p.sourceMatrix) ? p.sourceMatrix : [],
    registry: Array.isArray(p.registry) ? p.registry : [],
    researchCoverage: Array.isArray(p.researchCoverage) ? p.researchCoverage : [],
    mediaDeficits,
    nextStep: p.nextStep ?? "",
    dodStatus: p.dodStatus ?? null,
  };
}

/** Build a compact progress summary: counts by type×state instead of listing every node. */
function renderProgressTable(nodes: NodeRecord[]): string {
  const types = ["province", "county", "district", "ruralDistrict", "city", "village", "place", "camping"] as const;

  const counts = new Map<string, Map<string, number>>();
  for (const n of nodes) {
    if (!counts.has(n.nodeType)) counts.set(n.nodeType, new Map());
    const m = counts.get(n.nodeType)!;
    m.set(n.state, (m.get(n.state) ?? 0) + 1);
  }

  const rows: string[] = [];
  for (const t of types) {
    const m = counts.get(t);
    if (!m) continue;
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const c = m.get("complete") ?? 0;
    const md = m.get("media_deficit") ?? 0;
    const ip = m.get("in_progress") ?? 0;
    const rr = m.get("research_required") ?? 0;
    rows.push(`| ${t} | ${total} | ${c} | ${md} | ${ip} | ${rr} |`);
  }
  if (rows.length === 0) return "- (no nodes)";
  return [
    "| type | total | ✓ done | 📷 media-deficit | ⟳ wip | ⊘ pending |",
    "|---|---:|---:|---:|---:|---:|",
    ...rows,
  ].join("\n");
}

/**
 * Only show nodes the agent needs to see individually:
 * - Province and counties (always — they're the main work units)
 * - Cities/villages/places that are in_progress or complete (significant entities)
 * Skip: complete districts, ruralDistricts (intermediate admin — progress table covers them)
 */
function renderActionableNodes(nodes: NodeRecord[]): string {
  const actionable = nodes.filter((n) => {
    // Always show province and counties
    if (n.nodeType === "province" || n.nodeType === "county") return true;
    // Show in-progress nodes of any type (agent is working on these)
    if (n.state === "in_progress") return true;
    // Show media-deficit cities, villages, places (closed without a JSON file — audit-relevant)
    if (n.state === "media_deficit" && ["city", "village", "place", "camping"].includes(n.nodeType)) return true;
    // Show complete cities, villages, places (these have actual entity files)
    if (n.state === "complete" && ["city", "village", "place", "camping"].includes(n.nodeType)) return true;
    return false;
  });
  if (actionable.length === 0) return "- (none)";
  return actionable
    .map((n) => `- ${n.nodeId} (${n.nodeType}) ${n.canonicalName} — ${n.state}`)
    .join("\n");
}

function renderRegistryTable(registry: RegistryEntry[]): string {
  const active = registry.filter((r) => r.status === "active");
  if (active.length === 0) return "| | | | |";
  return [
    "| id | slug | path | status |",
    "|---|---|---|---|",
    ...active.map((r) => `| ${r.id} | ${r.slug} | ${r.path} | ${r.status} |`),
  ].join("\n");
}

/** Render DoD status: one line showing readiness or blocking issues. */
function renderDodStatus(dod: NotesState["dodStatus"]): string {
  if (!dod) {
    return "- ⊘ Never checked — run check_definition_of_done + validate_province";
  }
  const time = dod.lastCheck.replace("T", " ").slice(0, 19);
  if (dod.dodComplete && dod.validateInvalid === 0) {
    return `- ✓ PASSED (${time}) — complete:true, invalid:0 — ready for final report`;
  }
  const issues = dod.issues.length > 0 ? `: ${dod.issues.slice(0, 5).join(", ")}` : "";
  return `- ⊘ NOT READY (${time}) — complete:${dod.dodComplete}, invalid:${dod.validateInvalid}/${dod.validateTotal}${issues}`;
}

/**
 * Compact the state for persistence: strip heavy fields from resolved
 * candidates/conflicts so the JSON block stays small. Open items keep
 * full detail; resolved items keep only what's needed for audit.
 */
function compactStateForStorage(state: NotesState): Record<string, unknown> {
  const compactCandidates = state.candidates.map((c) => {
    if (c.state === "open") return c; // keep full detail for open candidates
    return {
      id: c.id,
      nodeId: c.nodeId,
      name: c.name,
      entityKind: c.entityKind,
      state: c.state,
      outcome: c.outcome,
    };
  });

  const compactConflicts = state.conflicts.map((c) => {
    if (c.state === "open") return c;
    return {
      id: c.id,
      nodeId: c.nodeId,
      state: c.state,
      resolution: c.resolution,
    };
  });

  // Discovery tasks: keep all (they're small and needed for nodeStatus checks)
  // Source matrix: keep last 50 entries to cap growth (older entries are audit-only)
  const recentSources = state.sourceMatrix.slice(-50);

  // Media-deficit dispositions: recorded ones stay full (they document closed
  // but file-less nodes); resolved ones keep audit fields only.
  const compactDeficits = state.mediaDeficits.map((d) =>
    d.state === "recorded"
      ? d
      : { id: d.id, nodeId: d.nodeId, imagesFound: d.imagesFound, state: d.state, outcome: d.outcome, resolvedAt: d.resolvedAt },
  );

  return {
    provinceId: state.provinceId,
    lastUpdate: state.lastUpdate,
    scopeStatus: state.scopeStatus,
    activeScopeId: state.activeScopeId,
    nodes: state.nodes,
    discoveryTasks: state.discoveryTasks,
    candidates: compactCandidates,
    conflicts: compactConflicts,
    sourceMatrix: recentSources,
    registry: state.registry,
    researchCoverage: state.researchCoverage.slice(-20),
    mediaDeficits: compactDeficits,
    nextStep: state.nextStep,
    dodStatus: state.dodStatus,
  };
}

/** Compute the current DFS branch inline (avoids circular dependency with graph.ts). */
function computeCurrentBranch(state: NotesState): string {
  // Find first incomplete node in DFS order. A media_deficit node is a closed
  // terminal state, same as complete.
  const incomplete = state.nodes.filter((n) => n.state !== "complete" && n.state !== "media_deficit");
  if (incomplete.length === 0) return "(all complete)";

  // Simple heuristic: find the first incomplete node and build path to root
  const current = incomplete[0];
  const path: string[] = [];
  let cur: typeof current | undefined = current;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.nodeId)) {
    seen.add(cur.nodeId);
    path.unshift(`${cur.canonicalName}(${cur.nodeType})`);
    cur = cur.parentNodeId ? state.nodes.find((n) => n.nodeId === cur!.parentNodeId) : undefined;
  }
  return path.join(" → ");
}

function renderMarkdown(state: NotesState): string {
  const openCandidates = state.candidates.filter((c) => c.state === "open");
  const openConflicts = state.conflicts.filter((c) => c.state === "open");

  const candidateLines = openCandidates
    .map((c) => `- ${c.id}: ${c.name} (${c.entityKind}, node: ${c.nodeId}) — ${c.reason}`)
    .join("\n");

  const conflictLines = openConflicts
    .map((c) => `- ${c.id}: ${c.description}`)
    .join("\n");

  const openItems = [
    ...(candidateLines ? [`### Open candidates (${openCandidates.length})`, candidateLines] : []),
    ...(conflictLines ? [`### Open conflicts (${openConflicts.length})`, conflictLines] : []),
  ].join("\n");

  const currentBranch = computeCurrentBranch(state);

  const recordedDeficits = state.mediaDeficits.filter((d) => d.state === "recorded");
  const deficitLines = recordedDeficits
    .map((d) => {
      const n = state.nodes.find((x) => x.nodeId === d.nodeId);
      const name = n?.canonicalName ?? "";
      return `- ${d.nodeId} (${n?.nodeType ?? "?"}) ${name} — insufficient_verifiable_media (${d.imagesFound}/10 تصویر آزاد): ${d.reason}`;
    })
    .join("\n");

  return [
    `# Notes — ${state.provinceId}`,
    `- Updated: ${state.lastUpdate}`,
    `- Status: ${state.scopeStatus}`,
    `- Active scope: ${state.activeScopeId ?? "(province-wide)"}`,
    `- Current branch (DFS): ${currentBranch}`,
    "",
    "## Progress",
    renderProgressTable(state.nodes),
    "",
    "## Active nodes",
    renderActionableNodes(state.nodes),
    "",
    "## Registry",
    renderRegistryTable(state.registry),
    "",
    "## Media-deficit nodes (closed without JSON, §9)",
    deficitLines || "- (none)",
    "",
    "## Open items",
    openItems || "- (none)",
    "",
    "## DoD",
    renderDodStatus(state.dodStatus),
    "",
    "## Next step",
    `- ${state.nextStep || "(none)"}`,
    "",
  ].join("\n");
}

/** Atomically write notes.md (summary) and notes.state.json (full state). */
export function writeNotes(state: NotesState): void {
  state.lastUpdate = new Date().toISOString();
  const file = notesPath(state.provinceId);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  // Write compact state to separate file
  const sFile = statePath(state.provinceId);
  const tmpState = `${sFile}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpState, JSON.stringify(compactStateForStorage(state)), "utf8");
  fs.renameSync(tmpState, sFile);

  // Write markdown summary
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, renderMarkdown(state), "utf8");
  fs.renameSync(tmp, file);
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Node helpers ---

export function findNode(state: NotesState, nodeId: string): NodeRecord | undefined {
  return state.nodes.find((n) => n.nodeId === nodeId);
}

export function upsertNode(state: NotesState, node: NodeRecord): void {
  const i = state.nodes.findIndex((n) => n.nodeId === node.nodeId);
  if (i === -1) state.nodes.push(node);
  else state.nodes[i] = { ...state.nodes[i], ...node };
}

// --- Discovery tasks ---

export function addDiscoveryTask(state: NotesState, nodeId: string, track: string): void {
  const exists = state.discoveryTasks.some((t) => t.nodeId === nodeId && t.track === track);
  if (!exists) {
    state.discoveryTasks.push({ id: newId("task"), nodeId, track, state: "open" });
  }
}

export function completeDiscoveryTask(state: NotesState, nodeId: string, track: string, declaredCount?: number): void {
  addDiscoveryTask(state, nodeId, track);
  const t = state.discoveryTasks.find((x) => x.nodeId === nodeId && x.track === track);
  if (t) {
    t.state = "complete";
    if (typeof declaredCount === "number") t.declaredCount = declaredCount;
  }
}

// --- Candidates ---

export function addCandidate(state: NotesState, c: Candidate): void {
  state.candidates.push(c);
}

export function setCandidateOutcome(state: NotesState, candidateId: string, outcome: string): Candidate | undefined {
  const c = state.candidates.find((x) => x.id === candidateId);
  if (c) {
    c.state = "resolved";
    c.outcome = outcome;
  }
  return c;
}

// --- Conflicts ---

export function addConflict(state: NotesState, conflict: Conflict): void {
  state.conflicts.push(conflict);
}

export function resolveConflict(state: NotesState, conflictId: string, resolution: string): Conflict | undefined {
  const c = state.conflicts.find((x) => x.id === conflictId);
  if (c) {
    c.state = "resolved";
    c.resolution = resolution;
  }
  return c;
}

// --- Source matrix ---

export function addSourceMatrixEntry(state: NotesState, e: SourceMatrixEntry): void {
  state.sourceMatrix.push(e);
}

// --- Registry ---

export function upsertRegistry(state: NotesState, entry: RegistryEntry): void {
  const i = state.registry.findIndex((r) => r.id === entry.id);
  if (i === -1) state.registry.push(entry);
  else state.registry[i] = entry;
}

// --- Coverage ---

export function addResearchCoverage(state: NotesState, entry: ResearchCoverageEntry): void {
  state.researchCoverage.push(entry);
}

// --- Media-deficit dispositions (prompt §9) ---

/** Open (recorded) media-deficit disposition for a node, if any. Resolved (promoted) records are skipped. */
export function findMediaDeficit(state: NotesState, nodeId: string): MediaDeficitRecord | undefined {
  // Latest disposition wins, so a node that was recorded then promoted to active
  // is treated as having no open deficit even though the resolved audit record remains.
  for (let i = state.mediaDeficits.length - 1; i >= 0; i--) {
    const d = state.mediaDeficits[i];
    if (d.nodeId !== nodeId) continue;
    return d.state === "recorded" ? d : undefined;
  }
  return undefined;
}

/** Record the insufficient_verifiable_media disposition for a node (closes it). */
export function addMediaDeficit(state: NotesState, record: MediaDeficitRecord): void {
  state.mediaDeficits.push(record);
}

/** Clear the recorded disposition when the node later earns an active entity. */
export function resolveMediaDeficit(state: NotesState, nodeId: string): boolean {
  const d = findMediaDeficit(state, nodeId);
  if (!d) return false;
  d.state = "resolved";
  d.outcome = "promoted_to_active";
  d.resolvedAt = new Date().toISOString();
  return true;
}

// --- DoD Status ---

export function updateDodStatus(
  state: NotesState,
  dodComplete: boolean,
  validateInvalid: number,
  validateTotal: number,
  issues: string[],
): void {
  state.dodStatus = {
    lastCheck: new Date().toISOString(),
    dodComplete,
    validateInvalid,
    validateTotal,
    issues: issues.slice(0, 10), // keep only first 10 issues
  };
}
