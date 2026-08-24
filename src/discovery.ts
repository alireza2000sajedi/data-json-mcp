import type { NodeType } from "./types.js";

/**
 * Fixed, node-scoped discovery query templates.
 *
 * Source of truth: dataset/PLANRO_AGENT_PROMPT.txt ("Discovery استان / County /
 * District / Rural District / City / Village / POI").
 *
 * These tools ONLY generate query strings — they never perform the search. The
 * research agent runs the queries with its own search tools and records results
 * via `record_search_result` (with an ownership status). This keeps the MCP a
 * pure tooling layer and prevents Parent→Child contamination: a county's queries
 * always embed the full county name, never the province-level phrasing.
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
  { query: `روستاهای گردشگری استان ${name}`, lang: "fa", purpose: "tourism villages" },
  { query: `شهرهای استان ${name}`, lang: "fa", purpose: "cities" },
  { query: `شهرستان های استان ${name}`, lang: "fa", purpose: "counties" },
  { query: `بخش های استان ${name}`, lang: "fa", purpose: "districts" },
  { query: `دهستان های استان ${name}`, lang: "fa", purpose: "rural districts" },
];

const COUNTY_QUERIES = (name: string): DiscoveryQuery[] => [
  { query: `جاهای دیدنی شهرستان ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `جاذبه های گردشگری شهرستان ${name}`, lang: "fa", purpose: "attraction discovery" },
  { query: `مکان های دیدنی شهرستان ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `بخش های شهرستان ${name}`, lang: "fa", purpose: "districts" },
  { query: `دهستان های شهرستان ${name}`, lang: "fa", purpose: "rural districts" },
  { query: `شهرهای شهرستان ${name}`, lang: "fa", purpose: "cities" },
  { query: `روستاهای شهرستان ${name}`, lang: "fa", purpose: "villages" },
  { query: `روستاهای گردشگری شهرستان ${name}`, lang: "fa", purpose: "tourism villages" },
  { query: `طبیعت شهرستان ${name}`, lang: "fa", purpose: "nature" },
];

const DISTRICT_QUERIES = (name: string): DiscoveryQuery[] => [
  { query: `جاهای دیدنی بخش ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `دهستان های بخش ${name}`, lang: "fa", purpose: "rural districts" },
  { query: `روستاهای بخش ${name}`, lang: "fa", purpose: "villages" },
];

const RURAL_DISTRICT_QUERIES = (name: string): DiscoveryQuery[] => [
  { query: `جاهای دیدنی دهستان ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `روستاهای دهستان ${name}`, lang: "fa", purpose: "villages" },
  { query: `طبیعت دهستان ${name}`, lang: "fa", purpose: "nature" },
];

const CITY_QUERIES = (name: string): DiscoveryQuery[] => [
  { query: `جاهای دیدنی شهر ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `آثار تاریخی شهر ${name}`, lang: "fa", purpose: "historical sites" },
  { query: `طبیعت شهر ${name}`, lang: "fa", purpose: "nature" },
  { query: `پارک های شهر ${name}`, lang: "fa", purpose: "parks" },
  { query: `موزه های شهر ${name}`, lang: "fa", purpose: "museums" },
  { query: `بازار شهر ${name}`, lang: "fa", purpose: "bazaars/markets" },
  { query: `اقامتگاه های شهر ${name}`, lang: "fa", purpose: "accommodation" },
  { query: `رستوران های شهر ${name}`, lang: "fa", purpose: "restaurants" },
];

const VILLAGE_QUERIES = (name: string): DiscoveryQuery[] => [
  { query: `جاهای دیدنی روستای ${name}`, lang: "fa", purpose: "place discovery" },
  { query: `طبیعت روستای ${name}`, lang: "fa", purpose: "nature" },
  { query: `آثار تاریخی روستای ${name}`, lang: "fa", purpose: "historical sites" },
  { query: `معماری روستای ${name}`, lang: "fa", purpose: "architecture" },
  { query: `کمپینگ روستای ${name}`, lang: "fa", purpose: "camping" },
  { query: `اقامتگاه روستای ${name}`, lang: "fa", purpose: "accommodation" },
];

const PLACE_QUERIES = (name: string, ctx: DiscoveryContext): DiscoveryQuery[] => {
  const queries: DiscoveryQuery[] = [];
  // A POI query must always carry its geographic context — never a bare name.
  if (ctx.city) queries.push({ query: `${name} ${ctx.city} ${ctx.county ?? ""} ${ctx.province ?? ""}`.trim(), lang: "fa", purpose: "POI with city context" });
  else if (ctx.county) queries.push({ query: `${name} ${ctx.county} ${ctx.province ?? ""}`.trim(), lang: "fa", purpose: "POI with county context" });
  else if (ctx.province) queries.push({ query: `${name} ${ctx.province}`, lang: "fa", purpose: "POI with province context" });
  if (ctx.province) queries.push({ query: `${name} ${ctx.province} Iran`, lang: "en", purpose: "English disambiguation with Iran" });
  return queries;
};

const CAMPING_QUERIES = (name: string, ctx: DiscoveryContext): DiscoveryQuery[] => {
  const queries: DiscoveryQuery[] = [];
  const scope = [ctx.city, ctx.county, ctx.province].filter(Boolean).join(" ");
  queries.push({ query: `کمپینگ ${name} ${scope}`.trim(), lang: "fa", purpose: "camping" });
  queries.push({ query: `کمپ ${name} ${scope}`.trim(), lang: "fa", purpose: "campsite" });
  queries.push({ query: `اقامتگاه موقت ${name} ${scope}`.trim(), lang: "fa", purpose: "temporary accommodation" });
  if (ctx.province) queries.push({ query: `${name} camping ${ctx.province} Iran`, lang: "en", purpose: "English camping search" });
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
      return CITY_QUERIES(name);
    case "village":
      return VILLAGE_QUERIES(name);
    case "camping":
      return CAMPING_QUERIES(name, ctx);
    case "place":
      return PLACE_QUERIES(name, ctx);
    default:
      return PLACE_QUERIES(name, ctx);
  }
}

export const DISCOVERY_NODE_TYPES: NodeType[] = ["province", "county", "district", "ruralDistrict", "city", "village", "place", "camping"];
