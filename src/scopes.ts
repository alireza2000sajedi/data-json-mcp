import fs from "node:fs";
import path from "node:path";
import { config, assertProvinceId } from "./config.js";

/**
 * Deterministic Scope Registry.
 *
 * Every administrative unit in the project (province → county → city / village)
 * gets ONE dedicated, stable id following dataset/README.md §5:
 *
 *   province-{n}
 *   county-{province}-{n}      (n = 1-based index inside the province)
 *   city-{province}-{n}        (n = province-global ordinal, keeps ids unique
 *                               even when two counties share a city name)
 *   village-{province}-v{n}    (n = province-global ordinal)
 *
 * The registry is derived from the reference checklist `input/{n}.json` and is
 * therefore fully deterministic — the same province always yields the same ids.
 * This is exactly the "Scope A (Province Discovery)" output of the staged
 * workflow: a list of dedicated scope ids the user can select by name or id
 * (e.g. `همدان → فامنین` == `province-30 → county-30-5`).
 */

export interface ScopeLocation {
  lat: number;
  lng: number;
  source?: string;
  bbox?: number[];
}

export interface PlaceChecklistItem {
  name: string;
  location?: ScopeLocation;
  kind?: string;
}

export interface ScopeUnit {
  id: string;
  name: string;
  type: "county" | "city" | "village";
  parentId: string;
  /** Optional checklist coordinates from input/{n}.json (lat/lng). */
  location?: ScopeLocation;
  /** Seed POI names from input — also registered as place graph nodes on import. */
  places?: PlaceChecklistItem[];
  /** Child villages when type is city (county-level villages live on ScopeTreeCounty.villages). */
  villages?: ScopeUnit[];
}

export interface ScopeTreeCounty extends ScopeUnit {
  type: "county";
  cities: ScopeUnit[];
  villages: ScopeUnit[];
}

export interface ScopeRegistry {
  provinceId: string;
  provinceName: string;
  source: string;
  location?: ScopeLocation;
  /** Province-level place checklist for discovery/search. */
  places?: PlaceChecklistItem[];
  counts: { counties: number; cities: number; villages: number; places: number };
  tree: ScopeTreeCounty[];
  /** Flat id → unit lookup. */
  index: Record<string, ScopeUnit>;
  /** name → units (several ids may share a name, e.g. duplicate village names). */
  indexByName: Record<string, ScopeUnit[]>;
}

export interface ProvinceScopesIndexEntry {
  provinceId: string;
  provinceName: string;
  counts: { counties: number; cities: number; villages: number; places?: number };
  counties: { id: string; name: string; cities: number; villages: number }[];
}

export type PlaceInput = string | { name: string; location?: ScopeLocation; kind?: string };
/** Checklist villages (selective tourism/heritage settlements — not the full admin archive). */
export type VillageInput =
  | string
  | {
      name: string;
      location?: ScopeLocation;
      places?: PlaceInput[];
    };
export type CityInput =
  | string
  | {
      name: string;
      location?: ScopeLocation;
      places?: PlaceInput[];
      /** Villages that belong under this city (parent = city, not province/county alone). */
      villages?: VillageInput[];
    };

interface CountyInput {
  name: string;
  location?: ScopeLocation;
  places?: PlaceInput[];
  cities: CityInput[];
  villages: VillageInput[];
}

interface ProvinceInput {
  id: number;
  name: string;
  location?: ScopeLocation;
  places?: PlaceInput[];
  counties: CountyInput[];
}

function cityInputName(c: CityInput): string {
  return typeof c === "string" ? c : c.name;
}

function cityInputLocation(c: CityInput): ScopeLocation | undefined {
  return typeof c === "string" ? undefined : c.location;
}

function villageInputName(v: VillageInput): string {
  return typeof v === "string" ? v : v.name;
}

function villageInputLocation(v: VillageInput): ScopeLocation | undefined {
  return typeof v === "string" ? undefined : v.location;
}

function normalizePlaces(raw: PlaceInput[] | undefined): PlaceChecklistItem[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: PlaceChecklistItem[] = [];
  for (const p of raw) {
    if (typeof p === "string") {
      if (p.trim()) out.push({ name: p.trim() });
      continue;
    }
    if (!p || typeof p.name !== "string" || !p.name.trim()) continue;
    out.push({
      name: p.name.trim(),
      ...(isValidLocation(p.location) ? { location: p.location } : {}),
      ...(typeof p.kind === "string" && p.kind ? { kind: p.kind } : {}),
    });
  }
  return out.length ? out : undefined;
}

