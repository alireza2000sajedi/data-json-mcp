import fs from "node:fs";
import path from "node:path";
import { safeJoin, assertProvinceId, assertEntityId } from "./config.js";
import { provinceDir, readNotes, writeNotes, upsertNode, upsertRegistry, findNode, resolveMediaDeficit } from "./notes.js";
import type { NotesState, NodeType, NodeRecord, PlaceEntity, RegistryEntry } from "./types.js";

export interface StoredEntity {
  id: string;
  path: string; // absolute path of the JSON file
  entity: PlaceEntity;
}

/** Files that are not entity data but live inside the province output dir. */
const NON_ENTITY_FILES = new Set(["notes.state.json", "notes.md"]);

/** Recursively list all `*.json` entity files under the province output dir. */
export function listEntities(provinceId: string): StoredEntity[] {
  const dir = provinceDir(provinceId);
  const out: StoredEntity[] = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d)) {
      if (NON_ENTITY_FILES.has(name)) continue;
      const full = path.join(d, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (name.endsWith(".json")) {
        try {
          const entity = JSON.parse(fs.readFileSync(full, "utf8")) as PlaceEntity;
          out.push({ id: entity.id, path: full, entity });
        } catch {
          // ignore unparseable files; they are not valid entities
        }
      }
    }
  };
  walk(dir);
  return out;
}

export function findEntityById(provinceId: string, id: string): StoredEntity | undefined {
  return listEntities(provinceId).find((e) => e.id === id);
}

export function readEntityFile(provinceId: string, id: string): StoredEntity | undefined {
  return findEntityById(provinceId, id);
}

/** Collect every id + slug currently used across the dataset (files + registry). */
export function collectUsedIdsAndSlugs(provinceId: string, state: NotesState): { ids: Set<string>; slugs: Set<string> } {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const e of listEntities(provinceId)) {
    ids.add(e.id);
    slugs.add(e.entity.slug);
  }
  for (const r of state.registry) {
    ids.add(r.id);
    slugs.add(r.slug);
  }
  return { ids, slugs };
}

/** Write an entity JSON atomically at an absolute path. */
export function writeEntityFile(absPath: string, entity: PlaceEntity): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(entity, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, absPath);
}

/** Infer the Planro node type from a place entity's type/subType. */
export function entityNodeType(entity: PlaceEntity): NodeType {
  if (entity.type === "other") {
    if (entity.subType === "province") return "province";
    if (entity.subType === "county") return "county";
  }
  if (entity.type === "city") return "city";
  if (entity.type === "village") return "village";
  if (entity.type === "recreational" && entity.subType === "campground") return "camping";
  return "place";
}

/** Node types that correspond to a real entity file. */
export const ENTITY_NODE_TYPES: NodeType[] = ["province", "county", "city", "village", "place", "camping"];

/** Walk a node's ancestor chain via parentNodeId. */
export function ancestorChain(state: NotesState, nodeId: string): NodeRecord[] {
  const chain: NodeRecord[] = [];
  let cur = state.nodes.find((n) => n.nodeId === nodeId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.nodeId)) {
    seen.add(cur.nodeId);
    chain.push(cur);
    cur = cur.parentNodeId ? state.nodes.find((n) => n.nodeId === cur!.parentNodeId) : undefined;
  }
  return chain;
}

export interface CanonicalPathResult {
  relPath: string;
  absPath: string;
}

/**
 * Compute the canonical relative path for an entity under output/{provinceId}.
 *
 * The folder tree mirrors the real administrative hierarchy (no type-prefix
 * folders like `counties/`). Each administrative entity lives inside a folder
 * named by its own id, nested under the folders of its entity ancestors:
 *
 *   province.json
 *   county-30-1/county.json
 *   county-30-1/city-30-1/city.json
 *   county-30-1/city-30-1/village-30-v1/village.json
 *   county-30-1/city-30-1/village-30-v1/place-30-1.json
 *   county-30-1/place-30-2.json          (place directly under a county)
 *   place-30-3.json                       (place directly under the province)
 *
 * Villages and places may live at any level (province / county / city / village),
 * matching where the node was actually registered in the graph.
 */
export function canonicalPath(provinceId: string, state: NotesState, entity: PlaceEntity, expectedNodeId: string): CanonicalPathResult {
  const nodeType = entityNodeType(entity);

  let relPath: string;
  if (nodeType === "province") {
    relPath = "province.json";
  } else {
    const chain = ancestorChain(state, expectedNodeId); // [self, parent, ..., province]
    // Entity-type ancestors in province→parent order (skip district/ruralDistrict
    // grouping nodes and the province itself, which is the output root).
    const ancestors = [...chain]
      .reverse() // [province, ..., parent, self]
      .slice(1, chain.length - 1)
      .filter((n) => n.nodeType === "county" || n.nodeType === "city" || n.nodeType === "village")
      .map((n) => n.nodeId);

    if (nodeType === "place" || nodeType === "camping") {
      // Places/campsites are leaf files directly inside their parent's folder.
      relPath = path.join(...ancestors, `${entity.id}.json`);
    } else {
      // Administrative entities own a folder (they contain children).
      relPath = path.join(...ancestors, entity.id, `${nodeType}.json`);
    }
  }

  const absPath = safeJoin(provinceDir(provinceId), relPath.split("/"));
  return { relPath, absPath };
}

