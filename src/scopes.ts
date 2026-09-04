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

export interface ScopeUnit {
  id: string;
  name: string;
  type: "county" | "city" | "village";
  parentId: string;
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
  counts: { counties: number; cities: number; villages: number };
  tree: ScopeTreeCounty[];
  /** Flat id → unit lookup. */
  index: Record<string, ScopeUnit>;
  /** name → units (several ids may share a name, e.g. duplicate village names). */
  indexByName: Record<string, ScopeUnit[]>;
}

export interface ProvinceScopesIndexEntry {
  provinceId: string;
  provinceName: string;
  counts: { counties: number; cities: number; villages: number };
  counties: { id: string; name: string; cities: number; villages: number }[];
}

interface CountyInput {
  name: string;
  cities: string[];
  villages: string[];
}

interface ProvinceInput {
  id: number;
  name: string;
  counties: CountyInput[];
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
    if (!c || typeof c.name !== "string" || !Array.isArray(c.cities) || !Array.isArray(c.villages)) {
      throw new Error(`counties[${i}] in ${file} must have name:string, cities:string[], villages:string[].`);
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

  data.counties.forEach((c, ci) => {
    const countyId = `county-${p}-${ci + 1}`;
    const county: ScopeTreeCounty = {
      id: countyId,
      name: c.name,
      type: "county",
      parentId: canonicalProvinceId,
      cities: [],
      villages: [],
    };
    add(county);

    for (const name of c.cities) {
      cityN += 1;
      const city: ScopeUnit = { id: `city-${p}-${cityN}`, name, type: "city", parentId: countyId };
      county.cities.push(city);
      add(city);
    }
    for (const name of c.villages) {
      villageN += 1;
      const village: ScopeUnit = { id: `village-${p}-v${villageN}`, name, type: "village", parentId: countyId };
      county.villages.push(village);
      add(village);
    }
    tree.push(county);
  });

  return {
    provinceId: canonicalProvinceId,
    provinceName: data.name,
    source: `input/${data.id}.json`,
    counts: { counties: tree.length, cities: cityN, villages: villageN },
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
    const counties = data.counties.map((c, i) => ({
      id: `county-${n}-${i + 1}`,
      name: c.name,
      cities: c.cities.length,
      villages: c.villages.length,
    }));
    out.push({
      provinceId: id,
      provinceName: data.name,
      counts: { counties: counties.length, cities: data.counties.reduce((a, c) => a + c.cities.length, 0), villages: data.counties.reduce((a, c) => a + c.villages.length, 0) },
      counties,
    });
  }
  return out;
}
