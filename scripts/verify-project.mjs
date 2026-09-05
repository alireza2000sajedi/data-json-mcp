#!/usr/bin/env node
/**
 * Planro project verification.
 *
 * Two modes:
 *   node scripts/verify-project.mjs            → WORKSPACE mode (default)
 *       Verifies the project contract. Build artefacts (node_modules/, dist/)
 *       are expected here, because the documented bootstrap is
 *       `npm install && npm run build && npm run verify`.
 *
 *   node scripts/verify-project.mjs --package  → PACKAGE mode (delivery/ZIP)
 *       Additionally requires a clean tree: no node_modules/, dist/, output/.
 *
 * The checks encode the project contract itself (media targets, taxonomy,
 * source policy, prompt inputs, forbidden fields), so a drift between the
 * documents and the code fails here instead of silently reaching an agent run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_MODE = process.argv.includes("--package") || process.env.PLANRO_VERIFY_MODE === "package";

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(read(p));
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const problems = [];
const fail = (msg) => problems.push(msg);
const ok = (cond, msg) => {
  if (!cond) fail(msg);
};

// --- 1. required files ------------------------------------------------------
const REQUIRED = [
  "README.md",
  "START_HERE.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "mcp-client.mjs",
  "docs/PROJECT_REPORT.md",
  "scripts/e2e-province-smoke.mjs",
  "dataset/README.md",
  "dataset/place.schema.json",
  "dataset/entity-field-policy.json",
  "dataset/source_policy.json",
  "dataset/brand_voice.md",
  "prompts/01-start-province.txt",
  "prompts/02-run-scope.txt",
  "prompts/03-resume.txt",
  "prompts/04-repair-entity.txt",
  "prompts/05-final-audit-minify.txt",
  "prompts/README.md",
  "taxonomy/types.json",
  "taxonomy/subtypes.json",
  "taxonomy/categories.json",
  "taxonomy/activities.json",
  "taxonomy/features.json",
  "taxonomy/facilities.json",
  "taxonomy/risks.json",
  "taxonomy/checklist-items.json",
  "taxonomy/README.md",
  "taxonomy/agent-taxonomy/README.md",
  "taxonomy/agent-taxonomy/types.json",
  "taxonomy/agent-taxonomy/subtypes.json",
  "taxonomy/agent-taxonomy/categories.json",
  "taxonomy/agent-taxonomy/activities.json",
  "taxonomy/agent-taxonomy/features.json",
  "taxonomy/agent-taxonomy/facilities.json",
  "taxonomy/agent-taxonomy/risks.json",
  "taxonomy/agent-taxonomy/checklist-items.json",
  "src/index.ts",
  "src/server.ts",
  "src/tools.ts",
];
for (const f of REQUIRED) ok(exists(f), `Missing required file: ${f}`);

ok(!exists("prompt.txt"), "Root prompt.txt must not exist (the prompt sequence lives in prompts/).");
ok(!exists("tests"), "Legacy tests/ directory must not exist (runtime proof is scripts/e2e-province-smoke.mjs).");

if (PACKAGE_MODE) {
  for (const d of ["node_modules", "dist", "output"]) {
    ok(!exists(d), `PACKAGE mode: ${d}/ must be removed before delivery.`);
  }
}

// --- 2. administrative input (31 provinces) ---------------------------------
for (let i = 1; i <= 31; i++) {
  let data;
  try {
    data = readJson(`input/${i}.json`);
  } catch (e) {
    fail(`input/${i}.json is not valid JSON: ${e.message}`);
    continue;
  }
  ok(data.id === i, `input/${i}.json: id must be ${i} (got ${data.id}).`);
  ok(typeof data.name === "string" && data.name.length > 0, `input/${i}.json: name is required.`);
  ok(Array.isArray(data.counties) && data.counties.length > 0, `input/${i}.json: counties[] is required.`);
  for (const [ci, c] of (data.counties ?? []).entries()) {
    ok(
      c && typeof c.name === "string" && Array.isArray(c.cities) && Array.isArray(c.villages),
      `input/${i}.json counties[${ci}] must be {name, cities[], villages[]}.`,
    );
  }
}

// --- 3. global taxonomy -----------------------------------------------------
const TAXONOMY_DOMAINS = ["types", "subtypes", "categories", "activities", "features", "facilities", "risks", "checklist-items"];
const taxonomy = {};
for (const d of TAXONOMY_DOMAINS) {
  const x = readJson(`taxonomy/${d}.json`);
  ok(Array.isArray(x.items), `taxonomy/${d}.json: items[] missing.`);
  const ids = (x.items ?? []).map((i) => i.id);
  ok(new Set(ids).size === ids.length, `taxonomy/${d}.json: duplicate ids.`);
  ok(
    ids.every((id) => typeof id === "string" && /^[a-z0-9_]+$/.test(id)),
    `taxonomy/${d}.json: ids must be lowercase snake_case canonical ids.`,
  );
  taxonomy[d] = new Set(ids);
}
// Agent Taxonomy = parallel catalogs (same shape); staging only
ok(!exists("taxonomy/agent-taxonomy/proposals.json"), "Legacy agent-taxonomy/proposals.json must not exist (use mirror catalogs).");
for (const d of TAXONOMY_DOMAINS) {
  const x = readJson(`taxonomy/agent-taxonomy/${d}.json`);
  ok(Array.isArray(x.items), `taxonomy/agent-taxonomy/${d}.json: items[] missing.`);
  const ids = (x.items ?? []).map((i) => i.id);
  ok(new Set(ids).size === ids.length, `taxonomy/agent-taxonomy/${d}.json: duplicate ids.`);
  ok(
    ids.every((id) => typeof id === "string" && /^[a-z0-9_]+$/.test(id)),
    `taxonomy/agent-taxonomy/${d}.json: ids must be lowercase snake_case.`,
  );
  const overlap = ids.filter((id) => taxonomy[d].has(id));
  ok(
    overlap.length === 0,
    `taxonomy/agent-taxonomy/${d}.json overlaps Global Taxonomy ids: ${overlap.join(", ") || "-"}.`,
  );
  for (const [i, it] of (x.items ?? []).entries()) {
    ok(typeof it.label === "string" && it.label.length > 0, `taxonomy/agent-taxonomy/${d}.json items[${i}]: label required.`);
    ok(it.source && typeof it.source === "object", `taxonomy/agent-taxonomy/${d}.json items[${i}]: source provenance object required.`);
    if (it.source && typeof it.source === "object") {
      ok(typeof it.source.reason === "string" && it.source.reason.length > 0, `taxonomy/agent-taxonomy/${d}.json items[${i}].source.reason required.`);
      ok(typeof it.source.provinceId === "string" && it.source.provinceId.length > 0, `taxonomy/agent-taxonomy/${d}.json items[${i}].source.provinceId required.`);
    }
  }
}

// --- 4. place schema --------------------------------------------------------
const schema = readJson("dataset/place.schema.json");
ok(!("tags" in schema.properties), "place.schema.json: removed field 'tags' is back.");
ok(!("emergencyNumbers" in schema.properties.safety.properties), "place.schema.json: removed field 'emergencyNumbers' is back.");
ok(!("distanceKm" in schema.$defs.transportNode.properties), "place.schema.json: removed field 'distanceKm' is back.");

// schema enums that mirror a taxonomy catalog must match it exactly
const schemaTypeEnum = new Set(schema.properties.type.enum ?? []);
ok(
  [...taxonomy.types].every((id) => schemaTypeEnum.has(id)) && schemaTypeEnum.size === taxonomy.types.size,
  "place.schema.json: properties.type.enum drifted from taxonomy/types.json.",
);
for (const [prop, domain] of [
  ["features", "features"],
  ["facilities", "facilities"],
]) {
  const enumValues = new Set(schema.properties[prop]?.items?.enum ?? []);
  if (enumValues.size === 0) continue; // free-form array is validated by the taxonomy gate
  const tax = taxonomy[domain];
  const extra = [...enumValues].filter((v) => !tax.has(v));
  const missing = [...tax].filter((v) => !enumValues.has(v));
  ok(
    extra.length === 0 && missing.length === 0,
    `place.schema.json: properties.${prop}.enum drifted from taxonomy/${domain}.json (extra: ${extra.join(", ") || "-"}; missing: ${missing.join(", ") || "-"}).`,
  );
}
// travelChecklist mode arrays must use checklist-items taxonomy ids
{
  const modeEnums = Object.values(schema.properties.travelChecklist?.properties ?? {}).map((p) => new Set(p?.items?.enum ?? []));
  ok(modeEnums.length >= 6, "place.schema.json: travelChecklist must define the six travel modes.");
  for (const enumValues of modeEnums) {
    const extra = [...enumValues].filter((v) => !taxonomy["checklist-items"].has(v));
    const missing = [...taxonomy["checklist-items"]].filter((v) => !enumValues.has(v));
    ok(
      extra.length === 0 && missing.length === 0,
      `place.schema.json: travelChecklist item enums drifted from taxonomy/checklist-items.json (extra: ${extra.join(", ") || "-"}; missing: ${missing.join(", ") || "-"}).`,
    );
  }
}

// --- 5. media policy: one target contract everywhere ------------------------
const EXPECTED_TARGETS = { province: 5, county: 5, city: 5, place: 5, village: 3, camping: 3 };
const fieldPolicy = readJson("dataset/entity-field-policy.json");
for (const [type, target] of Object.entries(EXPECTED_TARGETS)) {
  const actual = fieldPolicy.entityTypes?.[type]?.media?.target;
  ok(actual === target, `entity-field-policy.json: media target for '${type}' must be ${target} (got ${actual}).`);
}
const mediaSrc = read("src/media.ts");
ok(/const TARGET_5:\s*MediaPolicyEntry\s*=\s*\{\s*target:\s*5/.test(mediaSrc), "src/media.ts: TARGET_5 must have target 5.");
ok(/const TARGET_3:\s*MediaPolicyEntry\s*=\s*\{\s*target:\s*3/.test(mediaSrc), "src/media.ts: TARGET_3 must have target 3.");
for (const [type, target] of Object.entries(EXPECTED_TARGETS)) {
  const expected = new RegExp(`${type}:\\s*TARGET_${target}`);
  ok(expected.test(mediaSrc), `src/media.ts: MEDIA_POLICY.${type} must use TARGET_${target}.`);
}

// --- 6. source policy -------------------------------------------------------
const sourcePolicy = readJson("dataset/source_policy.json");
const primaries = sourcePolicy.primaryFactSources ?? sourcePolicy.primary ?? [];
ok(primaries.length === 5, `source_policy.json: exactly 5 mandatory primary fact sources expected (got ${primaries.length}).`);
for (const domain of ["kojaro.com", "jabama.com", "alibaba.ir", "lastsecond.ir", "flytoday.ir"]) {
  ok(primaries.some((p) => p.domain === domain), `source_policy.json: missing mandatory primary source ${domain}.`);
}
for (const t of ["province", "county", "city", "village", "place", "camping"]) {
  ok(sourcePolicy.enforcement?.[t] === "all", `source_policy.json: enforcement.${t} must be "all".`);
}

// --- 7. prompts -------------------------------------------------------------
const PROMPT_FILES = [
  "01-start-province.txt",
  "02-run-scope.txt",
  "03-resume.txt",
  "04-repair-entity.txt",
  "05-final-audit-minify.txt",
];
const prompts = PROMPT_FILES.map((f) => read(`prompts/${f}`));
const CONCRETE_ID = /\b(?:province|county|city|village|place)-\d+(?:-[A-Za-z0-9_-]+)*\b/;
prompts.forEach((t, i) => ok(!CONCRETE_ID.test(t), `prompts/${PROMPT_FILES[i]}: concrete scope id found — prompts must stay generic.`));
ok(/province_id=<PROVINCE_ID>/.test(prompts[0]), "prompts/01: province_id input block missing.");
ok(/scope_id=<SCOPE_ID>/.test(prompts[1]), "prompts/02: scope_id input block missing.");
ok(/previous_id=<PREVIOUS_ID>/.test(prompts[2]), "prompts/03: previous_id input block missing.");
ok(/entity_id=<ENTITY_ID>/.test(prompts[3]), "prompts/04: entity_id input block missing.");
ok(/final_audit=true/.test(prompts[4]), "prompts/05: final_audit input block missing.");
// runtime-input contract: a real value in the current task beats the placeholder
ok(
  /authoritative/i.test(prompts[0]),
  "prompts/01: the runtime-input contract (a real province_id in the current task is authoritative) is missing.",
);
ok(
  /زیردرخت|subtree/i.test(prompts[1]),
  "prompts/02: must state that one Scope means the whole subtree (county + cities/villages/places).",
);
ok(
  /planro:\/\/taxonomy\/agent|agent-taxonomy\//.test(prompts[0]) && /taxonomy\/agent-taxonomy\//.test(prompts[0]),
  "prompts/01: missing-concept → create item in taxonomy/agent-taxonomy/ (parallel catalogs) is missing.",
);
ok(
  /agent-taxonomy/.test(prompts[0]) && /(نبود|اضافه)/.test(prompts[0]),
  "prompts/01: end-of-province report for missing taxonomy items is missing.",
);
// Delivery stage: DoD+validate → git status/add output → commit/push; no commit if DoD fails
prompts.forEach((t, i) => {
  const file = `prompts/${PROMPT_FILES[i]}`;
  ok(/check_definition_of_done/.test(t), `${file}: delivery stage missing check_definition_of_done.`);
  ok(/validate_province/.test(t), `${file}: delivery stage missing validate_province.`);
  ok(/git status --short output\//.test(t), `${file}: delivery stage missing 'git status --short output/'.`);
  ok(/git add output\//.test(t), `${file}: delivery stage missing 'git add output/'.`);
  ok(/commit ممنوع/.test(t), `${file}: delivery stage must forbid commit when DoD fails ('commit ممنوع').`);
});

// --- 7b. output/ must stay trackable by git ---------------------------------
const gitignore = exists(".gitignore") ? read(".gitignore") : "";
const ignoreLines = gitignore.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
ok(
  !ignoreLines.some((l) => l === "output" || l === "output/" || l === "/output" || l === "/output/"),
  ".gitignore must NOT ignore output/ — dataset files produced by the pipeline must be commit-able.",
);

// --- 8. removed tooling stays removed ---------------------------------------
const srcFiles = fs.readdirSync(path.join(ROOT, "src")).filter((f) => f.endsWith(".ts"));
for (const f of srcFiles) {
  ok(!read(`src/${f}`).includes("resolve_scope_name"), `src/${f}: legacy resolve_scope_name reference found.`);
}
const server = read("src/server.ts");
for (const required of ["import_province_scopes", "set_active_scope", "save_active_entity", "check_definition_of_done", "validate_province"]) {
  ok(server.includes(`"${required}"`), `src/server.ts: tool '${required}' is not registered.`);
}

// --- report -----------------------------------------------------------------
if (problems.length > 0) {
  console.error(`Planro verification FAILED (${problems.length} problem${problems.length === 1 ? "" : "s"}):`);
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(`Planro verification PASS (${PACKAGE_MODE ? "package" : "workspace"} mode)`);
