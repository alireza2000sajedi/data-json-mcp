#!/usr/bin/env node
/**
 * Planro MCP — End-to-End runtime smoke test.
 *
 * Static validation (tsc/build) proves nothing about the workflow, so this
 * script drives the REAL tool layer through a complete province stage in an
 * isolated temporary output directory and asserts every gate of the project
 * contract:
 *
 *   import_province_scopes → get_next_research_node → record_search_result ×5
 *   → record_media_candidate ×5 → finalize_media → save_active_entity
 *   → complete_discovery_task → mark_node_complete → awaitingScopeSelection
 *   → check_definition_of_done (complete:true) → validate_province (invalid:0)
 *   → set_active_scope (next scope is locked and starts pending)
 *
 * It also asserts the NEGATIVE gates (each rule of the contract must actually
 * reject a violating entity): field applicability, cost/FAQ ownership,
 * checklist normalization, taxonomy, evidence↔source binding, media ownership
 * and uniqueness, brand voice, and the zero-image/coverage rule.
 *
 * The fixture below is TEST DATA (a realistic shape), never a research result:
 * nothing here is written into the repository dataset.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "planro-e2e-"));
process.env.PLANRO_OUTPUT_DIR = outDir;

if (!fs.existsSync(path.join(ROOT, "dist", "tools.js"))) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

const tools = await import(pathToFileURL(path.join(ROOT, "dist", "tools.js")).href);

// --- tiny assertion harness -------------------------------------------------
let passed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title) {
  console.log(`\n${title}`);
}
/** Run a tool that is expected to throw, and return the error message. */
function expectThrow(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    return e.message;
  }
}
/** Collect the error codes of a rejected save. */
function codesOf(result) {
  return (result?.errors ?? []).map((e) => e.code);
}

const PROVINCE = "province-30";
const TODAY = new Date().toISOString().slice(0, 10);

// --- fixture: five distinct sources (the five mandatory primaries) ----------
const PRIMARY_SOURCES = [
  { url: "https://www.kojaro.com/attraction/e2e-province-overview/", title: "Kojaro — راهنمای سفر (fixture)" },
  { url: "https://www.jabama.com/mag/e2e-province-overview/", title: "Jabama Mag — راهنمای سفر (fixture)" },
  { url: "https://www.alibaba.ir/mag/e2e-province-overview/", title: "Alibaba Mag — راهنمای سفر (fixture)" },
  { url: "https://www.lastsecond.ir/city-tours/e2e-province-overview", title: "Lastsecond — راهنمای سفر (fixture)" },
  { url: "https://www.flytoday.ir/blog/e2e-province-overview/", title: "Flytoday — راهنمای سفر (fixture)" },
];

const MEDIA = [
  "https://upload.wikimedia.org/e2e/fixture-province-01.jpg",
  "https://upload.wikimedia.org/e2e/fixture-province-02.jpg",
  "https://upload.wikimedia.org/e2e/fixture-province-03.jpg",
  "https://upload.wikimedia.org/e2e/fixture-province-04.jpg",
  "https://upload.wikimedia.org/e2e/fixture-province-05.jpg",
];
const MEDIA_PAGE = "https://commons.wikimedia.org/wiki/File:E2e-fixture-province.jpg";

