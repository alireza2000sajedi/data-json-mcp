import type { NodeType } from "./types.js";

/**
 * Entity-owned media policy (final contract).
 *
 * Every Entity owns an INDEPENDENT photo set:
 *
 *   province / county / city / place → 5 unique images
 *   village  / camping               → 3 unique images
 *
 * The thumbnail counts inside that budget, the same image URL can never be
 * reused by two Entities, and a parent/child/sibling image is never a valid
 * stand-in for another Entity's media.
 *
 * `target` is what the Definition of Done requires. While researching, a
 * smaller set is still stored (status "partial") and an Entity with no
 * attributable image at all is stored without media (status "unavailable")
 * — but only after the mandatory primary-source coverage is complete.
 * `max` is the absolute validation cap of the schema.
 */
export interface MediaPolicyEntry {
  /** Images required for Definition of Done (thumbnail included). */
  target: number;
  /** Smallest set that is still worth storing (status "partial"). */
  minUsable: number;
  /** Hard schema cap. */
  max: number;
}

export type MediaStatus = "complete" | "partial" | "unavailable";

const TARGET_5: MediaPolicyEntry = { target: 5, minUsable: 1, max: 20 };
const TARGET_3: MediaPolicyEntry = { target: 3, minUsable: 1, max: 20 };

export const MEDIA_POLICY: Record<NodeType, MediaPolicyEntry> = {
  province: TARGET_5,
  county: TARGET_5,
  city: TARGET_5,
  place: TARGET_5,
  village: TARGET_3,
  camping: TARGET_3,
  // Grouping levels never own an entity file; kept for exhaustiveness.
  district: TARGET_3,
  ruralDistrict: TARGET_3,
};

export function mediaPolicyFor(nodeType: NodeType | null | undefined): MediaPolicyEntry {
  if (!nodeType) return MEDIA_POLICY.place;
  return MEDIA_POLICY[nodeType] ?? MEDIA_POLICY.place;
}

/** Three-state media status derived from the number of DISTINCT image URLs. */
export function mediaStatusFor(nodeType: NodeType | null | undefined, distinctImages: number): MediaStatus {
  const policy = mediaPolicyFor(nodeType);
  if (distinctImages <= 0) return "unavailable";
  return distinctImages >= policy.target ? "complete" : "partial";
}

export const MEDIA_POLICY_SUMMARY =
  "Entity-owned media: 5 unique images for province/county/city/place and 3 for village/camping; " +
  "the thumbnail counts toward the target; the same image URL cannot be reused across Entities; " +
  "partial sets may be saved while researching, but the Definition of Done requires the target.";