export function saveEntity(provinceId: string, entity: PlaceEntity, expectedNodeId: string, canonicalPathResult: CanonicalPathResult): void {
  writeEntityFile(canonicalPathResult.absPath, entity);
  // Re-read fresh state: other tools (e.g. mark_node_media_deficit,
  // create_candidate) may have mutated notes after the caller's state was
  // loaded. Writing a stale copy would silently drop those records.
  const state = readNotes(provinceId);
  const nodeType = entityNodeType(entity);
  const existing = findNode(state, entity.id);
  upsertNode(state, {
    nodeId: entity.id,
    nodeType,
    canonicalName: entity.name?.fa ?? "",
    parentNodeId: existing ? existing.parentNodeId : null,
    state: "complete",
  });
  const entry: RegistryEntry = {
    id: entity.id,
    slug: entity.slug,
    path: canonicalPathResult.relPath,
    status: "active",
    name: entity.name?.fa ?? "",
    type: entity.type,
    subType: entity.subType as string | undefined,
  };
  upsertRegistry(state, entry);
  // If this node was previously closed via the §9 media-deficit disposition,
  // earning a real active entity flips it to resolved (no stale deficit).
  resolveMediaDeficit(state, entity.id);
  writeNotes(state);
}

// --- ID / slug reservation ---

const KIND_PREFIX: Record<string, string> = {
  province: "province",
  county: "county",
  city: "city",
  village: "village",
  place: "place",
  poi: "place",
  camping: "camp",
};

function numericSuffix(provinceId: string): string {
  const m = provinceId.match(/province-(\d+)/);
  return m ? m[1] : provinceId;
}

export function generateId(provinceId: string, entityKind: string, usedIds: Set<string>): string {
  const prefix = KIND_PREFIX[entityKind] ?? "place";
  const prov = numericSuffix(provinceId);
  let n = 1;
  let id = "";
  do {
    if (prefix === "province") id = `province-${n}`;
    else if (prefix === "county") id = `county-${prov}-${n}`;
    else if (prefix === "city") id = `city-${prov}-${n}`;
    else if (prefix === "village") id = `village-${prov}-v${n}`;
    else if (prefix === "camp") id = `camp-${prov}-${n}`;
    else id = `place-${prov}-${n}`;
    n += 1;
  } while (usedIds.has(id));
  return id;
}

/** Sanitize a preferred slug to lowercase ASCII `a-z0-9-` (hyphen-separated). */
export function sanitizeSlug(preferred: string): string {
  let s = (preferred ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length === 0) s = "place";
  return s;
}

export function generateSlug(preferred: string, usedSlugs: Set<string>): string {
  const base = sanitizeSlug(preferred);
  let slug = base;
  let n = 2;
  while (usedSlugs.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

// --- Existing-entity lookup ---

export interface EntityMatch {
  id: string;
  name: string;
  alternativeNames: string[];
  canonicalPath: string;
  score: number;
  reasons: string[];
}

export function findExistingEntity(
  provinceId: string,
  name: string,
  alternativeNames: string[] = [],
  latitude?: number,
  longitude?: number,
  administrativePath: string[] = [],
): { definitive: EntityMatch[]; possible: EntityMatch[] } {
  const entities = listEntities(provinceId);
  const definitive: EntityMatch[] = [];
  const possible: EntityMatch[] = [];
  const norm = (s: string) => s.trim().toLowerCase();

  for (const e of entities) {
    const en = e.entity;
    const enName = norm((en.name?.fa as string) ?? "");
    const alts = ((en.alternativeNames as string[]) ?? []).map(norm);
    const reasons: string[] = [];
    let score = 0;

    if (enName && enName === norm(name)) {
      score += 100;
      reasons.push("exact name match");
    }
    for (const alt of alternativeNames) {
      if (enName && enName === norm(alt)) {
        score += 90;
        reasons.push("name matches an alternative name");
      }
      if (alts.includes(norm(alt))) {
        score += 70;
        reasons.push("alternative name overlap");
      }
    }
    if (alts.includes(norm(name))) {
      score += 60;
      reasons.push("canonical name appears in entity alternative names");
    }

    if (latitude !== undefined && longitude !== undefined) {
      const lat = (en.location as any)?.coordinates?.latitude;
      const lon = (en.location as any)?.coordinates?.longitude;
      if (typeof lat === "number" && typeof lon === "number") {
        const dLat = Math.abs(lat - latitude);
        const dLon = Math.abs(lon - longitude);
        if (dLat < 0.001 && dLon < 0.001) {
          score += 80;
          reasons.push("coordinates within 0.001°");
        } else if (dLat < 0.01 && dLon < 0.01) {
          score += 30;
          reasons.push("coordinates within 0.01°");
        }
      }
    }

    const loc = en.location as any;
    if (administrativePath.length > 0) {
      const locPath = [loc?.province, loc?.county, loc?.city, loc?.village].filter(Boolean);
      const overlap = administrativePath.filter((p) => locPath.map(norm).includes(norm(p)));
      if (overlap.length > 0) {
        score += overlap.length * 15;
        reasons.push(`administrative path overlap (${overlap.length})`);
      }
    }

    if (score === 0) continue;
    const match: EntityMatch = {
      id: en.id,
      name: (en.name?.fa as string) ?? "",
      alternativeNames: (en.alternativeNames as string[]) ?? [],
      canonicalPath: e.path,
      score,
      reasons,
    };
    if (score >= 90) definitive.push(match);
    else possible.push(match);
  }

  definitive.sort((a, b) => b.score - a.score);
  possible.sort((a, b) => b.score - a.score);
  return { definitive, possible };
}