function baseEntity(overrides = {}) {
  const entity = {
    id: PROVINCE,
    slug: "hamadan-province-e2e",
    type: "other",
    subType: "province",
    status: "active",
    name: { fa: "استان همدان", en: "Hamadan Province" },
    alternativeNames: ["همدان"],
    categories: ["history", "nature"],
    activities: ["visit", "nature_travel"],
    features: ["family_friendly", "all_season"],
    facilities: ["parking", "restaurant"],
    location: {
      country: "Iran",
      countryCode: "IR",
      province: "همدان",
      address: { full: "ایران، استان همدان" },
      coordinates: { latitude: 34.7992, longitude: 48.5146, elevationMeters: 1850 },
    },
    content: {
      summary: { fa: "استان همدان در غرب ایران با بافت تاریخی شهر همدان و ارتفاعات الوند شناخته می‌شود." },
      description: { fa: "این استان در غرب ایران قرار دارد و مرکز آن شهر همدان است. کوهستان الوند و محوطه تاریخی هگمتانه از عناصر شاخص جغرافیا و تاریخ آن هستند." },
    },
    visit: { bestSeasons: ["spring", "summer", "autumn"], bestMonths: [4, 5, 6, 7, 8, 9] },
    safety: { risks: ["extreme_cold", "snow"], mobileCoverage: "full" },
    travelChecklist: {
      personalCar: ["مدارک خودرو", "زنجیر چرخ", "کیت ابزار"],
      train: ["کارت ملی", "بلیت رزروشده"],
    },
    faq: [
      { question: "بهترین زمان سفر به استان همدان چه زمانی است؟", answer: "بهار تا اوایل پاییز هوای معتدل‌تری دارد و برای سفر استانی مناسب‌تر است." },
    ],
    costs: {
      currency: "IRT",
      priceAsOf: TODAY,
      forTravelers: 1,
      items: [
        {
          category: "accommodation",
          name: "اقامت شبانه در سطح استان",
          required: true,
          unit: "per_night",
          budget: {
            economy: { min: 800000, max: 1500000 },
            standard: { min: 1500000, max: 3000000 },
            comfortable: { min: 3000000, max: 6000000 },
          },
          inflationCategory: "restaurants_and_hotels",
          sourceUrl: PRIMARY_SOURCES[1].url,
        },
      ],
      estimatedVisitTotal: {
        economy: { min: 1200000, max: 2200000 },
        standard: { min: 2200000, max: 4000000 },
        comfortable: { min: 4000000, max: 8000000 },
      },
    },
    sources: PRIMARY_SOURCES.map((s) => ({ title: s.title, url: s.url, type: "other", accessedAt: TODAY })),
    evidence: [
      { field: "content.description.fa", claim: "مرکز استان همدان شهر همدان است.", sourceUrl: PRIMARY_SOURCES[0].url },
      { field: "costs.items[0].budget", claim: "بازه قیمت اقامت شبانه در سطح استان.", sourceUrl: PRIMARY_SOURCES[1].url },
    ],
  };
  return { ...structuredClone(entity), ...overrides };
}

// ===========================================================================
section("1) Province stage bootstrap — import_province_scopes");
// ===========================================================================
const imported = tools.toolImportProvinceScopes({ provinceId: "30" });
check("province_id '30' is normalized to province-30", imported.provinceId === PROVINCE, imported.provinceId);
check("9 counties / 31 cities / 962 villages registered from input/30.json",
  imported.scopeSummary.counties === 9 && imported.scopeSummary.cities === 31 && imported.scopeSummary.villages === 962,
  JSON.stringify(imported.scopeSummary));
check("import is idempotent", (() => {
  const again = tools.toolImportProvinceScopes({ provinceId: PROVINCE });
  return again.registeredNodes === imported.registeredNodes;
})());

const next0 = tools.toolGetNextResearchNode({ provinceId: PROVINCE });
check("DFS starts at the province root (no auto-dive into counties)", next0.nodeId === PROVINCE, next0.nodeId);

// ===========================================================================
section("2) Source coverage — the five mandatory primary FACT sources");
// ===========================================================================
const coverage0 = tools.toolGetSourceCoverage({ provinceId: PROVINCE, nodeId: PROVINCE });
check("coverage starts at 0/5", coverage0.searchedCount === 0 && coverage0.required === 5);

for (const s of PRIMARY_SOURCES) {
  tools.toolRecordSearchResult({
    provinceId: PROVINCE,
    nodeId: PROVINCE,
    query: "جاهای دیدنی استان همدان",
    sourceUrl: s.url,
    sourceTitle: s.title,
    resultSummary: "fixture: مرور کلی مقصد در سطح استان.",
    ownershipStatus: "belongs_to_node",
  });
}
const coverage1 = tools.toolGetSourceCoverage({ provinceId: PROVINCE, nodeId: PROVINCE });
check("coverage reaches 5/5 and is satisfied", coverage1.searchedCount === 5 && coverage1.satisfied === true,
  `${coverage1.searchedCount}/${coverage1.required}`);
check("a non-policy source is classified as 'other' and warns", (() => {
  const r = tools.toolRecordSearchResult({
    provinceId: PROVINCE, nodeId: PROVINCE, query: "همدان", sourceUrl: "https://example.com/x",
    sourceTitle: "other", resultSummary: "fixture", ownershipStatus: "unverified",
  });
  return r.sourceClass === "other" && typeof r.reminder === "string";
})());
check("markdown-wrapped source URL is rejected at record time",
  !!expectThrow(() => tools.toolRecordSearchResult({
    provinceId: PROVINCE, nodeId: PROVINCE, query: "q", sourceUrl: "[https://a.com](https://a.com)",
    sourceTitle: "t", resultSummary: "s", ownershipStatus: "belongs_to_node",
  })));