function isValidLocation(loc: unknown): loc is ScopeLocation {
  if (!loc || typeof loc !== "object") return false;
  const l = loc as ScopeLocation;
  return typeof l.lat === "number" && typeof l.lng === "number" && Number.isFinite(l.lat) && Number.isFinite(l.lng);
}

/** Extract the numeric part of a `province-{n}` id. */
export function provinceNumber(provinceId: string): number {
  const canonical = assertProvinceId(provinceId);
  const m = /^province-(\d+)$/.exec(canonical ?? "");
  if (!m) throw new Error(`Invalid provinceId '${provinceId}'. Expected pattern province-{n} (e.g. province-30).`);
  const n = Number(m[1]);
  if (n < 1 || n > 31) throw new Error(`provinceId '${provinceId}' is out of range (1..31).`);
  return n;
}

export function provinceInputPath(provinceId: string): string {
  return path.join(config.inputDir, `${provinceNumber(provinceId)}.json`);
}

/** Load and validate the administrative checklist for a province. */
export function loadProvinceInput(provinceId: string): ProvinceInput {
  const file = provinceInputPath(provinceId);
  if (!fs.existsSync(file)) {
    throw new Error(`Province input checklist not found: ${file}. Expected input/{n}.json for province-{n}.`);
  }
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(`Province input checklist is not valid JSON: ${file}`);
  }
  const d = data as Partial<ProvinceInput>;
  if (typeof d.id !== "number" || typeof d.name !== "string" || !Array.isArray(d.counties)) {
    throw new Error(`Province input checklist has an unexpected shape: ${file} (expected {id,name,counties[]}).`);
  }
  for (const [i, c] of d.counties.entries()) {
    if (!c || typeof c.name !== "string" || !Array.isArray(c.cities)) {
      throw new Error(`counties[${i}] in ${file} must have name:string, cities:(string|{name,location?})[].`);
    }
    for (const [j, city] of c.cities.entries()) {
      if (typeof city === "string") continue;
      if (!city || typeof city.name !== "string") {
        throw new Error(`counties[${i}].cities[${j}] in ${file} must be a string or {name:string, location?}.`);
      }
      if (city.villages !== undefined && !Array.isArray(city.villages)) {
        throw new Error(`counties[${i}].cities[${j}].villages must be an array when present.`);
      }
      for (const [k, village] of (city.villages ?? []).entries()) {
        if (typeof village === "string") continue;
        if (!village || typeof village.name !== "string") {
          throw new Error(
            `counties[${i}].cities[${j}].villages[${k}] must be a string or {name:string, location?, places?}.`
          );
        }
      }
    }
    if (!Array.isArray(c.villages)) (c as CountyInput).villages = [];
    for (const [j, village] of (c.villages as VillageInput[]).entries()) {
      if (typeof village === "string") continue;
      if (!village || typeof village.name !== "string") {
        throw new Error(`counties[${i}].villages[${j}] in ${file} must be a string or {name:string, location?, places?}.`);
      }
    }
  }
  return d as ProvinceInput;
}

