import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setupEnv, cleanup, clearOutput, makeValidPlace, makeVillage, seedProvinceHierarchy, sixChecklist, addPrimarySourceCoverage, mediaItem } from "./helpers.mjs";
import { makeCity } from "./helpers.mjs";

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
  assert.equal(r.path, "county-30-1/place-30-1.json");

  const abs = `${outputDir}/province-30/county-30-1/place-30-1.json`;
  assert.ok(fs.existsSync(abs), `expected file at ${abs}`);
  const stored = JSON.parse(fs.readFileSync(abs, "utf8"));
  assert.equal(stored.status, "active");

  // Registry updated
  const notes = await import("../dist/notes.js");
  const state = notes.readNotes("province-30");
  assert.ok(state.registry.some((x) => x.id === "place-30-1" && x.path === "county-30-1/place-30-1.json"));
});

test("save_active_entity rejects invalid entity without writing any file", async () => {
  const { toolSaveActiveEntity } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const entity = makeValidPlace({ evidence: [] }); // missing evidence
  const r = toolSaveActiveEntity({ provinceId: "province-30", entity, expectedNodeId: entity.id });

  assert.equal(r.accepted, false);
  assert.ok(Array.isArray(r.errors) && r.errors.length > 0);
  assert.equal(fs.existsSync(`${outputDir}/province-30/county-30-1/place-30-1.json`), false);
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
  // staged workflow: after the province stage, work continues inside a selected scope
  state.activeScopeId = "county-30-1";
  addPrimarySourceCoverage(notes, state, "county-30-1", 5);
  writeNotes(state);

  const { nextRequiredNode } = await import("../dist/graph.js");
  const next = nextRequiredNode("province-30");
  assert.ok(next, "expected a next node");
  assert.equal(next.nodeId, "county-30-1", "county (not city) is the first unfinished node in DFS");

  // Now complete the county; next should be the city.
  state = readNotes("province-30");
  upsertRegistry(state, { id: "county-30-1", slug: "famnin-county", path: "county-30-1/county.json", status: "active", name: "فامنین", type: "other", subType: "county" });
  for (const track of ["districts", "ruralDistricts", "cities", "villages", "countyPlaces", "camping"]) completeDiscoveryTask(state, "county-30-1", track);
  addPrimarySourceCoverage(notes, state, "county-30-1", 5);
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
  // Every county query must embed the county name (fa or en phrasing), never the province-level phrasing.
  for (const q of r.queries) {
    assert.ok(q.query.includes("فامنین"), `query must be county-scoped: ${q.query}`);
    assert.ok(!q.query.includes("استان همدان"), `query must not leak the province phrasing: ${q.query}`);
  }
  assert.ok(
    r.queries.filter((q) => q.query.includes("شهرستان فامنین")).length >= 5,
    "the Persian discovery queries must keep the full county-scoped phrasing",
  );

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

  // complete each discovery track (declaring the count discovered: 0 children)
  for (const track of ["counties", "provincePlaces", "camping"]) {
    const r = toolUpdateNotes({ provinceId: "province-30", operation: "complete_discovery_task", payload: { nodeId: "province-30", track, count: 0 } });
    assert.equal(r.updated, true);
  }

  // satisfy the mandatory primary-source coverage for the province node
  {
    const notes = await import("../dist/notes.js");
    let st = notes.readNotes("province-30");
    addPrimarySourceCoverage(notes, st, "province-30", 5);
    notes.writeNotes(st);
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

test("canonicalPath nests by administrative hierarchy (village/place at any level)", async () => {
  const notes = await import("../dist/notes.js");
  const { canonicalPath } = await import("../dist/dataset.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "province-30", nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "research_required" });
  notes.upsertNode(state, { nodeId: "county-30-1", nodeType: "county", canonicalName: "فامنین", parentNodeId: "province-30", state: "research_required" });
  notes.upsertNode(state, { nodeId: "city-30-1", nodeType: "city", canonicalName: "فامنین", parentNodeId: "county-30-1", state: "research_required" });
  notes.upsertNode(state, { nodeId: "village-30-v1", nodeType: "village", canonicalName: "روستای فامنین", parentNodeId: "city-30-1", state: "research_required" });
  notes.upsertNode(state, { nodeId: "village-30-v2", nodeType: "village", canonicalName: "روستای دیگر", parentNodeId: "county-30-1", state: "research_required" });
  notes.upsertNode(state, { nodeId: "place-30-1", nodeType: "place", canonicalName: "مسجد", parentNodeId: "county-30-1", state: "research_required" });
  notes.upsertNode(state, { nodeId: "place-30-2", nodeType: "place", canonicalName: "مکان شهر", parentNodeId: "city-30-1", state: "research_required" });
  notes.upsertNode(state, { nodeId: "place-30-3", nodeType: "place", canonicalName: "مکان روستا", parentNodeId: "village-30-v1", state: "research_required" });
  notes.upsertNode(state, { nodeId: "place-30-4", nodeType: "place", canonicalName: "مکان استانی", parentNodeId: "province-30", state: "research_required" });
  notes.writeNotes(state);

  const mk = (id, type, subType) => ({ id, slug: id, type, subType, status: "active", name: { fa: "x" } });

  assert.equal(canonicalPath("province-30", state, mk("province-30", "other", "province"), "province-30").relPath, "province.json");
  assert.equal(canonicalPath("province-30", state, mk("county-30-1", "other", "county"), "county-30-1").relPath, "county-30-1/county.json");
  assert.equal(canonicalPath("province-30", state, mk("city-30-1", "city"), "city-30-1").relPath, "county-30-1/city-30-1/city.json");
  assert.equal(canonicalPath("province-30", state, mk("village-30-v1", "village"), "village-30-v1").relPath, "county-30-1/city-30-1/village-30-v1/village.json");
  assert.equal(canonicalPath("province-30", state, mk("village-30-v2", "village"), "village-30-v2").relPath, "county-30-1/village-30-v2/village.json");
  assert.equal(canonicalPath("province-30", state, mk("place-30-1", "historical", "mosque"), "place-30-1").relPath, "county-30-1/place-30-1.json");
  assert.equal(canonicalPath("province-30", state, mk("place-30-2", "historical", "mosque"), "place-30-2").relPath, "county-30-1/city-30-1/place-30-2.json");
  assert.equal(canonicalPath("province-30", state, mk("place-30-3", "historical", "mosque"), "place-30-3").relPath, "county-30-1/city-30-1/village-30-v1/place-30-3.json");
  assert.equal(canonicalPath("province-30", state, mk("place-30-4", "historical", "mosque"), "place-30-4").relPath, "place-30-4.json");
});

test("save_active_entity auto-normalizes markdown URLs before saving", async () => {
  const { toolSaveActiveEntity } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const raw = "https://example.com/famnin";
  const entity = makeValidPlace({
    sources: [{ title: "Example", url: `[${raw}](${raw})`, type: "official", accessedAt: "2026-08-24" }],
  });
  const r = toolSaveActiveEntity({ provinceId: "province-30", entity, expectedNodeId: entity.id });
  assert.equal(r.accepted, true, JSON.stringify(r.errors));
  const { findEntityById } = await import("../dist/dataset.js");
  const stored = findEntityById("province-30", entity.id);
  assert.equal(stored.entity.sources[0].url, raw, "saved source URL must be the raw link, not markdown");
});

test("save_entities batch-saves multiple entities in one call", async () => {
  const { toolSaveEntities } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "place-30-2", nodeType: "place", canonicalName: "مکان دیگر", parentNodeId: "county-30-1", state: "research_required" });
  notes.writeNotes(state);

  const a = makeValidPlace();
  const b = makeValidPlace({ id: "place-30-2", slug: "other-place", name: { fa: "مکان دیگر" } });
  const r = toolSaveEntities({
    provinceId: "province-30",
    entities: [
      { entity: a, expectedNodeId: a.id },
      { entity: b, expectedNodeId: b.id },
    ],
  });
  assert.equal(r.submitted, 2);
  assert.equal(r.accepted, 2, JSON.stringify(r.results));
  assert.equal(r.results[0].path, "county-30-1/place-30-1.json");
  assert.equal(r.results[1].path, "county-30-1/place-30-2.json");
});

test("discover_subtree returns node-scoped queries for a whole subtree at once", async () => {
  const { toolDiscoverSubtree } = await import("../dist/tools.js");
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "province-30", nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "research_required" });
  notes.upsertNode(state, { nodeId: "county-30-1", nodeType: "county", canonicalName: "فامنین", parentNodeId: "province-30", state: "research_required" });
  notes.upsertNode(state, { nodeId: "city-30-1", nodeType: "city", canonicalName: "فامنین", parentNodeId: "county-30-1", state: "research_required" });
  notes.writeNotes(state);

  const r = toolDiscoverSubtree({ provinceId: "province-30" });
  assert.equal(r.nodeCount, 3);
  const county = r.nodes.find((n) => n.nodeType === "county");
  assert.ok(county.queries.some((q) => q.query.includes("شهرستان فامنین")));
  const city = r.nodes.find((n) => n.nodeType === "city");
  assert.equal(city.context.county, "فامنین");

  const sub = toolDiscoverSubtree({ provinceId: "province-30", nodeId: "county-30-1" });
  assert.ok(sub.nodes.every((n) => n.nodeId !== "province-30"), "subtree must exclude the province");
});

