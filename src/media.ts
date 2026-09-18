import type { NodeType } from "./types.js";

/**
 * Entity-owned media policy (final contract).
 *
 *   province → 5 unique images
 *   county   → 3 unique images
 *   city     → 2–3 unique images (DoD target = 3)
 *   village  → 2 unique images
 *   place    → 4 unique images
 *
 * Selective checklist villages are in pipeline (with nested places).
 *
 * Images are URL-only: never download or write image binaries to disk;
 * only HTTPS imageUrl/url strings are stored on the entity.
 *
 * The thumbnail counts inside that budget, the same image URL can never be
 * reused by two Entities, and a parent/child/sibling image is never a valid
 * stand-in for another Entity's media.
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
const TARGET_4: MediaPolicyEntry = { target: 4, minUsable: 1, max: 20 };
const TARGET_3: MediaPolicyEntry = { target: 3, minUsable: 1, max: 20 };
const TARGET_2: MediaPolicyEntry = { target: 2, minUsable: 1, max: 20 };

export const MEDIA_POLICY: Record<NodeType, MediaPolicyEntry> = {
  province: TARGET_5,
  county: TARGET_3,
  city: TARGET_3,
  place: TARGET_4,
  // Exhaustiveness only — camping not researched as separate entities in this pipeline.
  camping: TARGET_2,
  village: TARGET_2,
  district: TARGET_2,
  ruralDistrict: TARGET_2,
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
  "Entity-owned media: province=5, county=3, city=3 (range 2–3), place=4; " +
  "campsites are stored as Places (e.g. subType campground), not a separate entity type; " +
  "thumbnail counts toward the target; the same image URL cannot be reused across Entities; " +
  "partial sets may be saved while researching, but the Definition of Done requires the target.";