// ===========================================================================
section("3) Media pipeline — entity-owned set, target 5, thumbnail inside budget");
// ===========================================================================
for (const [i, url] of MEDIA.entries()) {
  tools.toolRecordMediaCandidate({
    provinceId: PROVINCE, nodeId: PROVINCE, imageUrl: url, pageUrl: MEDIA_PAGE,
    license: "CC-BY-SA-4.0", source: "Wikimedia Commons", credit: `Fixture author ${i + 1}`,
    alt: "نمایی از استان همدان", score: 0.9 - i * 0.05,
  });
}
const dup = tools.toolRecordMediaCandidate({
  provinceId: PROVINCE, nodeId: PROVINCE, imageUrl: MEDIA[0], pageUrl: MEDIA_PAGE, license: "CC-BY-SA-4.0",
});
check("record_media_candidate is idempotent per (node,imageUrl)", dup.recorded === false && !!dup.duplicateOf);

const finalized = tools.toolFinalizeMedia({ provinceId: PROVINCE, nodeId: PROVINCE });
check("finalize_media selects exactly target=5 distinct images", finalized.audit.selectedTotal === 5 && finalized.audit.target === 5,
  JSON.stringify(finalized.audit));
check("thumbnail is distinct and counts inside the budget",
  finalized.media.images.length === 4 && !finalized.media.images.some((i) => i.url === finalized.media.thumbnail.url));
check("media.status is 'complete' at target", finalized.mediaStatus === "complete");

// ===========================================================================
section("4) Negative gates — every contract rule must actually reject");
// ===========================================================================
const save = (entity) => tools.toolSaveActiveEntity({ provinceId: PROVINCE, entity, expectedNodeId: PROVINCE });

check("province visit with openingHours → VISIT_FIELD_NOT_ALLOWED",
  codesOf(save(baseEntity({
    media: finalized.media,
    visit: { bestSeasons: ["spring"], bestMonths: [4], openingHours: { alwaysOpen: true } },
  }))).includes("VISIT_FIELD_NOT_ALLOWED"));

check("child ticket cost on the province → COST_CATEGORY_NOT_ALLOWED", (() => {
  const e = baseEntity({ media: finalized.media });
  e.costs.items.push({
    category: "entry", name: "ورودی غار علیصدر", required: true, unit: "per_person",
    budget: { economy: { min: 1, max: 2 }, standard: { min: 2, max: 3 }, comfortable: { min: 3, max: 4 } },
    inflationCategory: "recreation_and_culture", sourceUrl: PRIMARY_SOURCES[0].url,
  });
  return codesOf(save(e)).includes("COST_CATEGORY_NOT_ALLOWED");
})());

check("cost min > max → COST_MIN_GT_MAX", (() => {
  const e = baseEntity({ media: finalized.media });
  e.costs.items[0].budget.economy = { min: 900, max: 100 };
  return codesOf(save(e)).includes("COST_MIN_GT_MAX");
})());

check("child-specific FAQ on the parent → FAQ_CHILD_SCOPE", (() => {
  // register a child node so the ownership check has a real descendant
  tools.toolUpdateNotes({
    provinceId: PROVINCE, operation: "register_node",
    payload: { nodeId: "place-30-901", nodeType: "place", nodeName: "غار علیصدر", parentNodeId: PROVINCE },
  });
  const e = baseEntity({ media: finalized.media });
  e.faq.push({ question: "غار علیصدر چه ساعتی باز است؟", answer: "fixture" });
  return codesOf(save(e)).includes("FAQ_CHILD_SCOPE");
})());

check("prose/route/price inside a checklist → CHECKLIST_ITEM_NOT_CONCRETE", (() => {
  const e = baseEntity({ media: finalized.media });
  e.travelChecklist.personalCar = ["از تهران حدود ۲۰۰ کیلومتر رانندگی کنید و هزینه بلیط را حساب کنید"];
  return codesOf(save(e)).includes("CHECKLIST_ITEM_NOT_CONCRETE");
})());

check("free-text taxonomy value → TAXONOMY_UNKNOWN",
  codesOf(save(baseEntity({ media: finalized.media, activities: ["visit", "آب‌درمانی سنتی"] }))).includes("TAXONOMY_UNKNOWN"));