test("validate_province does not flag a stored entity as a duplicate of itself", async () => {
  const { toolValidateProvince, toolSaveActiveEntity } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const entity = makeValidPlace();
  const r = toolSaveActiveEntity({ provinceId: "province-30", entity, expectedNodeId: entity.id });
  assert.equal(r.accepted, true);

  const report = toolValidateProvince({ provinceId: "province-30" });
  assert.equal(report.total, 1, JSON.stringify(report));
  assert.equal(report.valid, 1, JSON.stringify(report));
  assert.equal(report.invalid, 0, JSON.stringify(report.entities));
});

test("list_pending_nodes returns the full incomplete work queue", async () => {
  const { toolListPendingNodes } = await import("../dist/tools.js");
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "province-30", nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "complete" });
  notes.upsertRegistry(state, { id: "province-30", slug: "hamedan-province", path: "province.json", status: "active", name: "همدان", type: "other", subType: "province" });
  for (const track of ["counties", "provincePlaces", "camping"]) notes.completeDiscoveryTask(state, "province-30", track);
  notes.upsertNode(state, { nodeId: "county-30-1", nodeType: "county", canonicalName: "فامنین", parentNodeId: "province-30", state: "research_required" });
  notes.upsertNode(state, { nodeId: "city-30-1", nodeType: "city", canonicalName: "فامنین", parentNodeId: "county-30-1", state: "research_required" });
  addPrimarySourceCoverage(notes, state, "province-30", 5);
  notes.writeNotes(state);

  const r = toolListPendingNodes({ provinceId: "province-30" });
  assert.equal(r.total, 3);
  assert.equal(r.pending, 2, JSON.stringify(r.nodes));
  assert.equal(r.nodes[0].nodeId, "county-30-1", "DFS order: county before city");
  assert.equal(r.nodes[1].nodeId, "city-30-1");
});

test("traversal visits province-level places before counties", async () => {
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "province-30", nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "complete" });
  notes.upsertRegistry(state, { id: "province-30", slug: "p", path: "province.json", status: "active", name: "همدان", type: "other", subType: "province" });
  for (const t of ["counties", "provincePlaces", "camping"]) notes.completeDiscoveryTask(state, "province-30", t);
  notes.upsertNode(state, { nodeId: "place-30-1", nodeType: "place", canonicalName: "مکان استانی", parentNodeId: "province-30", state: "research_required" });
  notes.upsertNode(state, { nodeId: "county-30-1", nodeType: "county", canonicalName: "فامنین", parentNodeId: "province-30", state: "research_required" });
  addPrimarySourceCoverage(notes, state, "province-30", 5);
  notes.writeNotes(state);

  const { nextRequiredNode } = await import("../dist/graph.js");
  const next = nextRequiredNode("province-30");
  assert.equal(next.nodeId, "place-30-1", "province-level place must come before county");
});

