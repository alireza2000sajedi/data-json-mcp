import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const datasetDir = path.join(repoRoot, "dataset");

export function makeOutputDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "planro-test-"));
}

export function setupEnv() {
  process.env.PLANRO_DATASET_DIR = datasetDir;
  const dir = makeOutputDir();
  process.env.PLANRO_OUTPUT_DIR = dir;
  return dir;
}

export function cleanup(outputDir) {
  if (outputDir && fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

export function clearOutput(outputDir) {
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });
}

export function mediaItem(i, extra = {}) {
  return {
    url: `https://upload.wikimedia.org/wikipedia/commons/thumb/${i}/example-${i}.jpg`,
    alt: `تصویر ${i}`,
    caption: `نمای ${i}`,
    credit: "Wikimedia Commons",
    license: "CC-BY-SA-4.0",
    source: "Wikimedia Commons",
    sourceUrl: `https://commons.wikimedia.org/wiki/File:example-${i}.jpg`,
    ...extra,
  };
}

function deepMerge(base, overrides) {
  if (overrides === undefined) return base;
  if (Array.isArray(overrides) || typeof overrides !== "object" || overrides === null) return overrides;
  // Shallow: a provided subtree replaces the base subtree wholesale.
  const out = { ...base };
  for (const k of Object.keys(overrides)) {
    if (overrides[k] === undefined) continue;
    out[k] = overrides[k];
  }
  return out;
}

/**
 * Build a schema-valid active "historical" place entity (a POI, no travelChecklist required).
 */
export function makeValidPlace(overrides = {}) {
  const images = Array.from({ length: 10 }, (_, i) => mediaItem(i));
  const entity = {
    id: "place-30-1",
    slug: "famnin-mosque",
    type: "historical",
    subType: "mosque",
    status: "active",
    name: { fa: "مسجد فامنین" },
    location: {
      country: "Iran",
      province: "همدان",
      county: "فامنین",
      city: "فامنین",
      coordinates: { latitude: 35.1, longitude: 48.9 },
      address: { full: "فامنین، خیابان امام" },
    },
    content: { summary: { fa: "مسجد تاریخی فامنین" } },
    visit: { bestSeasons: ["spring"] },
    evidence: [{ field: "content.summary", claim: "مسجد تاریخی", sourceUrl: "https://example.com/famnin" }],
    sources: [{ title: "Example", url: "https://example.com/famnin", type: "official", accessedAt: "2026-08-24" }],
    media: {
      thumbnail: mediaItem(99, { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/99/thumb.jpg" }),
      images,
    },
    costs: {
      currency: "IRT",
      priceAsOf: "2026-08-24",
      forTravelers: 1,
      items: [
        {
          category: "entry",
          name: "ورودی",
          required: false,
          unit: "per_person",
          budget: { economy: { min: 10000, max: 20000 }, standard: { min: 20000, max: 40000 }, comfortable: { min: 40000, max: 80000 } },
          inflationCategory: "recreation_and_culture",
          sourceUrl: "https://example.com/famnin",
        },
      ],
      estimatedVisitTotal: {
        economy: { min: 10000, max: 20000 },
        standard: { min: 20000, max: 40000 },
        comfortable: { min: 40000, max: 80000 },
      },
    },
  };
  return deepMerge(entity, overrides);
}

export function makeVillage(overrides = {}) {
  const e = makeValidPlace({
    id: "village-30-v1",
    slug: "famnin-village",
    type: "village",
    name: { fa: "روستای فامنین" },
    location: {
      country: "Iran",
      province: "همدان",
      county: "فامنین",
      ruralDistrict: "دهستان پیشخور",
      village: "فامنین",
      coordinates: { latitude: 35.1, longitude: 48.9 },
      address: { full: "روستای فامنین" },
    },
    typeSpecific: { village: { isTourismVillage: true } },
    travelChecklist: sixChecklist(),
  });
  delete e.subType;
  return deepMerge(e, overrides);
}

export function makeCity(overrides = {}) {
  const e = makeValidPlace({
    id: "city-30-1",
    slug: "famnin-city",
    type: "city",
    name: { fa: "فامنین" },
    location: {
      country: "Iran",
      province: "همدان",
      county: "فامنین",
      city: "فامنین",
      coordinates: { latitude: 35.1, longitude: 48.9 },
      address: { full: "شهر فامنین" },
    },
    travelChecklist: sixChecklist(),
  });
  delete e.subType;
  return deepMerge(e, overrides);
}

export function sixChecklist() {
  return {
    tour: ["کارت شناسایی"],
    personalCar: ["کارت سوخت"],
    airplane: ["پاسپورت"],
    camping: ["چادر"],
    train: ["بلیت قطار"],
    bus: ["بلیت رفت و برگشت"],
  };
}

/** Seed notes with a province/county/place hierarchy and register evidence source. */
export async function seedProvinceHierarchy(provinceId = "province-30") {
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes(provinceId);
  notes.upsertNode(state, { nodeId: provinceId, nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "research_required" });
  notes.upsertNode(state, { nodeId: "county-30-1", nodeType: "county", canonicalName: "فامنین", parentNodeId: provinceId, state: "research_required" });
  notes.upsertNode(state, { nodeId: "place-30-1", nodeType: "place", canonicalName: "مسجد فامنین", parentNodeId: "county-30-1", state: "research_required" });
  notes.addSourceMatrixEntry(state, {
    id: "src-1",
    nodeId: "place-30-1",
    query: "مسجد فامنین",
    sourceUrl: "https://example.com/famnin",
    sourceTitle: "Example",
    resultSummary: "مسجد تاریخی فامنین",
    ownershipStatus: "belongs_to_node",
  });
  notes.writeNotes(state);
  return notes;
}