/** Build the deterministic scope registry (tree + flat index) for a province. */
export function buildScopeRegistry(provinceId: string): ScopeRegistry {
  // Accept both the raw numeric input (`30`, per the prompt contract) and the
  // canonical id — every id produced below is always canonical.
  const canonicalProvinceId = assertProvinceId(provinceId);
  const data = loadProvinceInput(canonicalProvinceId);
  const p = provinceNumber(canonicalProvinceId);
  const tree: ScopeTreeCounty[] = [];
  const index: Record<string, ScopeUnit> = {};
  const indexByName: Record<string, ScopeUnit[]> = {};

  const add = (unit: ScopeUnit): void => {
    index[unit.id] = unit;
    if (!indexByName[unit.name]) indexByName[unit.name] = [];
    indexByName[unit.name].push(unit);
  };

  let cityN = 0;
  let villageN = 0;
  let placeN = 0;
  const provincePlaces = normalizePlaces(data.places);
  if (provincePlaces) placeN += provincePlaces.length;

  data.counties.forEach((c, ci) => {
    const countyId = `county-${p}-${ci + 1}`;
    const countyPlaces = normalizePlaces(c.places);
    if (countyPlaces) placeN += countyPlaces.length;
    const county: ScopeTreeCounty = {
      id: countyId,
      name: c.name,
      type: "county",
      parentId: canonicalProvinceId,
      cities: [],
      villages: [],
      ...(isValidLocation(c.location) ? { location: c.location } : {}),
      ...(countyPlaces ? { places: countyPlaces } : {}),
    };
    add(county);

    for (const cityIn of c.cities) {
      cityN += 1;
      const name = cityInputName(cityIn);
      const loc = cityInputLocation(cityIn);
      const cityPlaces = typeof cityIn === "object" ? normalizePlaces(cityIn.places) : undefined;
      if (cityPlaces) placeN += cityPlaces.length;
      const city: ScopeUnit = {
        id: `city-${p}-${cityN}`,
        name,
        type: "city",
        parentId: countyId,
        villages: [],
        ...(isValidLocation(loc) ? { location: loc } : {}),
        ...(cityPlaces ? { places: cityPlaces } : {}),
      };
      county.cities.push(city);
      add(city);

      const cityVillages = typeof cityIn === "object" ? cityIn.villages ?? [] : [];
      for (const villageIn of cityVillages) {
        villageN += 1;
        const vName = villageInputName(villageIn);
        const vLoc = villageInputLocation(villageIn);
        const villagePlaces =
          typeof villageIn === "object" ? normalizePlaces(villageIn.places) : undefined;
        if (villagePlaces) placeN += villagePlaces.length;
        const village: ScopeUnit = {
          id: `village-${p}-v${villageN}`,
          name: vName,
          type: "village",
          parentId: city.id,
          ...(isValidLocation(vLoc) ? { location: vLoc } : {}),
          ...(villagePlaces ? { places: villagePlaces } : {}),
        };
        city.villages!.push(village);
        add(village);
      }
    }

    for (const villageIn of c.villages ?? []) {
      villageN += 1;
      const name = villageInputName(villageIn);
      const loc = villageInputLocation(villageIn);
      const villagePlaces =
        typeof villageIn === "object" ? normalizePlaces(villageIn.places) : undefined;
      if (villagePlaces) placeN += villagePlaces.length;
      const village: ScopeUnit = {
        id: `village-${p}-v${villageN}`,
        name,
        type: "village",
        parentId: countyId,
        ...(isValidLocation(loc) ? { location: loc } : {}),
        ...(villagePlaces ? { places: villagePlaces } : {}),
      };
      county.villages.push(village);
      add(village);
    }

    tree.push(county);
  });

  return {
    provinceId: canonicalProvinceId,
    provinceName: data.name,
    source: `input/${data.id}.json`,
    ...(isValidLocation(data.location) ? { location: data.location } : {}),
    ...(provincePlaces ? { places: provincePlaces } : {}),
    counts: { counties: tree.length, cities: cityN, villages: villageN, places: placeN },
    tree,
    index,
    indexByName,
  };
}

/** Lightweight index of all 31 provinces (province ids, county ids and counts). */
export function listProvinceScopesIndex(): ProvinceScopesIndexEntry[] {
  const out: ProvinceScopesIndexEntry[] = [];
  for (let n = 1; n <= 31; n++) {
    const id = `province-${n}`;
    const data = loadProvinceInput(id);
    const counties = data.counties.map((c, i) => {
      const cityVillages = c.cities.reduce((n, city) => {
        if (typeof city === "string") return n;
        return n + (city.villages?.length ?? 0);
      }, 0);
      return {
        id: `county-${n}-${i + 1}`,
        name: c.name,
        cities: c.cities.length,
        villages: (c.villages?.length ?? 0) + cityVillages,
      };
    });
    out.push({
      provinceId: id,
      provinceName: data.name,
      counts: {
        counties: counties.length,
        cities: data.counties.reduce((a, c) => a + c.cities.length, 0),
        villages: counties.reduce((a, c) => a + c.villages, 0),
        places: 0,
      },
      counties,
    });
  }
  return out;
}