test("reserve_entity_id persists a pending reservation and finalizes on save", async () => {
  const { toolReserveEntityId, toolSaveActiveEntity } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const r1 = toolReserveEntityId({ provinceId: "province-30", entityKind: "place", preferredSlug: "new-place" });
  const r2 = toolReserveEntityId({ provinceId: "province-30", entityKind: "place", preferredSlug: "new-place" });
  assert.notEqual(r1.id, r2.id, "second reserve must return a different id");
  assert.notEqual(r1.slug, r2.slug, "second reserve must return a different slug");

  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  assert.ok(state.registry.some((x) => x.id === r1.id && x.status === "pending"), "reservation must be persisted as pending");

  // Saving with the reserved id/slug must not hit DUPLICATE (pending is excluded).
  notes.upsertNode(state, { nodeId: r1.id, nodeType: "place", canonicalName: "مکان جدید", parentNodeId: "county-30-1", state: "research_required" });
  notes.writeNotes(state);
  const entity = makeValidPlace({ id: r1.id, slug: r1.slug });
  const save = toolSaveActiveEntity({ provinceId: "province-30", entity, expectedNodeId: r1.id });
  assert.equal(save.accepted, true, JSON.stringify(save.errors));

  const state2 = notes.readNotes("province-30");
  assert.equal(state2.registry.find((x) => x.id === r1.id).status, "active", "pending must be promoted to active");
});

test("update_notes rejects add_source_matrix_entry (record_search_result is the only owner)", async () => {
  const { toolUpdateNotes } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  assert.throws(
    () => toolUpdateNotes({ provinceId: "province-30", operation: "add_source_matrix_entry", payload: { nodeId: "place-30-1", sourceUrl: "https://example.com/x", ownershipStatus: "belongs_to_child" } }),
    /Unknown notes operation/,
  );
});

test("link_entities enforces semantic relation rules", async () => {
  const { toolSaveActiveEntity, toolLinkEntities } = await import("../dist/tools.js");
  await seedProvinceHierarchy();
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "place-30-2", nodeType: "place", canonicalName: "مکان دیگر", parentNodeId: "county-30-1", state: "research_required" });
  notes.writeNotes(state);

  const a = makeValidPlace();
  const b = makeValidPlace({ id: "place-30-2", slug: "other-place", name: { fa: "مکان دیگر" } });
  assert.equal(toolSaveActiveEntity({ provinceId: "province-30", entity: a, expectedNodeId: a.id }).accepted, true);
  assert.equal(toolSaveActiveEntity({ provinceId: "province-30", entity: b, expectedNodeId: b.id }).accepted, true);

  // sibling nearby is fine
  assert.equal(toolLinkEntities({ provinceId: "province-30", fromId: a.id, toId: b.id, relationType: "nearby" }).linked, true);

  // gateway_city requires a city target
  assert.throws(() => toolLinkEntities({ provinceId: "province-30", fromId: a.id, toId: b.id, relationType: "gateway_city" }), /city/);

  // parent requires a real administrative ancestor
  assert.throws(() => toolLinkEntities({ provinceId: "province-30", fromId: a.id, toId: b.id, relationType: "parent" }), /ancestor/);
});

test("DoD refuses completion when a declared county count is unmet", async () => {
  const notes = await import("../dist/notes.js");
  const { toolUpdateNotes } = await import("../dist/tools.js");
  const { getScopeState } = await import("../dist/graph.js");

  // province registered, declares 10 counties but only 1 county node exists.
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "province-30", nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "complete" });
  notes.upsertRegistry(state, { id: "province-30", slug: "p", path: "province.json", status: "active", name: "همدان", type: "other", subType: "province" });
  notes.completeDiscoveryTask(state, "province-30", "counties", 10);
  notes.completeDiscoveryTask(state, "province-30", "provincePlaces", 0);
  notes.completeDiscoveryTask(state, "province-30", "camping", 0);
  notes.upsertNode(state, { nodeId: "county-30-1", nodeType: "county", canonicalName: "کبودرآهنگ", parentNodeId: "province-30", state: "complete" });
  notes.writeNotes(state);

  const scope = getScopeState("province-30");
  assert.equal(scope.definitionOfDone, false, "province must not be done when declared 10 counties but 1 registered");
  assert.ok(
    scope.blockingReasons.some((r) => /counties: declared 10 but 1 registered/.test(r)),
    JSON.stringify(scope.blockingReasons),
  );
});

/**
 * Seed: province complete, county complete, a poor-media city (Teymurlu-like)
 * with its discovery tracks closed, and a village sibling behind it in DFS.
 * Returns the notes module.
 */
