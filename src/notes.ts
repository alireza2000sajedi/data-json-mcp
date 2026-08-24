import fs from "node:fs";
import path from "node:path";
import { config, safeJoin, assertProvinceId } from "./config.js";
import type {
  NotesState,
  NodeRecord,
  DiscoveryTask,
  Candidate,
  Conflict,
  SourceMatrixEntry,
  RegistryEntry,
  ResearchCoverageEntry,
  OwnershipStatus,
} from "./types.js";

const STATE_MARKER = "<!-- planro:state -->";
const STATE_MARKER_END = "<!-- /planro:state -->";

export function notesPath(provinceId: string): string {
  return safeJoin(config.outputDir, [assertProvinceId(provinceId), "notes.md"]);
}

export function provinceDir(provinceId: string): string {
  return safeJoin(config.outputDir, [assertProvinceId(provinceId)]);
}

function emptyState(provinceId: string): NotesState {
  return {
    provinceId,
    lastUpdate: new Date().toISOString(),
    scopeStatus: "in_progress",
    nodes: [],
    discoveryTasks: [],
    candidates: [],
    conflicts: [],
    sourceMatrix: [],
    registry: [],
    researchCoverage: [],
    nextStep: "",
  };
}

/** Parse notes.md into a NotesState. Tolerates missing / human-edited files. */
export function readNotes(provinceId: string): NotesState {
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
  return {
    provinceId: provinceId,
    lastUpdate: p.lastUpdate ?? base.lastUpdate,
    scopeStatus: p.scopeStatus === "complete" ? "complete" : "in_progress",
    nodes: Array.isArray(p.nodes) ? p.nodes : [],
    discoveryTasks: Array.isArray(p.discoveryTasks) ? p.discoveryTasks : [],
    candidates: Array.isArray(p.candidates) ? p.candidates : [],
    conflicts: Array.isArray(p.conflicts) ? p.conflicts : [],
    sourceMatrix: Array.isArray(p.sourceMatrix) ? p.sourceMatrix : [],
    registry: Array.isArray(p.registry) ? p.registry : [],
    researchCoverage: Array.isArray(p.researchCoverage) ? p.researchCoverage : [],
    nextStep: p.nextStep ?? "",
  };
}

function renderMarkdown(state: NotesState): string {
  const registryRows = state.registry
    .map((r) => `| ${r.id} | ${r.slug} | ${r.path} | ${r.status} |`)
    .join("\n");

  const coverageRows = state.researchCoverage
    .map((c) => `| ${c.entity} | ${c.sites} | ${c.queryCodes} | ${c.resultSummary} |`)
    .join("\n");

  const candidateLines = state.candidates
    .filter((c) => c.state === "open")
    .map((c) => `- [candidate] ${c.id}: ${c.name} (node: ${c.nodeId}) — ${c.reason}`)
    .join("\n");

  const conflictLines = state.conflicts
    .filter((c) => c.state === "open")
    .map((c) => `- [conflict] ${c.id}: ${c.description}`)
    .join("\n");

  const nodeLines = state.nodes
    .map((n) => `- ${n.nodeId} (${n.nodeType}) ${n.canonicalName} — ${n.state}`)
    .join("\n");

  return [
    `# Notes — ${state.provinceId}`,
    `- Last update: ${state.lastUpdate}`,
    `- Scope: ${state.provinceId}`,
    `- Scope status: ${state.scopeStatus}`,
    "",
    "## Nodes",
    nodeLines || "- (none)",
    "",
    "## ID Registry",
    "| id | slug | path | status |",
    "|---|---|---|---|",
    registryRows || "| | | | |",
    "",
    "## Research coverage",
    "| entity | sites | query codes | result summary |",
    "|---|---|---|---|",
    coverageRows || "| | | | |",
    "",
    "## Candidates / conflicts",
    candidateLines || conflictLines || "- (none)",
    "",
    "## Next mandatory step",
    `- ${state.nextStep || "(none)"}`,
    "",
    STATE_MARKER,
    JSON.stringify(
      {
        provinceId: state.provinceId,
        lastUpdate: state.lastUpdate,
        scopeStatus: state.scopeStatus,
        nodes: state.nodes,
        discoveryTasks: state.discoveryTasks,
        candidates: state.candidates,
        conflicts: state.conflicts,
        sourceMatrix: state.sourceMatrix,
        registry: state.registry,
        researchCoverage: state.researchCoverage,
        nextStep: state.nextStep,
      },
      null,
      2,
    ),
    STATE_MARKER_END,
    "",
  ].join("\n");
}

/** Atomically write notes.md (temp file + rename). */
export function writeNotes(state: NotesState): void {
  state.lastUpdate = new Date().toISOString();
  const file = notesPath(state.provinceId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
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

export function completeDiscoveryTask(state: NotesState, nodeId: string, track: string): void {
  addDiscoveryTask(state, nodeId, track);
  const t = state.discoveryTasks.find((x) => x.nodeId === nodeId && x.track === track);
  if (t) t.state = "complete";
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
