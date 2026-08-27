import type { NodeType } from "./types.js";

/**
 * Media policy (single source for code; mirrors prompt.txt §9 and
 * dataset/README.md §12).
 *
 * An ACTIVE entity needs a thumbnail plus a per-type MINIMUM number of
 * distinct, attributable images. Images may come from the open web
 * (Google/Bing image search, tourism sites, news agencies, official sites)
 * with full credit + sourceUrl — a free license is NOT required;
 * `all-rights-reserved` is an approved license in place.schema.json.
 *
 *   province      → 10
 *   county        →  5
 *   city          →  5
 *   village       →  3
 *   place (POI)   →  3
 *   camping       →  3
 *
 * Maximum for every type: 20.
 */
export const MAX_IMAGES_PER_ENTITY = 20;

export const DEFAULT_MIN_IMAGES = 3;

export const MIN_IMAGES_BY_NODE_TYPE: Record<NodeType, number> = {
  province: 10,
  county: 5,
  city: 5,
  village: 3,
  place: 3,
  camping: 3,
  district: 3,
  ruralDistrict: 3,
};

/** Minimum number of distinct attributable images for an active entity of this node type. */
export function minImagesForNodeType(nodeType: NodeType | null | undefined): number {
  if (!nodeType) return DEFAULT_MIN_IMAGES;
  return MIN_IMAGES_BY_NODE_TYPE[nodeType] ?? DEFAULT_MIN_IMAGES;
}

/** Human-readable policy summary (used in tool output/messages). */
export const MEDIA_MINIMUMS_SUMMARY =
  "village/place/camping: 3, city/county: 5, province: 10 (max 20 for all; credited web images with all-rights-reserved license are acceptable — a free license is NOT required)";