async function seedDeficitScenario() {
  const notes = await import("../dist/notes.js");
  const { readNotes, writeNotes, upsertNode, upsertRegistry, completeDiscoveryTask } = notes;

  let state = readNotes("province-30");
  state.activeScopeId = "county-30-1"; // staged workflow: work happens inside the selected county scope
  upsertNode(state, { nodeId: "province-30", nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "complete" });
  upsertRegistry(state, { id: "province-30", slug: "prov", path: "province.json", status: "active", name: "همدان", type: "other", subType: "province" });
  completeDiscoveryTask(state, "province-30", "counties", 1);
  completeDiscoveryTask(state, "province-30", "provincePlaces", 0);
  completeDiscoveryTask(state, "province-30", "camping", 0);

  upsertNode(state, { nodeId: "county-30-1", nodeType: "county", canonicalName: "فامنین", parentNodeId: "province-30", state: "complete" });
  upsertRegistry(state, { id: "county-30-1", slug: "county", path: "county-30-1/county.json", status: "active", name: "فامنین", type: "other", subType: "county" });
  // 1 district + 1 rural district as structural nodes (cities/villages parent to the county).
  upsertNode(state, { nodeId: "district-30-1", nodeType: "district", canonicalName: "بخش مرکزی", parentNodeId: "county-30-1", state: "complete" });
  upsertNode(state, { nodeId: "ruralDistrict-30-1", nodeType: "ruralDistrict", canonicalName: "دهستان فامنین", parentNodeId: "county-30-1", state: "complete" });
  // The poor-media city (Teymurlu-like) and the village sibling, registered before counts are declared.
  upsertNode(state, { nodeId: "city-30-2", nodeType: "city", canonicalName: "تیمورلو", parentNodeId: "county-30-1", state: "research_required" });
  upsertNode(state, { nodeId: "village-30-v1", nodeType: "village", canonicalName: "روستای آزمون", parentNodeId: "county-30-1", state: "research_required" });
  completeDiscoveryTask(state, "district-30-1", "ruralDistricts", 0);
  completeDiscoveryTask(state, "district-30-1", "cities", 0);
  completeDiscoveryTask(state, "district-30-1", "villages", 0);
  completeDiscoveryTask(state, "district-30-1", "places", 0);
  completeDiscoveryTask(state, "ruralDistrict-30-1", "villages", 0);
  completeDiscoveryTask(state, "ruralDistrict-30-1", "places", 0);
  for (const t of ["districts", "ruralDistricts", "cities", "villages", "countyPlaces", "camping"]) completeDiscoveryTask(state, "county-30-1", t, t === "districts" || t === "ruralDistricts" || t === "cities" || t === "villages" ? 1 : 0);

  // city with no entity, discovery closed (0 places, 0 camping)
  completeDiscoveryTask(state, "city-30-2", "places", 0);
  completeDiscoveryTask(state, "city-30-2", "camping", 0);
  // mandatory primary-source coverage: 5/5 for province/county/city, 2 for the village
  addPrimarySourceCoverage(notes, state, "province-30", 5);
  addPrimarySourceCoverage(notes, state, "county-30-1", 5);
  addPrimarySourceCoverage(notes, state, "city-30-2", 5);
  addPrimarySourceCoverage(notes, state, "village-30-v1", 5);
  writeNotes(state);
  return notes;
}

test("mark_node_media_deficit closes a poor-media node without JSON and advances DFS (§9)", async () => {
  const { toolMarkNodeMediaDeficit, toolListPendingNodes, toolCheckDefinitionOfDone } = await import("../dist/tools.js");
  await seedDeficitScenario();

  const r = toolMarkNodeMediaDeficit({
    provinceId: "province-30",
    nodeId: "city-30-2",
    reason: "پس از جستجوی کامل فقط ۳ تصویر آزاد منتسب به خود شهر پیدا شد؛ بقیه نتایج متعلق به ممقان و روستاهای مجاور است.",
    imagesFound: 3,
    searchesPerformed: [
      "Wikimedia Commons category search: Teymurlu",
      "Commons geosearch within 3km",
      "Flickr CC search",
      "Wiki Loves Monuments Iran list",
    ],
  });
  assert.equal(r.recorded, true, JSON.stringify(r));
  assert.equal(r.nodeState, "media_deficit");

  // No JSON file was written for the city.
  const { listEntities } = await import("../dist/dataset.js");
  const ids = listEntities("province-30").map((e) => e.id);
  assert.ok(!ids.includes("city-30-2"), "no fabricated entity file");

  // DFS moved past the city to the next sibling.
  const pending = toolListPendingNodes({ provinceId: "province-30" });
  assert.equal(pending.pending, 1, JSON.stringify(pending.nodes));
  assert.equal(pending.nodes[0].nodeId, "village-30-v1", "DFS must skip the closed city and reach the village");
  const cityRow = pending.nodes.find(() => false); // closed node is not in pending list
  assert.equal(cityRow, undefined);

  // The disposition is visible and auditable in scope state.
  const { getScopeState } = await import("../dist/graph.js");
  const scope = getScopeState("province-30");
  assert.equal(scope.mediaDeficitNodes.length, 1);
  assert.equal(scope.mediaDeficitNodes[0].nodeId, "city-30-2");
  assert.equal(scope.mediaDeficitNodes[0].imagesFound, 3);
  assert.ok(!scope.blockingReasons.some((b) => b.includes("city-30-2")), "closed deficit node must not block DoD");

  // get_node_context exposes the disposition.
  const { toolGetNodeContext } = await import("../dist/tools.js");
  const ctx = toolGetNodeContext({ provinceId: "province-30", nodeId: "city-30-2" });
  assert.equal(ctx.mediaDeficit, true);
  assert.equal(ctx.mediaDeficitDetail.imagesFound, 3);
});

test("DoD passes with media-deficit nodes reported transparently", async () => {
  const { toolMarkNodeMediaDeficit, toolCheckDefinitionOfDone } = await import("../dist/tools.js");
  await seedDeficitScenario();

  // Close the poor-media city via §9.
  toolMarkNodeMediaDeficit({
    provinceId: "province-30",
    nodeId: "city-30-2",
    reason: "فقط ۲ تصویر آزاد منتسب.",
    imagesFound: 2,
    searchesPerformed: ["Commons category", "Commons geosearch"],
  });

  // Close the remaining village the same way (it has discovery tracks open too).
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.completeDiscoveryTask(state, "village-30-v1", "places", 0);
  notes.completeDiscoveryTask(state, "village-30-v1", "camping", 0);
  notes.writeNotes(state);

  // village is not the required node until city-30-2 is closed; now it is.
  const r2 = toolMarkNodeMediaDeficit({
    provinceId: "province-30",
    nodeId: "village-30-v1",
    reason: "روستای دورافتاده بدون تصویر آزاد منتسب.",
    imagesFound: 0,
    searchesPerformed: ["Commons geosearch", "Flickr CC"],
  });
  assert.equal(r2.recorded, true);

  const dod = toolCheckDefinitionOfDone({ provinceId: "province-30" });
  assert.equal(dod.complete, true, JSON.stringify(dod));
  assert.equal(dod.mediaDeficitNodes.length, 2, "deficit nodes are reported, not hidden");
});

