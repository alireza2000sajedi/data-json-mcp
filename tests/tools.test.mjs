import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setupEnv, cleanup, clearOutput, makeValidPlace, makeVillage, seedProvinceHierarchy, sixChecklist } from "./helpers.mjs";

const outputDir = setupEnv();

test.beforeEach(() => {
  clearOutput(outputDir);
});

test.after(() => {
  cleanup(outputDir);
});

test("create_candidate writes no JSON file", async () => {
  const { toolCreateCandidate } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const r = toolCreateCandidate({
    provinceId: "province-30",
    nodeId: "place-30-2",
    name: "کمپ ناشناخته",
    entityKind: "camping",
    query: "کمپینگ فامنین",
    sourceUrls: ["https://example.com/camp"],
    reason: "نیاز به تحقیق بیشتر",
    blockingRequirements: ["coordinates", "source"],
  });
  assert.equal(r.jsonCreated, false);
  assert.equal(r.storedIn, "notes.md");

  const { listEntities } = await import("../dist/dataset.js");
  assert.equal(listEntities("province-30").length, 0, "no JSON entity file should exist");

  const notes = await import("../dist/notes.js");
  const state = notes.readNotes("province-30");
  assert.ok(state.candidates.some((c) => c.id === r.candidateId && c.state === "open"));
});

test("save_active_entity stores a valid entity at its canonical path", async () => {
  const { toolSaveActiveEntity } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const entity = makeValidPlace();
  const r = toolSaveActiveEntity({ provinceId: "province-30", entity, expectedNodeId: entity.id });

  assert.equal(r.accepted, true, JSON.stringify(r.errors ?? r));
  assert.equal(r.path, "counties/county-30-1/places/place-30-1.json");

  const abs = `${outputDir}/province-30/counties/county-30-1/places/place-30-1.json`;
  assert.ok(fs.existsSync(abs), `expected file at ${abs}`);
  const stored = JSON.parse(fs.readFileSync(abs, "utf8"));
  assert.equal(stored.status, "active");

  // Registry updated
  const notes = await import("../dist/notes.js");
  const state = notes.readNotes("province-30");
  assert.ok(state.registry.some((x) => x.id === "place-30-1" && x.path === "counties/county-30-1/places/place-30-1.json"));
});

test("save_active_entity rejects invalid entity without writing any file", async () => {
  const { toolSaveActiveEntity } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const entity = makeValidPlace({ evidence: [] }); // missing evidence
  const r = toolSaveActiveEntity({ provinceId: "province-30", entity, expectedNodeId: entity.id });

  assert.equal(r.accepted, false);
  assert.ok(Array.isArray(r.errors) && r.errors.length > 0);
  assert.equal(fs.existsSync(`${outputDir}/province-30/counties/county-30-1/places/place-30-1.json`), false);
});

test("next node returns first unfinished node in depth-first order", async () => {
  const notes = await import("../dist/notes.js");
  const { readNotes, writeNotes, upsertNode, addDiscoveryTask, completeDiscoveryTask, upsertRegistry } = notes;

  // province-30 complete (registry active + discovery complete)
  let state = readNotes("province-30");
  upsertNode(state, { nodeId: "province-30", nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "complete" });
  upsertRegistry(state, { id: "province-30", slug: "hamedan-province", path: "province.json", status: "active", name: "همدان", type: "other", subType: "province" });
  for (const track of ["counties", "provincePlaces", "camping"]) completeDiscoveryTask(state, "province-30", track);

  // county incomplete (no entity, no discovery)
  upsertNode(state, { nodeId: "county-30-1", nodeType: "county", canonicalName: "فامنین", parentNodeId: "province-30", state: "research_required" });
  // a city under the county (also incomplete)
  upsertNode(state, { nodeId: "city-30-1", nodeType: "city", canonicalName: "فامنین", parentNodeId: "county-30-1", state: "research_required" });
  writeNotes(state);

  const { nextRequiredNode } = await import("../dist/graph.js");
  const next = nextRequiredNode("province-30");
  assert.ok(next, "expected a next node");
  assert.equal(next.nodeId, "county-30-1", "county (not city) is the first unfinished node in DFS");

  // Now complete the county; next should be the city.
  state = readNotes("province-30");
  upsertRegistry(state, { id: "county-30-1", slug: "famnin-county", path: "counties/county-30-1/county.json", status: "active", name: "فامنین", type: "other", subType: "county" });
  for (const track of ["districts", "ruralDistricts", "cities", "villages", "countyPlaces", "camping"]) completeDiscoveryTask(state, "county-30-1", track);
  writeNotes(state);

  const next2 = nextRequiredNode("province-30");
  assert.ok(next2, "expected a next node");
  assert.equal(next2.nodeId, "city-30-1");
});