check("evidence pointing outside sources[] → EVIDENCE_SOURCE_NOT_IN_SOURCES", (() => {
  const e = baseEntity({ media: finalized.media });
  e.evidence[0].sourceUrl = "https://www.kojaro.com/some-other-page/";
  return codesOf(save(e)).includes("EVIDENCE_SOURCE_NOT_IN_SOURCES");
})());

check("unregistered source (never searched) → SOURCE_NOT_REGISTERED", (() => {
  const e = baseEntity({ media: finalized.media });
  const ghost = "https://www.kojaro.com/never-searched/";
  e.sources.push({ title: "ghost", url: ghost, type: "other", accessedAt: TODAY });
  e.evidence.push({ field: "content.history", claim: "fixture", sourceUrl: ghost });
  return codesOf(save(e)).includes("SOURCE_NOT_REGISTERED");
})());

check("promotional superlative without dedicated evidence → BRAND_VOICE_SUPERLATIVE", (() => {
  const e = baseEntity({ media: finalized.media });
  e.content.summary.fa = "زیباترین و بی‌نظیرترین مقصد ایده‌آل ایران با طبیعتی رؤیایی.";
  return codesOf(save(e)).includes("BRAND_VOICE_SUPERLATIVE");
})());

check("zero images before full primary coverage → MEDIA_ZERO_WITHOUT_PRIMARY_COVERAGE", (() => {
  // a fresh node without any recorded search
  tools.toolUpdateNotes({
    provinceId: PROVINCE, operation: "register_node",
    payload: { nodeId: "place-30-902", nodeType: "place", nodeName: "مکان آزمایشی", parentNodeId: PROVINCE },
  });
  const e = baseEntity({ id: "place-30-902", slug: "e2e-zero-media", type: "natural", subType: "mountain" });
  delete e.media;
  const r = tools.toolSaveActiveEntity({ provinceId: PROVINCE, entity: e, expectedNodeId: "place-30-902" });
  return codesOf(r).includes("MEDIA_ZERO_WITHOUT_PRIMARY_COVERAGE");
})());

check("thumbnail repeated inside a multi-image set → MEDIA_THUMBNAIL_DUPLICATED", (() => {
  const e = baseEntity({ media: structuredClone(finalized.media) });
  e.media.images[0] = structuredClone(e.media.thumbnail);
  return codesOf(save(e)).includes("MEDIA_THUMBNAIL_DUPLICATED");
})());

// ===========================================================================
section("5) Positive path — save the province entity");
// ===========================================================================
// The chat layer sometimes renders a URL as [url](url): the save must repair
// it instead of rejecting the entity, and store the raw link.
const entityToSave = baseEntity({ media: finalized.media });
entityToSave.sources[0].url = `[${PRIMARY_SOURCES[0].url}](${PRIMARY_SOURCES[0].url})`;
entityToSave.evidence[0].sourceUrl = `[${PRIMARY_SOURCES[0].url}](${PRIMARY_SOURCES[0].url})`;

const saved = tools.toolSaveActiveEntity({
  provinceId: PROVINCE,
  entity: entityToSave,
  expectedNodeId: PROVINCE,
});
check("save_active_entity accepted", saved.accepted === true, JSON.stringify(saved.errors ?? []));
check("markdown-wrapped URLs are auto-normalized, not rejected", (() => {
  const stored = JSON.parse(fs.readFileSync(path.join(outDir, PROVINCE, "province.json"), "utf8"));
  return stored.sources[0].url === PRIMARY_SOURCES[0].url && stored.evidence[0].sourceUrl === PRIMARY_SOURCES[0].url;
})());
check("stored at the canonical path province.json", saved.path === "province.json", saved.path);
check("file really exists on disk", fs.existsSync(path.join(outDir, PROVINCE, "province.json")));
check("saved media.status === complete", (() => {
  const stored = JSON.parse(fs.readFileSync(path.join(outDir, PROVINCE, "province.json"), "utf8"));
  return stored.media.status === "complete" && stored.media.images.length === 4;
})());

const reusedMedia = expectThrow(() => tools.toolRecordMediaCandidate({
  provinceId: PROVINCE, nodeId: "place-30-901", imageUrl: MEDIA[0], pageUrl: MEDIA_PAGE, license: "CC-BY-SA-4.0",
}));
check("re-using a stored image URL on another Entity → MEDIA_GLOBAL_DUPLICATE",
  !!reusedMedia && reusedMedia.includes("MEDIA_GLOBAL_DUPLICATE"), reusedMedia ?? "(no error thrown)");