test("mark_node_media_deficit guards: usable candidates, audit range, open discovery, DFS order", async () => {
  const { toolMarkNodeMediaDeficit, toolUpdateNotes, toolRecordMediaCandidate } = await import("../dist/tools.js");
  await seedDeficitScenario();

  // imagesFound is an audit number 0..20 — 21 is rejected.
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "city-30-2", reason: "x", imagesFound: 21, searchesPerformed: ["a", "b"] }),
    /imagesFound must be an integer between 0 and 20/,
  );
  // Too few searches.
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "city-30-2", reason: "x", imagesFound: 0, searchesPerformed: [] }),
    /searchesPerformed/,
  );
  // Out of DFS order (village while the city is the required node).
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "village-30-v1", reason: "x", imagesFound: 0, searchesPerformed: ["a", "b"] }),
    /DFS ORDER VIOLATION/,
  );
  // Node with open discovery tracks cannot be marked (reopen the city's tracks).
  const notesReopen = await import("../dist/notes.js");
  let rs = notesReopen.readNotes("province-30");
  rs.discoveryTasks = rs.discoveryTasks.filter((t) => t.nodeId !== "city-30-2");
  notesReopen.writeNotes(rs);
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "city-30-2", reason: "x", imagesFound: 0, searchesPerformed: ["a", "b"] }),
    /discovery/,
  );
  // A node WITH usable media candidates must be saved, never closed file-less.
  toolRecordMediaCandidate({
    provinceId: "province-30",
    nodeId: "city-30-2",
    imageUrl: "https://cdn.kojaro.com/img/teymurlu-1.jpg",
    pageUrl: "https://www.kojaro.com/teymurlu/",
    license: "all-rights-reserved",
  });
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "city-30-2", reason: "x", imagesFound: 0, searchesPerformed: ["a", "b"] }),
    /HAS 1 usable media candidate/,
  );

  // Drop the candidate (as if it were later judged unusable), close discovery, then succeed.
  rs = notesReopen.readNotes("province-30");
  rs.mediaCandidates = rs.mediaCandidates.filter((c) => c.nodeId !== "city-30-2");
  notesReopen.writeNotes(rs);
  for (const track of ["places", "camping"]) {
    toolUpdateNotes({ provinceId: "province-30", operation: "complete_discovery_task", payload: { nodeId: "city-30-2", track, count: 0 } });
  }
  const ok = toolMarkNodeMediaDeficit({
    provinceId: "province-30",
    nodeId: "city-30-2",
    reason: "هیچ دادهٔ معتبری برای این شهر جمع نشد",
    imagesFound: 0,
    searchesPerformed: ["site:kojaro.com تیمورلو", "Google Images: عکس تیمورلو"],
  });
  assert.equal(ok.recorded, true);

  // Double-marking is refused.
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "city-30-2", reason: "x", imagesFound: 0, searchesPerformed: ["a", "b"] }),
    /already has a recorded file-less disposition/,
  );
});

test("saving an active entity auto-resolves a recorded media-deficit disposition", async () => {
  const { toolMarkNodeMediaDeficit, toolSaveActiveEntity, toolGetNodeContext, toolRecordSearchResult } = await import("../dist/tools.js");
  await seedDeficitScenario();

  toolMarkNodeMediaDeficit({
    provinceId: "province-30",
    nodeId: "city-30-2",
    reason: "فقط ۳ تصویر.",
    imagesFound: 3,
    searchesPerformed: ["Commons category", "Commons geosearch"],
  });
  const notes = await import("../dist/notes.js");
  assert.equal(notes.findMediaDeficit(notes.readNotes("province-30"), "city-30-2").state, "recorded");

  // Later, the agent finds 10+ attributable images and saves the real city entity.
  const { makeCity } = await import("./helpers.mjs");
  // Register the entity id under the county so its canonical path resolves.
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { ...notes.findNode(state, "city-30-2"), state: "in_progress" });
  notes.writeNotes(state);
  // Record the evidence source against this node (quality gate requirement).
  toolRecordSearchResult({
    provinceId: "province-30",
    nodeId: "city-30-2",
    query: "تیمورلو",
    sourceUrl: "https://example.com/famnin",
    sourceTitle: "Example",
    resultSummary: "منبع آزمون برای شهر تیمورلو",
    ownershipStatus: "belongs_to_node",
  });
  const city = makeCity({
    id: "city-30-2",
    slug: "teymurlu-city",
    name: { fa: "تیمورلو" },
    location: {
      country: "Iran",
      province: "همدان",
      county: "فامنین",
      city: "تیمورلو",
      coordinates: { latitude: 37.8, longitude: 45.9 },
      address: { full: "شهر تیمورلو" },
    },
  });
  const save = toolSaveActiveEntity({ provinceId: "province-30", entity: city, expectedNodeId: city.id });
  assert.equal(save.accepted, true, JSON.stringify(save.errors ?? save));

  // The open disposition is gone (promoted); the audit record remains as resolved.
  const s4 = notes.readNotes("province-30");
  assert.equal(notes.findMediaDeficit(s4, "city-30-2"), undefined, "no OPEN deficit after promotion");
  const audit = s4.mediaDeficits.find((d) => d.nodeId === "city-30-2");
  assert.equal(audit.state, "resolved");
  assert.equal(audit.outcome, "promoted_to_active");
  const node = notes.findNode(s4, "city-30-2");
  assert.equal(node.state, "complete");
  const ctx = toolGetNodeContext({ provinceId: "province-30", nodeId: "city-30-2" });
  assert.equal(ctx.mediaDeficit, false);
});

