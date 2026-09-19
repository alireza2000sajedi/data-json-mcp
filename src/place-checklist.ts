import type { PlaceChecklistItem, ScopeRegistry } from "./scopes.js";

/** Discovery tracks whose children are place nodes. */
export const PLACE_DISCOVERY_TRACKS = new Set(["places", "countyPlaces", "provincePlaces"]);

/** Minimum place-discovery searches required before closing an empty places track. */
export const MIN_PLACE_SEARCHES_FOR_ZERO = 3;

const PLACE_QUERY =
  /جاهای\s*دیدنی|جاذبه|آثار\s*تاریخی|موزه|بازار\s*تاریخی|گردشگری|tourist\s*attraction|places?\s*to\s*visit|sightseeing/i;

/** Normalize Persian/Arabic place names for checklist ↔ entity matching. */
export function normalizePlaceKey(name: string): string {
  return String(name || "")
    .replace(/[\u200c\u200d\u200e\u200f\ufeff]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/آ/g, "ا")
    .replace(/أ/g, "ا")
    .replace(/إ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی")
    .replace(/[\s\-_/,،.]+/g, "")
    .trim()
    .toLowerCase();
}

/** Checklist places owned by a node (province root or a ScopeUnit). */
export function checklistForNode(registry: ScopeRegistry, nodeId: string): PlaceChecklistItem[] {
  if (nodeId === registry.provinceId) return registry.places ?? [];
  const unit = registry.index[nodeId];
  return unit?.places ?? [];
}

export function isPlaceDiscoveryQuery(query: string): boolean {
  return PLACE_QUERY.test(String(query || ""));
}

export function countPlaceDiscoverySearches(
  entries: { nodeId: string; query?: string }[],
  nodeId: string,
): number {
  return entries.filter((e) => e.nodeId === nodeId && isPlaceDiscoveryQuery(e.query ?? "")).length;
}
