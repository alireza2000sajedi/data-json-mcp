import { getSchemas } from "./schemas.js";
import { config } from "./config.js";
import fs from "node:fs";
import path from "node:path";
import { readNotes } from "./notes.js";
import { listEntities, entityNodeType, ancestorChain } from "./dataset.js";
import { mediaPolicyFor, mediaStatusFor } from "./media.js";
import type { NotesState, PlaceEntity, QualityError, QualityResult, NodeRecord } from "./types.js";

export interface QualityContext {
  provinceId: string;
  expectedNodeId: string;
  /** Pre-loaded notes state (read fresh inside if omitted). */
  state?: NotesState;
  /**
   * When true, the entity's own id/slug are not treated as duplicates. Used by
   * re-validation tools (validate_province) that re-check already-stored files.
   */
  skipSelfDuplicate?: boolean;
}

const DEPRECATED_KEYS = ["parentId", "children", "nearbyPlaces", "nearbyCities", "osmRaw", "name.local", "name.alternatives", "metadata"];

/** A URL field is "raw HTTPS" if it is https and has no markdown, entities, or whitespace. */
export function isRawHttpsUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  if (!/^https:\/\/\S+$/.test(url)) return false;
  if (url.includes("&amp;")) return false;
  if (url.includes("(") || url.includes(")") || url.includes("[") || url.includes("]")) return false;
  return true;
}

/**
 * Extract the raw HTTPS URL out of a possibly-markdown-wrapped string.
 *
 * The research agent's chat layer sometimes renders a URL as `[url](url)` or
 * `url](url)`. The underlying link is correct, so we recover it instead of
 * rejecting the entity: take the last `https?://…` token in the string.
 * Already-clean URLs pass through unchanged.
 */
export function normalizeUrlString(value: unknown): string {
  if (typeof value !== "string") return "";
  const s = value.trim();
  if (!s) return "";
  const matches = s.match(/https?:\/\/[^\s)\]]+/g);
  if (matches && matches.length > 0) return matches[matches.length - 1];
  return s;
}

/**
 * Deep-clone an entity and normalize every URL-bearing field in place, so a
 * markdown-mangled URL never blocks (or corrupts) the save. Used before
 * validation and persistence; `validateEntity` itself stays strict/pure.
 */
export function normalizeEntityUrls(entity: PlaceEntity): PlaceEntity {
  const out = structuredClone(entity) as PlaceEntity;
  const set = (obj: Record<string, unknown>, key: string) => {
    if (typeof obj[key] === "string") obj[key] = normalizeUrlString(obj[key]);
  };

  for (const s of ((out.sources as any[]) ?? [])) if (s) set(s, "url");

  const media = out.media as any;
  const mediaItems: any[] = [];
  if (media?.thumbnail) mediaItems.push(media.thumbnail);
  for (const img of ((media?.images as any[]) ?? [])) if (img) mediaItems.push(img);
  for (const v of ((media?.videos as any[]) ?? [])) if (v) mediaItems.push(v);
  for (const p of ((media?.panoramas as any[]) ?? [])) if (p) mediaItems.push(p);
  for (const a of ((media?.audios as any[]) ?? [])) if (a) mediaItems.push(a);
  for (const item of mediaItems) {
    set(item, "url");
    set(item, "sourceUrl");
  }

  const contact = out.contact as any;
  if (contact) {
    set(contact, "website");
    set(contact, "instagram");
  }
  const external = out.external as any;
  if (external) {
    set(external, "googleMapsUrl");
    set(external, "osmUrl");
  }

  return out;
}

function addError(errors: QualityError[], code: string, path: string, message: string): void {
  errors.push({ code, path, message });
}

function addWarning(warnings: QualityError[], code: string, path: string, message: string): void {
  warnings.push({ code, path, message });
}

/**
 * Brand-voice claim checks no longer consult an evidence array (removed from
 * the Place contract). Promotional/tech/cliché wording is always a hard error.
 */