test("DoD is scope-aware: a finished county scope is complete while sibling counties stay pending", async () => {
  const { toolSetActiveScope, toolMarkNodeMediaDeficit, toolCheckDefinitionOfDone } = await import("../dist/tools.js");
  await seedDeficitScenario();

  // A second, untouched county in the same province (pending for its own run).
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "county-30-2", nodeType: "county", canonicalName: "شهرستان دیگر", parentNodeId: "province-30", state: "research_required" });
  notes.writeNotes(state);

  // Lock the run to county-30-1 and finish its remaining nodes via §9.
  toolSetActiveScope({ provinceId: "province-30", nodeId: "county-30-1" });
  toolMarkNodeMediaDeficit({
    provinceId: "province-30",
    nodeId: "city-30-2",
    reason: "کمتر از ۵ تصویر قابل‌انتساب پس از Commons و جستجوی تصویر وب.",
    imagesFound: 3,
    searchesPerformed: ["Wikimedia Commons category: Teymurlu", "Google Images: عکس تیمورلو"],
  });
  state = notes.readNotes("province-30");
  notes.completeDiscoveryTask(state, "village-30-v1", "places", 0);
  notes.completeDiscoveryTask(state, "village-30-v1", "camping", 0);
  notes.writeNotes(state);
  toolMarkNodeMediaDeficit({
    provinceId: "province-30",
    nodeId: "village-30-v1",
    reason: "روستای دورافتاده با کمتر از ۳ تصویر قابل‌انتساب.",
    imagesFound: 1,
    searchesPerformed: ["Wikimedia Commons geosearch", "Google Images: عکس روستا"],
  });

  // Scope-aware DoD: the county scope is COMPLETE although county-30-2 (and the
  // province node) are still pending province-wide.
  const dod = toolCheckDefinitionOfDone({ provinceId: "province-30" });
  assert.equal(dod.scopeId, "county-30-1");
  assert.equal(dod.complete, true, JSON.stringify(dod));
  assert.equal(dod.mediaDeficitNodes.length, 2);

  // Province-wide view (no active scope) is NOT complete — sibling county pending.
  toolSetActiveScope({ provinceId: "province-30", nodeId: null });
  const dodWide = toolCheckDefinitionOfDone({ provinceId: "province-30" });
  assert.equal(dodWide.complete, false, "province-wide DoD must stay incomplete while a sibling county is pending");
  assert.equal(dodWide.scopeId, null);
});

test("media policy contract: target 10 (village/camping 3) is a goal not a minimum; selection = min(usable, target)", async () => {
  const { MEDIA_POLICY, mediaPolicyFor, mediaStatusFor } = await import("../dist/media.js");
  for (const t of ["province", "county", "city", "place"]) {
    assert.deepEqual(mediaPolicyFor(t), { target: 10, minUsable: 1, max: 20 }, `${t} policy`);
  }
  for (const t of ["village", "camping"]) {
    assert.deepEqual(mediaPolicyFor(t), { target: 3, minUsable: 1, max: 20 }, `${t} policy`);
  }
  assert.equal(MEDIA_POLICY.camping.target, 3, "final contract: camping target is 3");
  assert.equal(mediaStatusFor("place", 10), "complete");
  assert.equal(mediaStatusFor("place", 4), "partial");
  assert.equal(mediaStatusFor("place", 0), "unavailable");
  assert.equal(mediaStatusFor("village", 3), "complete");
  assert.equal(mediaStatusFor("village", 2), "partial");
  assert.equal(mediaStatusFor("camping", 3), "complete");
});

test("discover_node generates image/media queries for every entity node type", async () => {
  const { buildDiscoveryQueries } = await import("../dist/discovery.js");
  const cases = [
    ["province", "آذربایجان شرقی"],
    ["county", "آذرشهر"],
    ["city", "تبریز"],
    ["village", "خاصلو"],
  ];
  for (const [type, name] of cases) {
    const queries = buildDiscoveryQueries(type, name, { province: "آذربایجان شرقی" });
    const mediaQueries = queries.filter((q) => q.purpose.startsWith("media:"));
    assert.ok(mediaQueries.length >= 2, `${type} must generate image-search queries`);
    assert.ok(mediaQueries.some((q) => /عکس|تصاویر/.test(q.query)), `${type} must have a Persian image query`);
    assert.ok(mediaQueries.some((q) => /photo|photos/i.test(q.query)), `${type} must have an English image query`);
  }
  const placeQueries = buildDiscoveryQueries("place", "تپه مصلی", { province: "آذربایجان شرقی", county: "آذرشهر", city: "آذرشهر" });
  assert.ok(placeQueries.some((q) => q.purpose.startsWith("media:") && q.query.includes("عکس")));
  const campQueries = buildDiscoveryQueries("camping", "کمپ ائل میدانی", { province: "آذربایجان شرقی", county: "آذرشهر" });
  assert.ok(campQueries.some((q) => q.purpose.startsWith("media:")));
});

