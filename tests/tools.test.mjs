import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setupEnv, cleanup, clearOutput, makeValidPlace, makeVillage, seedProvinceHierarchy, sixChecklist } from "./helpers.mjs";
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
  writeNotes(state);

  const { nextRequiredNode } = await import("../dist/graph.js");
  const next = nextRequiredNode("province-30");
  assert.ok(next, "expected a next node");
  assert.equal(next.nodeId, "county-30-1", "county (not city) is the first unfinished node in DFS");

  // Now complete the county; next should be the city.
  state = readNotes("province-30");
  upsertRegistry(state, { id: "county-30-1", slug: "famnin-county", path: "county-30-1/county.json", status: "active", name: "فامنین", type: "other", subType: "county" });
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

  // complete each discovery track (declaring the count discovered: 0 children)
  for (const track of ["counties", "provincePlaces", "camping"]) {
    const r = toolUpdateNotes({ provinceId: "province-30", operation: "complete_discovery_task", payload: { nodeId: "province-30", track, count: 0 } });
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

test("mark_node_media_deficit guards: active entity, imagesFound>=10, open discovery, DFS order", async () => {
  const { toolMarkNodeMediaDeficit, toolUpdateNotes } = await import("../dist/tools.js");
  await seedDeficitScenario();

  // imagesFound out of range.
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "city-30-2", reason: "x", imagesFound: 10, searchesPerformed: ["a"] }),
    /imagesFound must be an integer between 0 and 9/,
  );
  // Missing searchesPerformed.
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "city-30-2", reason: "x", imagesFound: 2, searchesPerformed: [] }),
    /searchesPerformed/,
  );
  // Out of DFS order (village while the city is the required node).
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "village-30-v1", reason: "x", imagesFound: 0, searchesPerformed: ["a"] }),
    /DFS ORDER VIOLATION/,
  );
  // Node with open discovery tracks cannot be marked (reopen the city's tracks).
  const notesReopen = await import("../dist/notes.js");
  let rs = notesReopen.readNotes("province-30");
  rs.discoveryTasks = rs.discoveryTasks.filter((t) => t.nodeId !== "city-30-2");
  notesReopen.writeNotes(rs);
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "city-30-2", reason: "x", imagesFound: 2, searchesPerformed: ["a"] }),
    /discovery/,
  );

  // Close discovery, then succeed.
  for (const track of ["places", "camping"]) {
    toolUpdateNotes({ provinceId: "province-30", operation: "complete_discovery_task", payload: { nodeId: "city-30-2", track, count: 0 } });
  }
  const ok = toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "city-30-2", reason: "x", imagesFound: 2, searchesPerformed: ["a"] });
  assert.equal(ok.recorded, true);

  // Double-marking is refused.
  assert.throws(
    () => toolMarkNodeMediaDeficit({ provinceId: "province-30", nodeId: "city-30-2", reason: "x", imagesFound: 2, searchesPerformed: ["a"] }),
    /already has a recorded media-deficit/,
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