test("link_entities creates relation and mirrors nearby bidirectionally", async () => {
  const { toolSaveActiveEntity, toolLinkEntities } = await import("../dist/tools.js");
  await seedProvinceHierarchy();

  const a = makeValidPlace();
  const b = makeValidPlace({ id: "place-30-2", slug: "other-place", name: { fa: "مکان دیگر" } });
  assert.equal(toolSaveActiveEntity({ provinceId: "province-30", entity: a, expectedNodeId: a.id }).accepted, true);

  // register the second place under the same county node so it has a canonical parent
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "place-30-2", nodeType: "place", canonicalName: "مکان دیگر", parentNodeId: "county-30-1", state: "research_required" });
  notes.writeNotes(state);

  assert.equal(toolSaveActiveEntity({ provinceId: "province-30", entity: b, expectedNodeId: b.id }).accepted, true);

  const link = toolLinkEntities({ provinceId: "province-30", fromId: a.id, toId: b.id, relationType: "nearby", distanceKm: 12 });
  assert.equal(link.linked, true);

  const { findEntityById } = await import("../dist/dataset.js");
  const a2 = findEntityById("province-30", a.id);
  const b2 = findEntityById("province-30", b.id);
  assert.ok(a2.entity.relations.some((r) => r.placeId === b.id && r.relationType === "nearby"));
  assert.ok(b2.entity.relations.some((r) => r.placeId === a.id && r.relationType === "nearby"), "nearby must be mirrored");
});

test("check_definition_of_done reports incomplete state", async () => {
  const { toolCheckDefinitionOfDone } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const r = toolCheckDefinitionOfDone({ provinceId: "province-30" });
  assert.equal(r.complete, false);
  assert.ok(r.missingAdministrativeNodes.includes("village"));
  assert.ok(Array.isArray(r.nextAction) === false || typeof r.nextAction === "string" || r.nextAction === null);
});

test("discover_node generates node-scoped queries (no network, no cross-node leakage)", async () => {
  const { toolDiscoverNode } = await import("../dist/tools.js");
  const r = toolDiscoverNode({ provinceId: "province-30", nodeType: "county", canonicalName: "فامنین" });
  assert.equal(r.nodeType, "county");
  assert.ok(r.queries.length > 0);
  // Every county query must embed the county name, never the province-level phrasing.
  for (const q of r.queries) {
    assert.ok(q.query.includes("شهرستان فامنین"), `query must be county-scoped: ${q.query}`);
  }

  // POI queries must carry geographic context.
  const poi = toolDiscoverNode({
    provinceId: "province-30",
    nodeType: "place",
    canonicalName: "مسجد جامع",
    context: { province: "همدان", county: "فامنین", city: "فامنین" },
  });
  for (const q of poi.queries) {
    assert.ok(!/^مسجد جامع$/.test(q.query), `POI query must not be a bare name: ${q.query}`);
  }
});

test("complete_discovery_task unblocks mark_node_complete and definition of done", async () => {
  const { toolUpdateNotes } = await import("../dist/tools.js");
  const notes = await import("../dist/notes.js");
  const { readNotes, writeNotes, upsertNode, upsertRegistry } = notes;

  // province-30 with entity active, discovery tasks all open
  let state = readNotes("province-30");
  upsertNode(state, { nodeId: "province-30", nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "research_required" });
  upsertRegistry(state, { id: "province-30", slug: "hamedan-province", path: "province.json", status: "active", name: "همدان", type: "other", subType: "province" });
  for (const track of ["counties", "provincePlaces", "camping"]) {
    notes.addDiscoveryTask(state, "province-30", track);
  }
  writeNotes(state);

  // mark_node_complete should be refused while discovery tracks are open
  assert.throws(() => toolUpdateNotes({ provinceId: "province-30", operation: "mark_node_complete", payload: { nodeId: "province-30" } }));

  // complete each discovery track
  for (const track of ["counties", "provincePlaces", "camping"]) {
    const r = toolUpdateNotes({ provinceId: "province-30", operation: "complete_discovery_task", payload: { nodeId: "province-30", track } });
    assert.equal(r.updated, true);
  }

  // now mark_node_complete succeeds
  const r2 = toolUpdateNotes({ provinceId: "province-30", operation: "mark_node_complete", payload: { nodeId: "province-30" } });
  assert.equal(r2.updated, true);

  const { getScopeState } = await import("../dist/graph.js");
  const scope = getScopeState("province-30");
  assert.equal(scope.definitionOfDone, true);
});

test("validate_province reports markdown URL errors in stored entities", async () => {
  const { toolValidateProvince, toolSaveActiveEntity } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const entity = makeValidPlace();
  const r = toolSaveActiveEntity({ provinceId: "province-30", entity, expectedNodeId: entity.id });
  assert.equal(r.accepted, true);

  // Rewrite the stored file with a markdown URL (simulating an agent that bypassed the gate).
  const fs = await import("node:fs");
  const { listEntities } = await import("../dist/dataset.js");
  const stored = listEntities("province-30")[0];
  const bad = JSON.parse(fs.readFileSync(stored.path, "utf8"));
  bad.sources[0].url = `[${bad.sources[0].url}](${bad.sources[0].url})`;
  fs.writeFileSync(stored.path, JSON.stringify(bad, null, 2));

  const report = toolValidateProvince({ provinceId: "province-30" });
  assert.equal(report.invalid, 1, JSON.stringify(report.entities));
  assert.ok(report.entities[0].errors.some((e) => e.code === "URL_NOT_RAW_HTTPS"), JSON.stringify(report.entities[0].errors.map((e) => e.code)));
});

test("village entity requires full six-category checklist", async () => {
  const { validateEntity } = await import("../dist/quality-gate.js");
  await seedProvinceHierarchy();
  const v = makeVillage();
  delete v.travelChecklist.bus; // one of the six categories missing
  const r = validateEntity(v, { provinceId: "province-30", expectedNodeId: v.id });
  assert.equal(r.accepted, false);
  assert.ok(r.errors.some((e) => e.code === "CHECKLIST_CATEGORY_MISSING"), JSON.stringify(r.errors.map((e) => e.code)));
});
