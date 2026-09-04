import type { NodeType } from "./types.js";
export interface MediaPolicyEntry{target:number;minUsable:number;max:number;}
export type MediaStatus="complete"|"partial"|"unavailable";
export const MEDIA_POLICY:Record<NodeType,MediaPolicyEntry>={province:{target:5,minUsable:1,max:20},county:{target:5,minUsable:1,max:20},city:{target:5,minUsable:1,max:20},village:{target:3,minUsable:1,max:20},place:{target:5,minUsable:1,max:20},camping:{target:3,minUsable:1,max:20},district:{target:3,minUsable:1,max:20},ruralDistrict:{target:3,minUsable:1,max:20}};
export function mediaPolicyFor(t:NodeType|null|undefined){return t?MEDIA_POLICY[t]??MEDIA_POLICY.place:MEDIA_POLICY.place;}
export function mediaStatusFor(t:NodeType|null|undefined,n:number):MediaStatus{const p=mediaPolicyFor(t);return n<=0?"unavailable":n>=p.target?"complete":"partial";}
export const MEDIA_POLICY_SUMMARY="Entity-owned media: 5 unique images for province/county/city/place and 3 for village/camping; thumbnail counts toward the target; the same image URL cannot be reused across entities; partial may be saved during research but DoD requires the target.";