const VISIT_ALLOWED: Record<string, string[]> = {
  province:["bestSeasons","bestMonths"], county:["bestSeasons","bestMonths"], city:["bestSeasons","bestMonths","crowdLevel"],
  village:["durationMinutes","bestTimeOfDay","bestSeasons","bestMonths","entryFee","difficulty","requiresReservation","requiresGuide","crowdLevel"],
  place:["durationMinutes","bestTimeOfDay","bestSeasons","bestMonths","openingHours","entryFee","difficulty","requiresReservation","requiresGuide","crowdLevel"],
  camping:["durationMinutes","bestTimeOfDay","bestSeasons","bestMonths","openingHours","entryFee","difficulty","requiresReservation","requiresGuide","crowdLevel"],
};
const CHECKLIST_MODES=["tour","personalCar","airplane","camping","train","bus"] as const;
/** Normalize Persian text for name matching (ZWNJ, Arabic ی/ک variants, spacing). */
function normalizeFaName(value: unknown): string {
  return String(value ?? "")
    .replace(/\u200c/g, " ")
    .replace(/[ىي]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Names that legitimately belong to THIS entity: its own canonical name, the
 * names of its administrative ancestors, and its alternative names.
 *
 * In Iran a province, its county and its capital city usually share one name
 * (همدان). Without this filter a province could never mention its own name in
 * an FAQ, because a child node carries the same name.
 */
function selfNames(state: NotesState, entity: PlaceEntity, nodeId: string): Set<string> {
  const names = new Set<string>();
  for (const n of ancestorChain(state, nodeId)) {
    if (n.canonicalName) names.add(normalizeFaName(n.canonicalName));
  }
  if (entity.name?.fa) names.add(normalizeFaName(entity.name.fa));
  if (entity.name?.en) names.add(normalizeFaName(entity.name.en));
  for (const alt of ((entity.alternativeNames as string[]) ?? [])) names.add(normalizeFaName(alt));
  return names;
}

/** Canonical names of every descendant of `nodeId`, minus the entity's own names. */
function descendantNames(state: NotesState, nodeId: string, exclude: Set<string>): string[] {
  const out: string[] = [];
  for (const n of state.nodes) {
    if (n.nodeId === nodeId) continue;
    let cur = n.parentNodeId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (cur === nodeId) {
        const name = normalizeFaName(n.canonicalName);
        if (name.length >= 3 && !exclude.has(name)) out.push(name);
        break;
      }
      cur = state.nodes.find((x) => x.nodeId === cur)?.parentNodeId ?? null;
    }
  }
  return [...new Set(out)];
}

/**
 * Does `text` really mention the child name (whole word, not a substring of a
 * longer word)? Returns the matched name.
 */
function childHit(text: unknown, names: string[]): string | undefined {
  const t = normalizeFaName(text);
  if (!t) return undefined;
  const isWordChar = (ch: string) => /[\u0600-\u06FFa-zA-Z0-9]/.test(ch);
  return names.find((name) => {
    let from = 0;
    for (;;) {
      const idx = t.indexOf(name, from);
      if (idx === -1) return false;
      const before = idx === 0 ? "" : t[idx - 1];
      const after = idx + name.length >= t.length ? "" : t[idx + name.length];
      if (!isWordChar(before) && !isWordChar(after)) return true;
      from = idx + 1;
    }
  });
}

/**
 * Operational wording. Per the ownership contract a parent MAY mention a child
 * in prose ("غار علیصدر از جاذبه‌های شاخص استان است") but must never carry the
 * child's operational data (hours, tickets, prices, reservations, directions).
 */
const OPERATIONAL_MARKERS =
  /(ساعت|ساعات|بلیت|بلیط|ورودی|قیمت|هزینه|نرخ|رزرو|تلفن|شماره تماس|آدرس|پارکینگ|چطور برسیم|چگونه برسیم|مسیر رسیدن|تعطیل|باز است|چند ساعت|تخفیف)/;

function validateNormalizedFields(
  entity: PlaceEntity,
  ctx: QualityContext,
  nodeType: string,
  errors: QualityError[],
  warnings: QualityError[],
): void {
  // --- visit field applicability (dataset/entity-field-policy.json) ---
  const v = entity.visit as any;
  const allowed = new Set(VISIT_ALLOWED[nodeType] ?? []);
  if (!v || typeof v !== "object") {
    addError(errors, "VISIT_MISSING", "visit", "visit is required.");
  } else {
    for (const k of Object.keys(v)) {
      if (!allowed.has(k)) {
        addError(errors, "VISIT_FIELD_NOT_ALLOWED", `visit.${k}`, `visit.${k} is not applicable to ${nodeType}.`);
      }
    }
  }
  if (
    ["province", "county", "city"].includes(nodeType) &&
    v &&
    (!Array.isArray(v.bestSeasons) || !v.bestSeasons.length || !Array.isArray(v.bestMonths) || !v.bestMonths.length)
  ) {
    addError(errors, "VISIT_SEASON_REQUIRED", "visit", "bestSeasons and bestMonths are required at destination level.");
  }

  // --- independent travel checklist (canonical taxonomy ids) ---
  const tc = entity.travelChecklist as any;
  if (!tc || typeof tc !== "object") {
    addError(errors, "CHECKLIST_MISSING", "travelChecklist", "Every Entity requires an independent checklist.");
  } else {
    let total = 0;
    for (const k of Object.keys(tc)) {
      if (!(CHECKLIST_MODES as readonly string[]).includes(k)) {
        addError(errors, "CHECKLIST_MODE_UNKNOWN", `travelChecklist.${k}`, `Unknown checklist mode '${k}'.`);
      }
      const a = tc[k];
      if (!Array.isArray(a)) addError(errors, "CHECKLIST_MODE_NOT_ARRAY", `travelChecklist.${k}`, "Checklist mode must be an array.");
      else total += a.length;
    }
    if (total === 0) addError(errors, "CHECKLIST_EMPTY", "travelChecklist", "Checklist must contain at least one relevant item.");
  }

  // --- ownership: FAQ must stay on the Entity that owns them ---
  const state = ctx.state ?? readNotes(ctx.provinceId);
  const own = selfNames(state, entity, ctx.expectedNodeId);
  const children = descendantNames(state, ctx.expectedNodeId, own);

  for (const [i, q] of ((entity.faq as any[]) ?? []).entries()) {
    const hit = childHit(q?.question, children);
    if (!hit) continue;
    const operational = OPERATIONAL_MARKERS.test(normalizeFaName(q?.question)) || OPERATIONAL_MARKERS.test(normalizeFaName(q?.answer));
    if (operational) {
      addError(
        errors,
        "FAQ_CHILD_SCOPE",
        `faq[${i}].question`,
        `Operational FAQ about the child Entity '${hit}' belongs to that Entity, not to this one.`,
      );
    } else {
      addWarning(
        warnings,
        "FAQ_CHILD_MENTION",
        `faq[${i}].question`,
        `FAQ mentions the child Entity '${hit}'. A prose mention is allowed; make sure no operational child data is duplicated here.`,
      );
    }
  }

  // Checklist item canonical ids are enforced by schema enum + validateGlobalTaxonomy.
}

function validateGlobalTaxonomy(entity: PlaceEntity, errors: QualityError[]): void {
  const base = path.resolve(config.datasetDir, "..", "taxonomy");
  const domains = ["types", "subtypes", "categories", "activities", "features", "facilities", "risks", "checklist-items"] as const;
  const maps: Record<string, Set<string>> = {};
  for (const d of domains) {
    try {
      const x = JSON.parse(fs.readFileSync(path.join(base, `${d}.json`), "utf8"));
      maps[d] = new Set((x.items ?? []).map((i: any) => i.id));
    } catch {
      return;
    }
  }
  const check = (d: string, v: unknown, p: string) => {
    for (const [i, id] of (Array.isArray(v) ? v : []).entries()) {
      if (!maps[d]?.has(id as string)) {
        addError(errors, "TAXONOMY_UNKNOWN", `${p}[${i}]`, `Unknown canonical taxonomy id '${id}'.`);
      }
    }
  };
  if (!maps.types?.has(entity.type)) addError(errors, "TYPE_UNKNOWN", "type", `Unknown canonical type '${entity.type}'.`);
  if (entity.subType && !maps.subtypes?.has(String(entity.subType))) {
    addError(errors, "SUBTYPE_UNKNOWN", "subType", `Unknown canonical subtype '${entity.subType}'.`);
  }
  check("categories", entity.categories, "categories");
  check("activities", entity.activities, "activities");
  check("features", entity.features, "features");
  check("facilities", entity.facilities, "facilities");
  check("risks", (entity.safety as any)?.risks, "safety.risks");
  const tc = entity.travelChecklist as Record<string, unknown> | undefined;
  if (tc && typeof tc === "object") {
    for (const [mode, items] of Object.entries(tc)) {
      check("checklist-items", items, `travelChecklist.${mode}`);
    }
  }
}

export function validateEntity(entity: PlaceEntity, ctx: QualityContext): QualityResult {
  const errors: QualityError[] = [];
  const warnings: QualityError[] = [];
  const state = ctx.state ?? readNotes(ctx.provinceId);
  const schemas = getSchemas();
  const entities = listEntities(ctx.provinceId);

  // ---- A. Structure ----

  // (a) schema conformance
  const { valid, errors: schemaErrors } = schemas.validatePlace(entity);
  if (!valid) {
    for (const e of schemaErrors) {
      const p = e.instancePath || "/";
      addError(errors, "SCHEMA_VIOLATION", p, `${e.message ?? "schema violation"}`);
    }
  }

  // (b) status must be active only
  if (entity.status !== "active") {
    addError(errors, "STATUS_NOT_ACTIVE", "status", "Stored entities must have status 'active'.");
  }

  // (c) deprecated keys
  for (const key of DEPRECATED_KEYS) {
    if (key in entity) {
      addError(errors, "DEPRECATED_FIELD", key, `Deprecated field '${key}' is not allowed.`);
    }
  }

  // (d) raw HTTPS URLs on every URL-like field
  const urlChecks: Array<[unknown, string]> = [];
  for (const [i, s] of ((entity.sources as any[]) ?? []).entries()) {
    urlChecks.push([s?.url, `sources[${i}].url`]);
  }
  const media = entity.media as any;
  const mediaItems: Array<[any, string]> = [];
  if (media?.thumbnail) mediaItems.push([media.thumbnail, "media.thumbnail"]);
  for (const [i, img] of ((media?.images as any[]) ?? []).entries()) mediaItems.push([img, `media.images[${i}]`]);
  for (const [i, img] of ((media?.videos as any[]) ?? []).entries()) mediaItems.push([img, `media.videos[${i}]`]);
  for (const [i, img] of ((media?.panoramas as any[]) ?? []).entries()) mediaItems.push([img, `media.panoramas[${i}]`]);
  for (const [i, img] of ((media?.audios as any[]) ?? []).entries()) mediaItems.push([img, `media.audios[${i}]`]);
  // Media URLs are globally unique across this province dataset: one image URL
  // may only ever belong to ONE entity (no parent/child/sibling reuse).
  const mediaUrls = new Set<string>();
  if (media?.thumbnail?.url) mediaUrls.add(String(media.thumbnail.url));
  for (const img of ((media?.images as any[]) ?? [])) if (img?.url) mediaUrls.add(String(img.url));
  for (const existing of entities) {
    if (existing.id === entity.id) continue;
    const em = existing.entity.media as any;
    const existingUrls = new Set<string>();
    if (em?.thumbnail?.url) existingUrls.add(String(em.thumbnail.url));
    for (const img of ((em?.images as any[]) ?? [])) if (img?.url) existingUrls.add(String(img.url));
    for (const u of mediaUrls) {
      if (existingUrls.has(u)) {
        addError(errors, "MEDIA_GLOBAL_DUPLICATE", "media", `Image URL '${u}' is already used by Entity '${existing.id}'.`);
      }
    }
  }
  for (const [item, p] of mediaItems) {
    urlChecks.push([item?.url, `${p}.url`]);
    urlChecks.push([item?.sourceUrl, `${p}.sourceUrl`]);
  }
  const contact = entity.contact as any;
  if (contact?.website) urlChecks.push([contact.website, "contact.website"]);
  if (contact?.instagram) urlChecks.push([contact.instagram, "contact.instagram"]);
  const external = entity.external as any;
  if (external?.googleMapsUrl) urlChecks.push([external.googleMapsUrl, "external.googleMapsUrl"]);
  if (external?.osmUrl) urlChecks.push([external.osmUrl, "external.osmUrl"]);
  for (const [url, p] of urlChecks) {
    if (url !== undefined && url !== null && !isRawHttpsUrl(url)) {
      addError(errors, "URL_NOT_RAW_HTTPS", p, "URL must be a raw HTTPS URL (no markdown, &amp;, or whitespace).");
    }
  }

  // (e) id + slug uniqueness — save is always for a NEW entity, so any existing
  // id/slug (on disk or in the registry) is a duplicate.
  const usedIds = new Set<string>();
  const usedSlugs = new Set<string>();
  for (const e of entities) {
    usedIds.add(e.id);
    usedSlugs.add(e.entity.slug);
  }
  for (const r of state.registry) {
    if (r.status === "pending") continue; // a pending reservation belongs to this upcoming save
    usedIds.add(r.id);
    usedSlugs.add(r.slug);
  }
  if (!ctx.skipSelfDuplicate) {
    if (usedIds.has(entity.id)) {
      addError(errors, "DUPLICATE_ID", "id", `Entity id '${entity.id}' already exists in the dataset.`);
    }
    if (usedSlugs.has(entity.slug)) {
      addError(errors, "DUPLICATE_SLUG", "slug", `Entity slug '${entity.slug}' already exists in the dataset.`);
    }
  }

  // ---- B. Sources (evidence field removed from the Place contract) ----

  const sources = (entity.sources as any[]) ?? [];

  for (const [i, s] of sources.entries()) {
    if (!s?.title || String(s.title).trim().length === 0) {
      addError(errors, "SOURCE_TITLE_EMPTY", `sources[${i}].title`, "Source title must not be empty.");
    }
    if (!s?.url || String(s.url).trim().length === 0) {
      addError(errors, "SOURCE_URL_EMPTY", `sources[${i}].url`, "Source URL must not be empty.");
    }
  }

  // Source registration / ownership (source matrix) — every sources[].url must
  // have been recorded via record_search_result for this node (or an allowed ownership).
  const chain = ancestorChain(state, ctx.expectedNodeId);
  const chainIds = new Set(chain.map((n) => n.nodeId));
  const nodeType = entityNodeType(entity);
  validateNormalizedFields(entity, ctx, nodeType, errors, warnings);
  validateGlobalTaxonomy(entity, errors);
  for (const [i, s] of sources.entries()) {
    const su = s?.url as string | undefined;
    if (!su) continue;
    const entries = state.sourceMatrix.filter((m) => m.sourceUrl === su);
    if (entries.length === 0) {
      addError(errors, "SOURCE_NOT_REGISTERED", `sources[${i}].url`, "Source must be recorded via record_search_result for this node before use.");
      continue;
    }
    const ownNode = entries.some((m) => m.nodeId === ctx.expectedNodeId);
    const childOfAncestor = entries.some((m) => chainIds.has(m.nodeId) && m.ownershipStatus === "belongs_to_child");
    const rejected = entries.some((m) => m.ownershipStatus === "rejected");
    if (rejected) {
      addError(errors, "SOURCE_REJECTED", `sources[${i}].url`, "Source was recorded with ownershipStatus 'rejected'.");
      continue;
    }
    const parentOnly = entries.some((m) => m.nodeId !== ctx.expectedNodeId && chainIds.has(m.nodeId) && m.ownershipStatus === "belongs_to_node");
    if (parentOnly && !ownNode && !childOfAncestor && nodeType !== "province") {
      addError(errors, "SOURCE_OWNERSHIP_MISMATCH", `sources[${i}].url`, "Source registered against a parent node cannot back a child-specific fact.");
    }
  }

  // ---- C. Context & hierarchy ----

  const loc = entity.location as any;
  const locName = (k: string) => (loc?.[k] ? String(loc[k]).trim() : "");

  if (entity.id !== ctx.expectedNodeId) {
    addError(errors, "NODE_ID_MISMATCH", "id", `Entity id '${entity.id}' does not match expectedNodeId '${ctx.expectedNodeId}'.`);
  }

  switch (nodeType) {
    case "province":
      if (!locName("province")) addError(errors, "HIERARCHY_PROVINCE", "location.province", "Province entity requires location.province.");
      break;
    case "county":
      if (!locName("province")) addError(errors, "HIERARCHY_PROVINCE", "location.province", "County entity requires location.province.");
      if (!locName("county")) addError(errors, "HIERARCHY_COUNTY", "location.county", "County entity requires location.county.");
      break;
    case "city":
      if (!locName("province")) addError(errors, "HIERARCHY_PROVINCE", "location.province", "City entity requires location.province.");
      if (!locName("county")) addError(errors, "HIERARCHY_COUNTY", "location.county", "City entity requires location.county.");
      if (!locName("city")) addError(errors, "HIERARCHY_CITY", "location.city", "City entity requires location.city.");
      break;
    case "village":
      if (!locName("province")) addError(errors, "HIERARCHY_PROVINCE", "location.province", "Village entity requires location.province.");
      if (!locName("county")) addError(errors, "HIERARCHY_COUNTY", "location.county", "Village entity requires location.county.");
      if (!locName("ruralDistrict")) addError(errors, "HIERARCHY_RURAL_DISTRICT", "location.ruralDistrict", "Village entity requires location.ruralDistrict.");
      if (!locName("village")) addError(errors, "HIERARCHY_VILLAGE", "location.village", "Village entity requires location.village.");
      break;
    default:
      // POI: province is required (schema), county/city/village contextual.
      if (!locName("province")) addError(errors, "HIERARCHY_PROVINCE", "location.province", "Place entity requires location.province.");
      break;
  }

  // A place/city/village must have its real parent in the graph.
  if (nodeType === "city" || nodeType === "village" || nodeType === "place" || nodeType === "camping") {
    const countyNode = chain.find((n) => n.nodeType === "county");
    const provinceNode = chain.find((n) => n.nodeType === "province");
    if (nodeType === "city" || nodeType === "village") {
      if (!countyNode) addError(errors, "PARENT_NOT_IN_GRAPH", "parentNodeId", `${nodeType} entity must have a registered county parent.`);
    }
    if (nodeType === "place" || nodeType === "camping") {
      if (!provinceNode && !countyNode && !chain.some((n) => n.nodeType === "city" || n.nodeType === "village")) {
        addError(errors, "PARENT_NOT_IN_GRAPH", "parentNodeId", "Place entity must be placed under a real administrative parent.");
      }
    }
  }

  // ---- D. Relations ----

  const relations = (entity.relations as any[]) ?? [];
  const seenRelations = new Set<string>();
  const knownTargetIds = new Set(entities.map((e) => e.id));
  for (const [i, rel] of relations.entries()) {
    const target = rel?.placeId as string | undefined;
    const rtype = rel?.relationType as string | undefined;
    if (!target) {
      addError(errors, "RELATION_TARGET_MISSING", `relations[${i}].placeId`, "Relation target placeId is required.");
      continue;
    }
    if (target === entity.id) {
      addError(errors, "RELATION_SELF_REFERENCE", `relations[${i}].placeId`, "Relation must not reference the entity itself.");
    }
    if (!knownTargetIds.has(target)) {
      addError(errors, "RELATION_TARGET_NOT_FOUND", `relations[${i}].placeId`, `Relation target '${target}' does not exist in the dataset.`);
    }
    const key = `${target}|${rtype}`;
    if (seenRelations.has(key)) {
      addError(errors, "DUPLICATE_RELATION", `relations[${i}]`, `Duplicate relation to '${target}' of type '${rtype}'.`);
    }
    seenRelations.add(key);

    if (rtype === "parent" && !chainIds.has(target)) {
      addError(errors, "RELATION_PARENT_MISMATCH", `relations[${i}].placeId`, "A parent relation must point at a real administrative ancestor of this entity (nearby is not parent).");
    }

    if (rtype === "nearby" || rtype === "alternative") {
      // Bidirectional check (warning only when we can inspect the target).
      const targetEntity = entities.find((e) => e.id === target);
      if (targetEntity) {
        const back = ((targetEntity.entity.relations as any[]) ?? []).find((r) => r?.placeId === entity.id && r?.relationType === rtype);
        if (!back) {
          addWarning(warnings, "RELATION_NOT_BIDIRECTIONAL", `relations[${i}]`, `${rtype} relation to '${target}' is not mirrored on the target entity.`);
        }
      }
    }
  }

  // ---- E. Media (best-effort policy, §9) ----
  //
  // Media is a QUALITY DIMENSION, not a gate: an active entity may be saved
  // with 1..target-1 images (status "partial") or even with NO media at all
  // (status "unavailable"). Only structural problems are rejected: duplicates,
  // more than `max` images, a missing thumbnail when images exist, a
  // thumbnail-without-images combination, or a media.status that disagrees
  // with the actual distinct image count.

  if (entity.status === "active") {
    const nodeType = entityNodeType(entity);
    const policy = mediaPolicyFor(nodeType);
    const mediaCount = new Set<string>([
      ...(media?.thumbnail?.url ? [String(media.thumbnail.url)] : []),
      ...(((media?.images as any[]) ?? []).map((x:any)=>String(x?.url)).filter(Boolean))
    ]).size;
    if (mediaCount > 0 && mediaCount < policy.target) addWarning(warnings,"MEDIA_BELOW_TARGET", "media", `Media has ${mediaCount}/${policy.target} unique images; Entity is not complete until the target is reached.`);
    const images = (media?.images as any[]) ?? [];
    const thumb = media?.thumbnail as any;

    // distinct attributable image URLs (thumbnail counts as one when distinct)
    const distinctUrls = new Set<string>();
    if (thumb?.url) distinctUrls.add(thumb.url);
    for (const im of images) if (im?.url) distinctUrls.add(im.url);
    const derivedStatus = mediaStatusFor(nodeType, distinctUrls.size);

    if (images.length > policy.max) {
      addError(errors, "MEDIA_TOO_MANY_IMAGES", "media.images", `Active entity allows at most ${policy.max} images (got ${images.length}).`);
    }
    const seen = new Set<string>();
    for (const [i, im] of images.entries()) {
      const u = im?.url as string | undefined;
      if (u) {
        if (seen.has(u)) addError(errors, "MEDIA_DUPLICATE_IMAGE", `media.images[${i}].url`, `Duplicate image URL '${u}'.`);
        seen.add(u);
      }
    }

    if (images.length === 0) {
      if (thumb) {
        addError(errors, "MEDIA_THUMBNAIL_WITHOUT_IMAGES", "media.thumbnail", "A thumbnail without images is not a valid media object — put the image in media.images (even a single image is a valid partial media set).");
      }
    } else {
      if (!thumb) {
        addError(errors, "MEDIA_THUMBNAIL_MISSING", "media.thumbnail", "When images exist, a thumbnail is required (use the best image; a single-image set may reuse the same URL).");
      } else {
        const thumbUrl = thumb.url as string | undefined;
        // A single-image entity may reuse its only image as the thumbnail.
        if (thumbUrl && images.length > 1 && images.some((im) => im?.url === thumbUrl)) {
          addError(errors, "MEDIA_THUMBNAIL_DUPLICATED", "media.thumbnail", "Thumbnail URL must not be repeated in images (only allowed for a single-image set).");
        }
      }
    }

    const declaredStatus = media?.status as string | undefined;
    if (declaredStatus !== undefined && declaredStatus !== derivedStatus) {
      addError(
        errors,
        "MEDIA_STATUS_MISMATCH",
        "media.status",
        `media.status '${declaredStatus}' does not match the entity's ${distinctUrls.size} distinct image(s) (expected '${derivedStatus}' for this node type with target ${policy.target}).`,
      );
    }
  }

  // Media license + metadata + provenance
  for (const [item, p] of mediaItems) {
    if (!item) continue;
    if (item.license !== undefined && item.license !== null) {
      if (!schemas.approvedLicenses.includes(String(item.license))) {
        addError(errors, "MEDIA_LICENSE_NOT_APPROVED", `${p}.license`, `License '${item.license}' is not in the approved list.`);
      }
    }
    if (item.source !== undefined && (item.source === "" || item.source == null)) {
      addError(errors, "MEDIA_SOURCE_EMPTY", `${p}.source`, "Media source must not be empty.");
    }
    if (item.credit !== undefined && (item.credit === "" || item.credit == null)) {
      addError(errors, "MEDIA_CREDIT_EMPTY", `${p}.credit`, "Media credit must not be empty.");
    }
    // sourceUrl must point at the file/license page, not the raw file itself.
    if (item.url && item.sourceUrl && item.url === item.sourceUrl) {
      addError(errors, "MEDIA_SOURCE_URL_SELF_REF", `${p}.sourceUrl`, "Media sourceUrl must point at the file/license page, not the image URL itself.");
    }

    // Ownership: a media source registered for an ancestor node cannot back this node's media.
    const msu = item?.sourceUrl as string | undefined;
    if (msu) {
      const entries = state.sourceMatrix.filter((m) => m.sourceUrl === msu);
      if (entries.some((m) => m.ownershipStatus === "rejected")) {
        addError(errors, "MEDIA_OWNERSHIP_REJECTED", `${p}.sourceUrl`, "Media source was recorded with ownershipStatus 'rejected'.");
      } else if (entries.some((m) => m.nodeId !== ctx.expectedNodeId && chainIds.has(m.nodeId) && m.ownershipStatus === "belongs_to_node")) {
        addError(errors, "MEDIA_OWNERSHIP_MISMATCH", `${p}.sourceUrl`, "Media source belongs to an ancestor node and cannot back this node's media.");
      }
    }
  }

  // ---- F. Costs / evidence removed from the contract ----
  // The Place schema no longer accepts `costs` or `evidence` (additionalProperties:false).

  // ---- G. Checklist & text ----

  // Checklist ids are schema-enforced; prose/sentence heuristics no longer apply.

  // Promotional / brand-voice text heuristics (warnings; provenance-dependent).
  // Word lists follow dataset/brand_voice.md (هویت کلامی و لحن برند — نسخه ۱.۰ نهایی):
  // بخش ۸ (کلیشه‌های ممنوع توصیف گردشگری)، بخش ۱۱ (واژه‌های ممنوع) و بخش ۲۷ (الگوهای ممنوع).
  // Applied before/after reference on dataset fields: the Masuleh appendix in the same file.
  const normalize = (s: string) => s.replace(/\u200c/g, "");
  const SUPERLATIVES = /بهترین|زیباترین|منحصربهفرد|منحصر به فرد|اولین|قدیمیترین|جادویی|بینظیر|شگفتانگیز|فراموشنشدنی|ایدهآل|فوقالعاده|انقلابی|بهترین تجربه زندگی|بکر|بیهمتا|مقصد ایدهآل|زیباترین روستا|بهترین مقصد|بهترین روستا|نگین|بهشت گمشده|رؤیایی/g;
  const TECH_NOISE = /پلتفرم جامع|راهکار نوین|هوش مصنوعی پیشرفته|الگوریتم هوشمند|خدمات یکپارچه|هوش مصنوعی|فناوری پیشرفته|فناوری سنتی|سیستم هوشمند|سیستم مدیریت|مدیریت گردشگری|تکنولوژی|دیجیتال|پلتفرم|نرمافزار|الگوریتم قدرتمند|فوقهوشمند/g;
  const CLICHES = /تجربه منحصربهفرد|سفر رؤیایی|سبک زندگی پویا|جامعه کاربری گسترده|امنیت کاملاً تضمینشده|فراهم میکند|ارائه میدهد|ایجاد کرده است|به سطحی بالاتر|تجربه زندگی|مقصدی ایدهآل|مکان جادویی|همیشه تجربهای|در دنیای پرشتاب امروز|در دنیای امروز|آیا میدانستید|تصور کنید|همین حالا شروع کنید|فرصت را از دست ندهید|میباشد|میگردد|نمایید|بهرهمند شوید|نسبت به انجام|در راستای|فرآیند مربوطه|فرایند مربوطه|همین حالا|از دست نده|فقط امروز|فرصت استثنایی|خفن|بزن بترکون|ترکوند|وای!|اوه!/g;

  const content = entity.content as any;
  const seo = entity.seo as any;
  const faqArr = (entity.faq as any[]) ?? [];
  const tipsArr = (entity.tips as any[]) ?? [];
  const warningsArr = (entity.warnings as any[]) ?? [];
  const mediaAny = entity.media as any;

  const textFields: Array<[string, string]> = [
    [content?.summary?.fa, "content.summary.fa"],
    [content?.summary?.en, "content.summary.en"],
    [content?.description?.fa, "content.description.fa"],
    [content?.description?.en, "content.description.en"],
    [content?.whyVisit, "content.whyVisit"],
    [content?.history, "content.history"],
    [content?.architecture, "content.architecture"],
    [content?.culture, "content.culture"],
    [seo?.title, "seo.title"],
    [seo?.description, "seo.description"],
  ];
  for (const [i, q] of faqArr.entries()) {
    textFields.push([q?.question, `faq[${i}].question`], [q?.answer, `faq[${i}].answer`]);
  }
  for (const [i, t] of tipsArr.entries()) textFields.push([t, `tips[${i}]`]);
  for (const [i, w] of warningsArr.entries()) textFields.push([w?.text, `warnings[${i}].text`]);
  const mediaTexts: Array<[string, string]> = [];
  if (mediaAny?.thumbnail) mediaTexts.push([mediaAny.thumbnail?.alt, "media.thumbnail.alt"], [mediaAny.thumbnail?.caption, "media.thumbnail.caption"]);
  for (const [i, img] of ((mediaAny?.images as any[]) ?? []).entries()) mediaTexts.push([img?.alt, `media.images[${i}].alt`], [img?.caption, `media.images[${i}].caption`]);
  for (const [i, img] of ((mediaAny?.videos as any[]) ?? []).entries()) mediaTexts.push([img?.alt, `media.videos[${i}].alt`], [img?.caption, `media.videos[${i}].caption`]);
  textFields.push(...mediaTexts);

  const seen = new Set<string>();
  const flag = (key: string, code: string, p: string, errorMsg: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    addError(errors, code, p, errorMsg);
  };

  for (const [text, p] of textFields) {
    if (typeof text !== "string" || text.length === 0) continue;
    const t = normalize(text);
    if (SUPERLATIVES.test(t)) {
      flag(`superlative:${p}`, "BRAND_VOICE_SUPERLATIVE", p,
        "Superlative/promotional wording is rejected — rewrite as a concrete, factual description.");
    }
    if (TECH_NOISE.test(t)) {
      flag(`tech:${p}`, "BRAND_VOICE_TECH_NOISE", p,
        "Technology/AI wording is rejected — rewrite without promotional tech noise.");
    }
    if (CLICHES.test(t)) {
      flag(`cliche:${p}`, "BRAND_VOICE_CLICHE", p,
        "Robotic travel-industry cliché is rejected — rewrite as a concrete, factual description.");
    }
  }
  return { accepted: errors.length === 0, errors, warnings };
}
