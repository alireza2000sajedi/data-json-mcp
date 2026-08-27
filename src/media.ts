import type { NodeType } from "./types.js";

/**
 * Media policy (single source for code; mirrors prompt.txt §9 and
 * dataset/README.md §12). BEST-EFFORT model:
 *
 *   target    — the number of distinct attributable images we AIM for.
 *   minUsable — the smallest count that still gets SAVED (partial media is
 *               valuable and must never be discarded).
 *   max       — hard cap of stored images (schema maxItems).
 *
 * Decisions (owner-approved 2026-08-28):
 *   province/county/city/place/camping: target 10
 *   village:                             target 3
 *   minUsable = 1 for every type; 0 usable images → the entity is still saved
 *   WITHOUT media and media.status = "unavailable".
 *
 * mediaStatus:
 *   complete    — distinct images >= target
 *   partial     — 1 <= distinct images < target
 *   unavailable — no usable image at all
 */
export interface MediaPolicyEntry {
  target: number;
  minUsable: number;
  max: number;
}

export type MediaStatus = "complete" | "partial" | "unavailable";

export const MEDIA_POLICY: Record<NodeType, MediaPolicyEntry> = {
  province: { target: 10, minUsable: 1, max: 20 },
  county: { target: 10, minUsable: 1, max: 20 },
  city: { target: 10, minUsable: 1, max: 20 },
  village: { target: 3, minUsable: 1, max: 20 },
  place: { target: 10, minUsable: 1, max: 20 },
  camping: { target: 10, minUsable: 1, max: 20 },
  district: { target: 3, minUsable: 1, max: 20 },
  ruralDistrict: { target: 3, minUsable: 1, max: 20 },
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
  "best-effort: target 10 images for province/county/city/place/camping, 3 for village; save whatever is found (partial OK, even 1 image); 0 images → save WITHOUT media (status unavailable); hard cap 20";
