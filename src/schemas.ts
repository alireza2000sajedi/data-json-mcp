import fs from "node:fs";
import path from "node:path";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import addFormatsDefault from "ajv-formats";

type AjvInstance = InstanceType<typeof Ajv2020>;

// ajv-formats ships as a CJS module; the interop default is the plugin function at runtime.
const addFormats = addFormatsDefault as unknown as (ajv: AjvInstance) => AjvInstance;
import { config } from "./config.js";

interface SchemaBundle {
  placeSchema: Record<string, unknown>;
  validatePlace: (data: unknown) => { valid: boolean; errors: ErrorObject[] };
  approvedLicenses: string[];
  checklistCategories: string[];
  relationTypes: string[];
}

function loadJson(file: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(config.datasetDir, file), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

let bundle: SchemaBundle | null = null;

export function getSchemas(): SchemaBundle {
  if (bundle) return bundle;

  const placeSchema = loadJson("place.schema.json");

  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const validatePlace = ajv.compile(placeSchema as object);

  const defs = (placeSchema as any).$defs ?? {};
  const mediaItem = defs.mediaItem ?? {};
  const approvedLicenses: string[] = mediaItem.properties?.license?.enum ?? [];

  const checklist = (placeSchema as any).properties?.travelChecklist ?? {};
  const checklistCategories: string[] = Object.keys(checklist.properties ?? {});

  const relations = (placeSchema as any).properties?.relations?.items ?? {};
  const relationTypes: string[] = relations.properties?.relationType?.enum ?? [];

  bundle = {
    placeSchema,
    validatePlace: (data) => {
      const valid = validatePlace(data) as boolean;
      return { valid, errors: (validatePlace.errors ?? []) as ErrorObject[] };
    },
    approvedLicenses,
    checklistCategories,
    relationTypes,
  };
  return bundle;
}

/** Types (type/subType combos) that require the full six-category checklist. */
export function requiresFullChecklist(entity: { type: string; subType?: string }): boolean {
  if (["city", "village", "natural", "route", "accommodation"].includes(entity.type)) return true;
  if (entity.type === "other" && ["province", "county"].includes(entity.subType ?? "")) return true;
  if (entity.type === "recreational" && entity.subType === "campground") return true;
  return false;
}

/** Read-only content of the README (Source of Truth for rules). */
export function readReadme(): string {
  return fs.readFileSync(path.join(config.datasetDir, "README.md"), "utf8");
}
