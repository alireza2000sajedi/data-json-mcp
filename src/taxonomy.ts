import fs from "node:fs";
import path from "node:path";
import { config, assertSafeSegment } from "./config.js";

export const TAXONOMY_DOMAINS = ["types", "subtypes", "categories", "activities", "features", "facilities", "risks"] as const;
export type TaxonomyDomain = (typeof TAXONOMY_DOMAINS)[number];

export interface TaxonomyItem {
  id: string;
  label: string;
  description?: string;
  aliases?: string[];
}

export interface TaxonomySubtypeItem extends TaxonomyItem {
  appliesTo: string[];
}

export interface TaxonomyBundle {
  version: string;
  types: TaxonomyItem[];
  subtypes: TaxonomySubtypeItem[];
  categories: TaxonomyItem[];
  activities: TaxonomyItem[];
  features: TaxonomyItem[];
  facilities: TaxonomyItem[];
  risks: TaxonomyItem[];
}

export interface TaxonomyProposal {
  proposalId: string;
  domain: TaxonomyDomain;
  id: string;
  label: string;
  description: string;
  appliesTo?: string[];
  aliases?: string[];
  rationale: string;
  examples?: string[];
  proposedBy: string;
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
}

let cached: TaxonomyBundle | null = null;

function readJson<T>(file: string): T {
  const raw = fs.readFileSync(path.join(config.taxonomyDir, file), "utf8");
  return JSON.parse(raw) as T;
}

function assertItemList(name: string, items: TaxonomyItem[]): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item?.id || !/^[a-z][a-z0-9_-]*$/.test(item.id)) throw new Error(`Invalid taxonomy id in ${name}: ${item?.id}`);
    if (ids.has(item.id)) throw new Error(`Duplicate taxonomy id in ${name}: ${item.id}`);
    ids.add(item.id);
    if (!item.label?.trim()) throw new Error(`Taxonomy item '${item.id}' in ${name} has no label.`);
  }
}

export function getTaxonomy(): TaxonomyBundle {
  if (cached) return cached;
  const typeFile = readJson<{ version: string; items: TaxonomyItem[] }>("types.json");
  const subtypeFile = readJson<{ version: string; items: TaxonomySubtypeItem[] }>("subtypes.json");
  const categoryFile = readJson<{ items: TaxonomyItem[] }>("categories.json");
  const activityFile = readJson<{ items: TaxonomyItem[] }>("activities.json");
  const featureFile = readJson<{ items: TaxonomyItem[] }>("features.json");
  const facilityFile = readJson<{ items: TaxonomyItem[] }>("facilities.json");
  const riskFile = readJson<{ items: TaxonomyItem[] }>("risks.json");
  const bundle: TaxonomyBundle = {
    version: String(typeFile.version ?? subtypeFile.version ?? "1.0.0"),
    types: typeFile.items,
    subtypes: subtypeFile.items,
    categories: categoryFile.items,
    activities: activityFile.items,
    features: featureFile.items,
    facilities: facilityFile.items,
    risks: riskFile.items,
  };
  assertItemList("types", bundle.types);
  assertItemList("categories", bundle.categories);
  assertItemList("activities", bundle.activities);
  assertItemList("features", bundle.features);
  assertItemList("facilities", bundle.facilities);
  assertItemList("risks", bundle.risks);
  for (const item of bundle.subtypes) {
    if (!item.id || !/^[a-z][a-z0-9_-]*$/.test(item.id)) throw new Error(`Invalid taxonomy id in subtypes: ${item.id}`);
    if (!item.label?.trim()) throw new Error(`Taxonomy subtype '${item.id}' has no label.`);
    if (!Array.isArray(item.appliesTo) || item.appliesTo.length === 0) throw new Error(`Taxonomy subtype '${item.id}' must declare appliesTo.`);
    if (item.appliesTo.some((t) => !bundle.types.some((x) => x.id === t))) throw new Error(`Taxonomy subtype '${item.id}' references an unknown type.`);
  }
  cached = bundle;
  return cached;
}

export function getTaxonomyDomain(domain?: string): TaxonomyBundle | TaxonomyItem[] | TaxonomySubtypeItem[] {
  const taxonomy = getTaxonomy();
  if (!domain) return taxonomy;
  assertSafeSegment(domain, "domain");
  if (!(TAXONOMY_DOMAINS as readonly string[]).includes(domain)) throw new Error(`Unknown taxonomy domain '${domain}'.`);
  return taxonomy[domain as TaxonomyDomain];
}

export function hasTaxonomyItem(domain: TaxonomyDomain, id: string): boolean {
  return (getTaxonomy()[domain] as TaxonomyItem[]).some((x) => x.id === id);
}

export function getSubtype(id: string): TaxonomySubtypeItem | undefined {
  return getTaxonomy().subtypes.find((x) => x.id === id);
}

const proposalsPath = () => path.join(config.taxonomyDir, "agent-taxonomy", "proposals.json");

export function readTaxonomyProposals(): TaxonomyProposal[] {
  const file = proposalsPath();
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(raw) ? (raw as TaxonomyProposal[]) : [];
}

export function proposeTaxonomyItem(input: Omit<TaxonomyProposal, "proposalId" | "createdAt" | "status">): TaxonomyProposal {
  const taxonomy = getTaxonomy();
  if (hasTaxonomyItem(input.domain, input.id)) throw new Error(`Taxonomy item '${input.id}' already exists in ${input.domain}. Use the existing canonical id.`);
  if (input.domain === "subtypes") {
    if (!input.appliesTo?.length) throw new Error("A subtype proposal requires appliesTo.");
    if (input.appliesTo.some((t) => !taxonomy.types.some((x) => x.id === t))) throw new Error("Subtype proposal references an unknown type.");
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(input.id)) throw new Error("Taxonomy proposal id must be lowercase ASCII snake/kebab style.");
  const proposals = readTaxonomyProposals();
  const duplicate = proposals.find((p) => p.domain === input.domain && p.id === input.id && p.status === "pending");
  if (duplicate) return duplicate;
  const proposal: TaxonomyProposal = {
    ...input,
    proposalId: `taxprop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  fs.mkdirSync(path.dirname(proposalsPath()), { recursive: true });
  fs.writeFileSync(proposalsPath(), JSON.stringify([...proposals, proposal], null, 2) + "\n");
  return proposal;
}

export function clearTaxonomyCache(): void {
  cached = null;
}
