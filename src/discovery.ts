import type { NodeType } from "./types.js";

/**
 * Fixed, node-scoped discovery query templates.
 * These tools ONLY generate query strings — they never perform the search.
 */

export interface DiscoveryQuery {
  query: string;
  lang: "fa" | "en";
  purpose: string;
}

export interface DiscoveryContext {
  province?: string;
  county?: string;
  district?: string;
  ruralDistrict?: string;
  city?: string;
  village?: string;
}

const PROVINCE_QUERIES = (name: string): DiscoveryQuery[] => [
  { query: `جاهای دیدنی استان ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `جاذبه های گردشگری استان ${name}`, lang: "fa", purpose: "attraction discovery" },
  { query: `مکان های دیدنی استان ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `گردشگری استان ${name}`, lang: "fa", purpose: "tourism overview" },
  { query: `طبیعت گردی استان ${name}`, lang: "fa", purpose: "nature discovery" },
  { query: `شهرهای استان ${name}`, lang: "fa", purpose: "cities" },
  { query: `شهرستان های استان ${name}`, lang: "fa", purpose: "counties" },
  { query: `عکس استان ${name}`, lang: "fa", purpose: "media: web image search (fa)" },
  { query: `${name} Iran photos`, lang: "en", purpose: "media: image search (en, Commons + web)" },
];

const COUNTY_QUERIES = (name: string): DiscoveryQuery[] => [
  { query: `جاهای دیدنی شهرستان ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `جاذبه های گردشگری شهرستان ${name}`, lang: "fa", purpose: "attraction discovery" },
  { query: `مکان های دیدنی شهرستان ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `شهرهای شهرستان ${name}`, lang: "fa", purpose: "cities" },
  { query: `طبیعت شهرستان ${name}`, lang: "fa", purpose: "nature" },
  { query: `عکس شهرستان ${name}`, lang: "fa", purpose: "media: web image search (fa)" },
  { query: `${name} Iran photos`, lang: "en", purpose: "media: image search (en, Commons + web)" },
];

const DISTRICT_QUERIES = (name: string): DiscoveryQuery[] => [
  { query: `جاهای دیدنی بخش ${name}`, lang: "fa", purpose: "place discovery" },
];

const RURAL_DISTRICT_QUERIES = (name: string): DiscoveryQuery[] => [
  { query: `جاهای دیدنی دهستان ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `طبیعت دهستان ${name}`, lang: "fa", purpose: "nature" },
];

const CITY_QUERIES = (name: string, ctx: DiscoveryContext = {}): DiscoveryQuery[] => {
  const scope = [name, ctx.county, ctx.province].filter(Boolean).join(" ");
  return [
    { query: `جاهای دیدنی ${scope}`, lang: "fa", purpose: "place discovery" },
    { query: `جاذبه های گردشگری ${scope}`, lang: "fa", purpose: "attraction discovery" },
    { query: `آثار تاریخی ${scope}`, lang: "fa", purpose: "historical sites" },
    { query: `موزه ${scope}`, lang: "fa", purpose: "museums" },
    { query: `بازار تاریخی ${scope}`, lang: "fa", purpose: "bazaars/markets" },
    { query: `کاخ قلعه آبشار غار ${scope}`, lang: "fa", purpose: "landmark types" },
    { query: `طبیعت گردی ${scope}`, lang: "fa", purpose: "nature" },
    { query: `${name} tourist attractions ${ctx.province ?? "Iran"}`, lang: "en", purpose: "EN attraction list" },
    { query: `عکس شهر ${scope}`, lang: "fa", purpose: "media: web image search (fa)" },
    { query: `${name} Iran city photos`, lang: "en", purpose: "media: image search (en, Commons + web)" },
  ];
};

const VILLAGE_QUERIES = (name: string, ctx: DiscoveryContext = {}): DiscoveryQuery[] => {
  const scope = [name, ctx.city ?? ctx.county, ctx.province].filter(Boolean).join(" ");
  return [
    { query: `جاهای دیدنی روستای ${scope}`, lang: "fa", purpose: "village place discovery" },
    { query: `جاذبه گردشگری روستای ${scope}`, lang: "fa", purpose: "village attractions" },
    { query: `آثار تاریخی روستای ${scope}`, lang: "fa", purpose: "village heritage" },
    { query: `عکس روستای ${scope}`, lang: "fa", purpose: "media: web image search (fa)" },
  ];
};

const PLACE_QUERIES = (name: string, ctx: DiscoveryContext): DiscoveryQuery[] => {
  const queries: DiscoveryQuery[] = [];
  if (ctx.city) queries.push({ query: `${name} ${ctx.city} ${ctx.county ?? ""} ${ctx.province ?? ""}`.trim(), lang: "fa", purpose: "POI with city context" });
  else if (ctx.county) queries.push({ query: `${name} ${ctx.county} ${ctx.province ?? ""}`.trim(), lang: "fa", purpose: "POI with county context" });
  else if (ctx.province) queries.push({ query: `${name} ${ctx.province}`, lang: "fa", purpose: "POI with province context" });
  if (ctx.province) queries.push({ query: `${name} ${ctx.province} Iran`, lang: "en", purpose: "English disambiguation with Iran" });
  const mediaScope = [ctx.city ?? ctx.county, ctx.province].filter(Boolean).join(" ");
  queries.push({ query: `عکس ${name} ${mediaScope}`.trim(), lang: "fa", purpose: "media: web image search (fa)" });
  queries.push({ query: `${name} ${mediaScope} photo`, lang: "en", purpose: "media: image search (en, Commons + web)" });
  return queries;
};

export function buildDiscoveryQueries(nodeType: NodeType, canonicalName: string, ctx: DiscoveryContext = {}): DiscoveryQuery[] {
  const name = (canonicalName ?? "").trim();
  if (!name) throw new Error("canonicalName is required to generate scoped queries.");
  switch (nodeType) {
    case "province":
      return PROVINCE_QUERIES(name);
    case "county":
      return COUNTY_QUERIES(name);
    case "district":
      return DISTRICT_QUERIES(name);
    case "ruralDistrict":
      return RURAL_DISTRICT_QUERIES(name);
    case "city":
      return CITY_QUERIES(name, ctx);
    case "village":
      return VILLAGE_QUERIES(name, ctx);
    case "place":
      return PLACE_QUERIES(name, ctx);
    default:
      return PLACE_QUERIES(name, ctx);
  }
}

export const DISCOVERY_NODE_TYPES: NodeType[] = ["province", "county", "district", "ruralDistrict", "city", "village", "place"];
