import type { NodeType } from "./types.js";

/**
 * Media policy (single source for code; mirrors prompts/01-start-province.txt §9 and
 * قانون رسانهٔ پروژه). BEST-EFFORT model:
 *
 *   target    — the number of distinct attributable images we AIM for.
 *   minUsable — the smallest count that still gets SAVED (partial media is
 *               valuable and must never be discarded).
 *   max       — hard cap of stored images (schema maxItems).
 *
 * FINAL CONTRACT (owner-approved 2026-08-28, round 2):
 *   target    = the preferred number of high-quality images.
 *   minimumForCompletion = the minimum distinct attributable images needed for DoD completion.
 *               province/county/city/place: 10 | village/camping: 3
 *   selection = the best min(usableCount, target) distinct images, NEVER more
 *               than target (the thumbnail counts inside this budget).
 *   max = 20 is only the absolute validation backstop (schema maxItems /
 *   MEDIA_TOO_MANY_IMAGES); the normal pipeline never stores above target.
 *   0 usable images after full primary coverage → the entity is still saved
 *   WITHOUT media and media.status = "unavailable" (never a rejection).
 *
 * mediaStatus:
 *   complete    — distinct images >= target
 *   partial     — 1 <= distinct images < target
 *   unavailable — no usable image at all
 */
export interface MediaPolicyEntry {
  target: number;
  /** Minimum distinct images required before a scope can report Definition-of-Done. */
  minimumForCompletion: number;
  /** Recommended minimum candidate pool before finalization, when available. */
  candidateSearchTarget: number;
  max: number;
}

export type MediaStatus = "complete" | "partial" | "unavailable";

export const MEDIA_POLICY: Record<NodeType, MediaPolicyEntry> = {
  province: { target: 10, minimumForCompletion: 5, candidateSearchTarget: 12, max: 20 },
  county: { target: 10, minimumForCompletion: 5, candidateSearchTarget: 12, max: 20 },
  city: { target: 10, minimumForCompletion: 5, candidateSearchTarget: 12, max: 20 },
  village: { target: 3, minimumForCompletion: 3, candidateSearchTarget: 5, max: 20 },
  place: { target: 10, minimumForCompletion: 5, candidateSearchTarget: 12, max: 20 },
  camping: { target: 3, minimumForCompletion: 3, candidateSearchTarget: 5, max: 20 },
  district: { target: 3, minimumForCompletion: 2, candidateSearchTarget: 4, max: 20 },
  ruralDistrict: { target: 3, minimumForCompletion: 2, candidateSearchTarget: 4, max: 20 },
};

export function mediaPolicyFor(nodeType: NodeType | null | undefined): MediaPolicyEntry {
  if (!nodeType) return MEDIA_POLICY.place;
  return MEDIA_POLICY[nodeType] ?? MEDIA_POLICY.place;
}

/** Derive the media status from the number of DISTINCT attributable image URLs. */
export function mediaStatusFor(nodeType: NodeType | null | undefined, distinctImageCount: number): MediaStatus {
  const policy = mediaPolicyFor(nodeType);
  if (distinctImageCount <= 0) return "unavailable";
  if (distinctImageCount >= policy.target) return "complete";
  return "partial";
}

/** Human-readable policy summary (used in tool output/messages). */
export const MEDIA_POLICY_SUMMARY =
  "media is non-blocking for save but blocking for Definition-of-Done: target 10 images for province/county/city/place and 3 for village/camping; completion requires at least 5 distinct images for province/county/city/place (3 for village/camping); search for a broader candidate pool first; select the best min(usable,target); never exceed 20; 0 images may be saved only after full primary coverage as unavailable.";
