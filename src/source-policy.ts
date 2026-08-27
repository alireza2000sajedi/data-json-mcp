import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { NotesState, NodeType } from "./types.js";

/**
 * Source Policy (dataset/source_policy.json) — the project's MANDATORY sources,
 * split into two contracts (final round):
 *
 *   1. primaryFactSources — the owner's five mandatory FACT sources (priority
 *      1..5). Every entity node must be searched on ALL five, in priority
 *      order, BEFORE secondary/fallback sources; a source that turned up
 *      nothing (or was unreachable) still counts only when the attempt is
 *      recorded. Wikipedia/Wikidata/Commons/OSM… are fallback/cross-check and
 *      can never silently substitute a primary.
 *   2. mediaSources — the permitted image sources for the media pipeline
 *      (§9): images may come from any of these with real pageUrl + credit +
 *      license metadata (free license preferred, never required).
 *
 * The MCP enforces per-node primary coverage: a node cannot be completed (and
 * an entity cannot be saved WITHOUT images) until the required primary sources
 * have been attempted and recorded for it.
 */

export interface PrimarySourceDef {
  name: string;
  domain: string;
  priority: number;
  mandatory: boolean;
}

export interface FallbackSourceDef {
  name: string;
  domain: string;
}

export interface MediaSourceRule {
  name: string;
  domain?: string;
  note?: string;
}

export interface SourcePolicyConfig {
  primary: PrimarySourceDef[];
  fallback: FallbackSourceDef[];
  enforcement: Partial<Record<NodeType, "all" | number>>;
  /** Permitted image sources for the media pipeline (guidance + ranking hints). */
  mediaSources?: { allowed?: MediaSourceRule[]; licenseRule?: string };
}

const DEFAULT_POLICY: SourcePolicyConfig = {
  primary: [
    { name: "Kojaro", domain: "kojaro.com", priority: 1, mandatory: true },
    { name: "Jabama Mag", domain: "jabama.com", priority: 2, mandatory: true },
    { name: "Alibaba Mag", domain: "alibaba.ir", priority: 3, mandatory: true },
    { name: "Lastsecond", domain: "lastsecond.ir", priority: 4, mandatory: true },
    { name: "Flytoday", domain: "flytoday.ir", priority: 5, mandatory: true },
  ],
  fallback: [
    { name: "Wikipedia", domain: "wikipedia.org" },
    { name: "Wikidata", domain: "wikidata.org" },
    { name: "Wikimedia Commons", domain: "commons.wikimedia.org" },
    { name: "OpenStreetMap / Nominatim", domain: "openstreetmap.org" },
  ],
  enforcement: {
    // Final contract: ALL five primary sources for EVERY entity node type.
    province: "all",
    county: "all",
    city: "all",
    village: "all",
    place: "all",
    camping: "all",
    district: 0,
    ruralDistrict: 0,
  },
};

let cached: SourcePolicyConfig | null = null;

export function getSourcePolicy(): SourcePolicyConfig {
  if (cached) return cached;
  const file = path.join(config.datasetDir, "source_policy.json");
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<SourcePolicyConfig>;
      const primary = (raw as Record<string, unknown>).primaryFactSources ?? raw.primary;
      cached = {
        primary: Array.isArray(primary) && primary.length > 0 ? (primary as PrimarySourceDef[]) : DEFAULT_POLICY.primary,
        fallback: Array.isArray(raw.fallback) ? (raw.fallback as FallbackSourceDef[]) : DEFAULT_POLICY.fallback,
        enforcement: raw.enforcement ?? DEFAULT_POLICY.enforcement,
        mediaSources: raw.mediaSources,
      };
      return cached;
    }
  } catch {
    // fall through to defaults on malformed config
  }
  cached = DEFAULT_POLICY;
  return cached;
}

/** Extract the hostname of a URL (best-effort, no external deps). */
export function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return String(url ?? "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  }
}

function hostMatches(host: string, domain: string): boolean {
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

export interface SourceClassification {
  sourceClass: "primary" | "fallback" | "other";
  domain: string;
  name?: string;
  priority?: number;
}

/** Classify a source URL against the policy (primary hit, fallback hit, or other). */
export function classifySource(url: string): SourceClassification {
  const host = hostOf(url);
  for (const p of getSourcePolicy().primary) {
    if (hostMatches(host, p.domain)) {
      return { sourceClass: "primary", domain: host, name: p.name, priority: p.priority };
    }
  }
  for (const f of getSourcePolicy().fallback) {
    if (hostMatches(host, f.domain)) {
      return { sourceClass: "fallback", domain: host, name: f.name };
    }
  }
  return { sourceClass: "other", domain: host };
}

/** How many distinct primary sources must be searched for a node of this type. */
export function requiredPrimaryCount(nodeType: NodeType | null | undefined): number {
  if (!nodeType) return 0;
  const policy = getSourcePolicy();
  const rule = policy.enforcement[nodeType];
  if (rule === undefined) return 0;
  if (rule === "all") return policy.primary.length;
  const n = Number(rule);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export interface SourceCoverage {
  required: number;
  searchedCount: number;
  satisfied: boolean;
  searched: Array<{ name: string; domain: string; priority: number; searched: boolean; entries: number }>;
}

/**
 * Coverage of the mandatory primary sources for a node, computed from the
 * recorded source-matrix entries AND the recorded media candidates (an image
 * search on a primary domain counts as searching that source).
 */
export function sourceCoverageFor(state: NotesState, nodeType: NodeType | null | undefined, nodeId: string): SourceCoverage {
  const policy = getSourcePolicy();
  const required = requiredPrimaryCount(nodeType);
  const counts = new Map<string, number>();
  const credit = (url: string | undefined) => {
    if (!url) return;
    const c = classifySource(url);
    if (c.sourceClass !== "primary" || !c.name) return;
    counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  };
  for (const e of state.sourceMatrix) {
    if (e.nodeId !== nodeId) continue;
    credit(e.sourceUrl);
  }
  for (const m of state.mediaCandidates ?? []) {
    if (m.nodeId !== nodeId) continue;
    credit(m.pageUrl);
  }
  const searched = policy.primary
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((p) => ({
      name: p.name,
      domain: p.domain,
      priority: p.priority,
      searched: (counts.get(p.name) ?? 0) > 0,
      entries: counts.get(p.name) ?? 0,
    }));
  const searchedCount = searched.filter((s) => s.searched).length;
  return {
    required,
    searchedCount,
    satisfied: required === 0 ? true : searchedCount >= required,
    searched,
  };
}
