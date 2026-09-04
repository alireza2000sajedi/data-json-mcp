import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const required = [
  "README.md", "START_HERE.md", "package.json", "package-lock.json", "tsconfig.json",
  "mcp-client.mjs",
  "dataset/place.schema.json", "dataset/source_policy.json", "dataset/brand_voice.md", "dataset/iran-cpi.schema.json",
  "prompts/01-start-province.txt", "prompts/02-run-scope.txt", "prompts/03-resume.txt",
  "prompts/04-repair-entity.txt", "prompts/05-final-audit-minify.txt", "prompts/README.md",
  "taxonomy/types.json", "taxonomy/subtypes.json", "taxonomy/categories.json", "taxonomy/activities.json",
  "taxonomy/features.json", "taxonomy/facilities.json", "taxonomy/risks.json",
  "src/config.ts", "src/taxonomy.ts", "src/quality-gate.ts", "src/tools.ts", "src/server.ts",
];
for (const p of required) { if (!fs.existsSync(path.join(ROOT, p))) throw new Error(`Missing required file: ${p}`); }
if (fs.existsSync(path.join(ROOT, "prompt.txt"))) throw new Error("Root prompt.txt must not exist");
for (const forbidden of ["node_modules", "dist", "output"]) { if (fs.existsSync(path.join(ROOT, forbidden))) throw new Error(`Forbidden artifact present: ${forbidden}`); }

for (let i = 1; i <= 31; i++) {
  const p = `input/${i}.json`;
  JSON.parse(read(p));
}

for (const file of ["types.json","subtypes.json","categories.json","activities.json","features.json","facilities.json","risks.json"]) {
  const data = JSON.parse(read(`taxonomy/${file}`));
  if (!data || !Array.isArray(data.items)) throw new Error(`Taxonomy file has no items array: ${file}`);
  const ids = data.items.map(x => x.id);
  if (ids.some(x => typeof x !== "string" || !x)) throw new Error(`Invalid taxonomy id in ${file}`);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate taxonomy id in ${file}`);
}

const promptTexts = [1,2,3,4,5].map(i => fs.readFileSync(path.join(ROOT, "prompts", `${String(i).padStart(2,"0")}-${["start-province","run-scope","resume","repair-entity","final-audit-minify"][i-1]}.txt`), "utf8"));
const forbiddenConcreteId = /\b(?:province|county|city|village|place)-\d+(?:-[\w-]+)*\b/;
for (const [idx, text] of promptTexts.entries()) {
  if (forbiddenConcreteId.test(text)) throw new Error(`Concrete production ID found in prompt ${idx+1}`);
}
if (!/province_id=<PROVINCE_ID>/.test(promptTexts[0])) throw new Error("Prompt 01 missing province_id variable block");
if (!/scope_id=<SCOPE_ID>/.test(promptTexts[1])) throw new Error("Prompt 02 missing scope_id variable block");
if (!/previous_id=<PREVIOUS_ID>/.test(promptTexts[2])) throw new Error("Prompt 03 missing previous_id variable block");
if (!/entity_id=<ENTITY_ID>/.test(promptTexts[3])) throw new Error("Prompt 04 missing entity_id variable block");
if (!/final_audit=true/.test(promptTexts[4])) throw new Error("Prompt 05 missing final_audit variable block");
console.log("Planro project verification: PASS");
console.log(`Checked ${required.length} required files, 31 province inputs, 7 taxonomy catalogs, and 5 prompts.`);