check("duplicate id on a second save → DUPLICATE_ID",
  codesOf(save(baseEntity({ media: finalized.media }))).includes("DUPLICATE_ID"));

// ===========================================================================
section("6) Completion contract — counts, DFS order and the province-stage gate");
// ===========================================================================
check("complete_discovery_task without count is rejected",
  !!expectThrow(() => tools.toolUpdateNotes({
    provinceId: PROVINCE, operation: "complete_discovery_task", payload: { nodeId: PROVINCE, track: "provincePlaces" },
  })));

// the two helper place nodes are part of the province stage: close them the
// auditable way (no valid entity data was gathered for them in this run)
for (const nodeId of ["place-30-901", "place-30-902"]) {
  for (const s of PRIMARY_SOURCES) {
    tools.toolRecordSearchResult({
      provinceId: PROVINCE, nodeId, query: `fixture ${nodeId}`, sourceUrl: s.url, sourceTitle: s.title,
      resultSummary: "fixture: no usable entity data", ownershipStatus: "belongs_to_child",
    });
  }
}
tools.toolUpdateNotes({
  provinceId: PROVINCE, operation: "complete_discovery_task", payload: { nodeId: PROVINCE, track: "provincePlaces", count: 2 },
});
tools.toolUpdateNotes({
  provinceId: PROVINCE, operation: "complete_discovery_task", payload: { nodeId: PROVINCE, track: "camping", count: 0 },
});

check("declared count must match the registered nodes", (() => {
  const before = tools.toolUpdateNotes({
    provinceId: PROVINCE, operation: "complete_discovery_task", payload: { nodeId: PROVINCE, track: "provincePlaces", count: 7 },
  });
  const msg = expectThrow(() => tools.toolUpdateNotes({
    provinceId: PROVINCE, operation: "mark_node_complete", payload: { nodeId: PROVINCE },
  }));
  // restore the truthful count
  tools.toolUpdateNotes({
    provinceId: PROVINCE, operation: "complete_discovery_task", payload: { nodeId: PROVINCE, track: "provincePlaces", count: 2 },
  });
  return !!before.updated && !!msg && msg.includes("declared 7");
})());

const nextBefore = tools.toolGetNextResearchNode({ provinceId: PROVINCE });
check("DFS visits province-level places before any county",
  nextBefore.nodeId === "place-30-901" || nextBefore.nodeId === "place-30-902", nextBefore.nodeId);

for (const nodeId of ["place-30-901", "place-30-902"]) {
  tools.toolMarkNodeMediaDeficit({
    provinceId: PROVINCE, nodeId, reason: "fixture: no verifiable entity data for this test node",
    imagesFound: 0, searchesPerformed: ["fixture query A", "fixture query B"],
  });
}

check("out-of-order completion is refused (DFS order violation)",
  !!expectThrow(() => tools.toolUpdateNotes({
    provinceId: PROVINCE, operation: "mark_node_complete", payload: { nodeId: "county-30-1" },
  })));

const completed = tools.toolUpdateNotes({ provinceId: PROVINCE, operation: "mark_node_complete", payload: { nodeId: PROVINCE } });
check("province node marked complete → provinceStageComplete", completed.provinceStageComplete === true);

const afterStage = tools.toolGetNextResearchNode({ provinceId: PROVINCE });
check("workflow pauses with awaitingScopeSelection:true", afterStage.awaitingScopeSelection === true && afterStage.node === null);
check("no county may be completed while awaiting the user's scope choice",
  !!expectThrow(() => tools.toolUpdateNotes({
    provinceId: PROVINCE, operation: "mark_node_complete", payload: { nodeId: "county-30-2" },
  })));

// ===========================================================================
section("7) Definition of Done + validation for the province stage");
// ===========================================================================
const dod = tools.toolCheckDefinitionOfDone({ provinceId: PROVINCE });
check("check_definition_of_done → complete:true", dod.complete === true, JSON.stringify({
  scope: dod.scopeMode, media: dod.incompleteMedia, costs: dod.incompleteCosts,
  evidence: dod.missingEvidence, coverage: dod.missingSourceCoverage, admin: dod.missingAdministrativeNodes,
}));
check("DoD is evaluated against the province stage", dod.scopeMode === "province-stage", dod.scopeMode);

const validated = tools.toolValidateProvince({ provinceId: PROVINCE });
check("validate_province → invalid:0", validated.invalid === 0, JSON.stringify(validated.entities));
check("DoD result is persisted in notes", (() => {
  const notes = fs.readFileSync(path.join(outDir, PROVINCE, "notes.md"), "utf8");
  return notes.includes("PASSED");
})());