test("complete_discovery_task rejects a missing count for countable tracks", async () => {
  const { toolUpdateNotes } = await import("../dist/tools.js");
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "province-30", nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "research_required" });
  notes.writeNotes(state);
  assert.throws(
    () => toolUpdateNotes({ provinceId: "province-30", operation: "complete_discovery_task", payload: { nodeId: "province-30", track: "counties" } }),
    /count/,
  );
});
test("best-effort media: 1 image saves as partial, 0 images saves without media (unavailable)", async () => {
  const { toolSaveActiveEntity } = await import("../dist/tools.js");
  const { findEntityById } = await import("../dist/dataset.js");
  await seedProvinceHierarchy();

  // A POI with a single image (thumbnail reuses it) → saved, status "partial".
  const one = makeValidPlace({
    media: { thumbnail: mediaItem(0), images: [mediaItem(0)] },
  });
  const r1 = toolSaveActiveEntity({ provinceId: "province-30", entity: one, expectedNodeId: one.id });
  assert.equal(r1.accepted, true, JSON.stringify(r1.errors ?? r1));
  const stored1 = findEntityById("province-30", one.id);
  assert.equal(stored1.entity.media.status, "partial");

  // A POI with NO media at all → REJECTED while primary coverage is incomplete
  // ("nothing found" is only credible after all five primaries were attempted).
  const none = makeValidPlace({ id: "place-30-9", slug: "no-media-place", name: { fa: "مکان بدون عکس" } });
  delete none.media;
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "place-30-9", nodeType: "place", canonicalName: "مکان بدون عکس", parentNodeId: "county-30-1", state: "research_required" });
  notes.addSourceMatrixEntry(state, { id: "src-9", nodeId: "place-30-9", query: "q", sourceUrl: "https://example.com/famnin", sourceTitle: "Example", resultSummary: "s", ownershipStatus: "belongs_to_node" });
  notes.writeNotes(state);
  const rReject = toolSaveActiveEntity({ provinceId: "province-30", entity: none, expectedNodeId: none.id });
  assert.equal(rReject.accepted, false);
  assert.ok(rReject.errors.some((e) => e.code === "MEDIA_ZERO_WITHOUT_PRIMARY_COVERAGE"), JSON.stringify(rReject.errors));
  assert.equal(fs.existsSync(`${outputDir}/province-30/county-30-1/place-30-9.json`), false, "no file written on coverage rejection");

  // After recording attempts on all five primaries → accepted with status "unavailable".
  state = notes.readNotes("province-30");
  addPrimarySourceCoverage(notes, state, "place-30-9", 5);
  notes.writeNotes(state);
  const r2 = toolSaveActiveEntity({ provinceId: "province-30", entity: none, expectedNodeId: none.id });
  assert.equal(r2.accepted, true, JSON.stringify(r2.errors ?? r2));
  const stored2 = findEntityById("province-30", none.id);
  assert.equal(stored2.entity.media.status, "unavailable");
  assert.ok(!Array.isArray(stored2.entity.media.images) || stored2.entity.media.images.length === 0);
});

test("media candidate pipeline: record candidates, finalize picks the best set", async () => {
  const { toolRecordMediaCandidate, toolFinalizeMedia, toolSaveActiveEntity } = await import("../dist/tools.js");
  const { findEntityById } = await import("../dist/dataset.js");
  await seedProvinceHierarchy();

  const mk = (i, domain, score) => ({
    provinceId: "province-30",
    nodeId: "place-30-1",
    imageUrl: `https://cdn.${domain}/img-${i}.jpg`,
    pageUrl: `https://www.${domain}/article-${i}`,
    license: i === 3 ? "CC-BY-SA-4.0" : "all-rights-reserved",
    source: domain,
    credit: `عکاس ${i}`,
    alt: `نما ${i}`,
    score,
  });
  // 4 candidates + 1 duplicate URL → 4 distinct
  assert.equal(toolRecordMediaCandidate(mk(1, "kojaro.com", 0.9)).recorded, true);
  assert.equal(toolRecordMediaCandidate(mk(2, "jabama.com", 0.4)).recorded, true);
  assert.equal(toolRecordMediaCandidate(mk(3, "commons.wikimedia.org", 0.5)).recorded, true);
  assert.equal(toolRecordMediaCandidate(mk(4, "lastsecond.ir", 0.7)).recorded, true);
  const dup = toolRecordMediaCandidate(mk(1, "kojaro.com", 0.9));
  assert.equal(dup.recorded, false, "duplicate image URL must be idempotent");

  const fin = toolFinalizeMedia({ provinceId: "province-30", nodeId: "place-30-1" });
  assert.equal(fin.audit.candidates, 4, "duplicate image URL is not stored twice");
  assert.equal(fin.audit.deduplicated, 4);
  assert.equal(fin.audit.usable, 4);
  assert.equal(fin.audit.selectedTotal, 4, "selection = min(usable, target)");
  assert.equal(fin.audit.target, 10);
  assert.equal(fin.mediaStatus, "partial", "4 distinct images < target 10 for a place");
  assert.ok(fin.media.thumbnail, "thumbnail picked from the best candidate");
  assert.equal(fin.media.images.length, 3);

  // Attach and save: accepted with status partial.
  const entity = makeValidPlace({ media: fin.media });
  const save = toolSaveActiveEntity({ provinceId: "province-30", entity, expectedNodeId: entity.id });
  assert.equal(save.accepted, true, JSON.stringify(save.errors ?? save));
  const stored = findEntityById("province-30", entity.id);
  assert.equal(stored.entity.media.status, "partial");

  // Over-target village: 18 usable candidates → only the best 3 are stored (never more than target).
  const notes = await import("../dist/notes.js");
  let vstate = notes.readNotes("province-30");
  notes.upsertNode(vstate, { nodeId: "village-30-v5", nodeType: "village", canonicalName: "روستای پُرعکس", parentNodeId: "county-30-1", state: "research_required" });
  notes.writeNotes(vstate);
  for (let i = 0; i < 18; i++) {
    toolRecordMediaCandidate({
      provinceId: "province-30",
      nodeId: "village-30-v5",
      imageUrl: `https://cdn.kojaro.com/v-${i}.jpg`,
      pageUrl: `https://www.kojaro.com/v-${i}`,
      license: "all-rights-reserved",
      score: i / 18,
    });
  }
  const vfin = toolFinalizeMedia({ provinceId: "province-30", nodeId: "village-30-v5" });
  assert.equal(vfin.audit.usable, 18);
  assert.equal(vfin.audit.selectedTotal, 3, "village with 18 usable images stores only the best 3");
  assert.equal(vfin.media.images.length, 2, "thumbnail counts inside the 3-image budget");
  assert.equal(vfin.mediaStatus, "complete");
  const urls = new Set([vfin.media.thumbnail.url, ...vfin.media.images.map((m) => m.url)]);
  assert.equal(urls.size, 3, "all stored URLs distinct");
});