// ===========================================================================
section("8) Next scope — lock, isolation and resumability");
// ===========================================================================
const scopeSet = tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: "county-30-5" });
check("set_active_scope locks DFS inside the chosen county",
  scopeSet.activeScopeId === "county-30-5" && scopeSet.nextRequiredNode?.nodeId === "county-30-5");
check("a node outside the active scope cannot be completed",
  !!expectThrow(() => tools.toolUpdateNotes({
    provinceId: PROVINCE, operation: "mark_node_complete", payload: { nodeId: "county-30-1" },
  })));
const dodScoped = tools.toolCheckDefinitionOfDone({ provinceId: PROVINCE });
check("the new scope starts as complete:false (own run)", dodScoped.complete === false && dodScoped.scopeMode === "scope");
check("state survives a fresh read (resume)", (() => {
  const state = JSON.parse(fs.readFileSync(path.join(outDir, PROVINCE, "notes.state.json"), "utf8"));
  return state.activeScopeId === "county-30-5" && state.registry.some((r) => r.id === PROVINCE && r.status === "active");
})());
tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: null });

// ===========================================================================
section("9) Scope resolution — flexible set_active_scope inputs");
// ===========================================================================
check("bare county index '1' → county-30-1",
  tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: "1" }).activeScopeId === "county-30-1");
check("shorthand 'county-6' → county-30-6",
  tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: "county-6" }).activeScopeId === "county-30-6");
check("Persian name لالجین → city-30-6",
  tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: "لالجین" }).activeScopeId === "city-30-6");
check("ملایر (county+city same name) picks the broader county-30-6",
  tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: "ملایر" }).activeScopeId === "county-30-6");
check("ملایر + expectedType:'city' → city-30-20",
  tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: "ملایر", expectedType: "city" }).activeScopeId === "city-30-20");
check("اسدآباد (cross-branch ambiguity) is rejected with candidates", (() => {
  const msg = expectThrow(() => tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: "اسدآباد" }));
  return !!msg && msg.includes("INVALID_INPUT") && msg.includes("candidates=");
})());
check("out-of-range county index '999' is rejected", (() => {
  const msg = expectThrow(() => tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: "999" }));
  return !!msg && msg.includes("INVALID_INPUT");
})());
check("unknown Persian name is rejected", (() => {
  const msg = expectThrow(() => tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: "نام‌ناموجود-e2e" }));
  return !!msg && msg.includes("INVALID_INPUT");
})());

// ===========================================================================
section("10) Scope-aware work queue — list_pending_nodes");
// ===========================================================================
tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: "اسدآباد", expectedType: "county" });
const pendingScoped = tools.toolListPendingNodes({ provinceId: PROVINCE });
check("اسدآباد scope pending = 99 (1 county + 3 cities + 95 villages)",
  pendingScoped.pending === 99 &&
    pendingScoped.pendingByType?.county === 1 &&
    pendingScoped.pendingByType?.city === 3 &&
    pendingScoped.pendingByType?.village === 95,
  JSON.stringify(pendingScoped.pendingByType));
check("scoped queue stays inside the active subtree",
  pendingScoped.activeScopeId === "county-30-1" &&
    pendingScoped.nodes.every((n) => n.nodeId === "county-30-1" || n.parentNodeId === "county-30-1"));
const pendingAll = tools.toolListPendingNodes({ provinceId: PROVINCE, allScopes: true });
check("allScopes:true exposes the full-province unfinished queue",
  pendingAll.allScopes === true && pendingAll.pending > pendingScoped.pending,
  `scoped=${pendingScoped.pending} all=${pendingAll.pending}`);

tools.toolSetActiveScope({ provinceId: PROVINCE, nodeId: null });

// ===========================================================================
console.log("\n" + "─".repeat(72));
if (failures.length === 0) {
  console.log(`E2E PASS — ${passed} runtime assertions green (output: ${outDir})`);
  fs.rmSync(outDir, { recursive: true, force: true });
  process.exit(0);
} else {
  console.log(`E2E FAIL — ${failures.length} failed / ${passed} passed`);
  for (const f of failures) console.log(`   • ${f.name}${f.detail ? `\n     ${f.detail}` : ""}`);
  console.log(`(inspect the run output in ${outDir})`);
  process.exit(1);
}