test("media candidates on primary domains count toward source coverage", async () => {
  const { toolRecordMediaCandidate, toolGetSourceCoverage } = await import("../dist/tools.js");
  const notes = await import("../dist/notes.js");
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "village-30-v9", nodeType: "village", canonicalName: "روستای آزمون", parentNodeId: "county-30-1", state: "research_required" });
  notes.writeNotes(state);

  // Final contract: ALL five primaries are required for EVERY entity node (village included);
  // image candidates discovered on primary pages count as searching that source.
  const primaries = ["kojaro.com", "jabama.com", "alibaba.ir", "lastsecond.ir", "flytoday.ir"];
  primaries.forEach((domain, i) => {
    toolRecordMediaCandidate({ provinceId: "province-30", nodeId: "village-30-v9", imageUrl: `https://cdn.${domain}/a${i}.jpg`, pageUrl: `https://www.${domain}/a${i}`, license: "all-rights-reserved" });
  });

  const cov = toolGetSourceCoverage({ provinceId: "province-30", nodeId: "village-30-v9" });
  assert.equal(cov.required, 5);
  assert.equal(cov.searchedCount, 5);
  assert.equal(cov.satisfied, true);
});

test("record_search_result classifies primary/fallback/other against the source policy", async () => {
  const { toolRecordSearchResult } = await import("../dist/tools.js");
  await seedProvinceHierarchy();

  const p1 = toolRecordSearchResult({ provinceId: "province-30", nodeId: "place-30-1", query: "q", sourceUrl: "https://www.kojaro.com/x", sourceTitle: "Kojaro", resultSummary: "s", ownershipStatus: "belongs_to_node" });
  assert.equal(p1.sourceClass, "primary");
  assert.equal(p1.reminder, undefined);

  const p2 = toolRecordSearchResult({ provinceId: "province-30", nodeId: "place-30-1", query: "q", sourceUrl: "https://fa.wikipedia.org/wiki/X", sourceTitle: "Wiki", resultSummary: "s", ownershipStatus: "belongs_to_node" });
  assert.equal(p2.sourceClass, "fallback");

  const p3 = toolRecordSearchResult({ provinceId: "province-30", nodeId: "place-30-1", query: "q", sourceUrl: "https://randomblog.ir/x", sourceTitle: "Blog", resultSummary: "s", ownershipStatus: "belongs_to_node" });
  assert.equal(p3.sourceClass, "other");
  assert.match(p3.reminder, /NOT in the project source policy/);
});

test("resolve_scope_name resolves Persian names without asking the user for ids", async () => {
  const { toolResolveScopeName } = await import("../dist/tools.js");

  // Province name without provinceId.
  const prov = toolResolveScopeName({ name: "همدان" });
  assert.equal(prov.resolved, true);
  assert.equal(prov.provinceId, "province-30");

  // County name inside a province.
  const county = toolResolveScopeName({ provinceId: "province-1", name: "آذرشهر", expectedType: "county" });
  assert.equal(county.resolved, true);
  assert.equal(county.matches[0].nodeId, "county-1-1");

  // Ambiguous duplicate village name → ambiguous with candidate list (only case to ask the user).
  const reg = (await import("../dist/scopes.js")).buildScopeRegistry("province-30");
  const byNameType = {};
  for (const u of Object.values(reg.index)) (byNameType[`${u.type}:${u.name}`] ??= []).push(u);
  const dup = Object.values(byNameType).find((v) => v.length > 1 && v[0].type === "village");
  const dupName = dup[0].name;
  const amb = toolResolveScopeName({ provinceId: "province-30", name: dupName, expectedType: "village" });
  assert.equal(amb.resolved, false);
  assert.equal(amb.ambiguous, true);
  assert.ok(amb.matches.length >= 2);

  // Unknown name → suggestions path, resolved:false.
  const none = toolResolveScopeName({ provinceId: "province-1", name: "شهرستان ناموجود", expectedType: "county" });
  assert.equal(none.resolved, false);
});

test("province stage gate: after the province is complete, DFS waits for the user's scope selection", async () => {
  const notes = await import("../dist/notes.js");
  const { toolGetNextResearchNode, toolUpdateNotes, toolSetActiveScope } = await import("../dist/tools.js");

  // Province stage complete (entity + discovery + coverage), one county pending.
  let state = notes.readNotes("province-30");
  notes.upsertNode(state, { nodeId: "province-30", nodeType: "province", canonicalName: "همدان", parentNodeId: null, state: "complete" });
  notes.upsertRegistry(state, { id: "province-30", slug: "p", path: "province.json", status: "active", name: "همدان", type: "other", subType: "province" });
  for (const t of ["counties", "provincePlaces", "camping"]) notes.completeDiscoveryTask(state, "province-30", t, 1);
  notes.upsertNode(state, { nodeId: "county-30-1", nodeType: "county", canonicalName: "فامنین", parentNodeId: "province-30", state: "research_required" });
  addPrimarySourceCoverage(notes, state, "province-30", 5);
  notes.writeNotes(state);

  // get_next_research_node → awaitingScopeSelection
  const next = toolGetNextResearchNode({ provinceId: "province-30" });
  assert.equal(next.awaitingScopeSelection, true);
  assert.equal(next.node, null);

  // Completing a county without selecting a scope is rejected.
  assert.throws(
    () => toolUpdateNotes({ provinceId: "province-30", operation: "mark_node_complete", payload: { nodeId: "county-30-1" } }),
    /AWAITING SCOPE SELECTION/,
  );

  // After the user picks the scope, DFS unlocks on the county.
  toolSetActiveScope({ provinceId: "province-30", nodeId: "county-30-1" });
  const next2 = toolGetNextResearchNode({ provinceId: "province-30" });
  assert.equal(next2.awaitingScopeSelection, undefined);
  assert.equal(next2.nodeId, "county-30-1");
});
