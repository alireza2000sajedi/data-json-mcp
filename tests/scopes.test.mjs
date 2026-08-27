import test from "node:test";
import assert from "node:assert/strict";
import { setupEnv, cleanup, clearOutput } from "./helpers.mjs";

const outputDir = setupEnv();

test.beforeEach(() => {
  clearOutput(outputDir);
});

test.after(() => {
  cleanup(outputDir);
});

test("scope registry: deterministic dedicated ids for province-30", async () => {
  const { buildScopeRegistry } = await import("../dist/scopes.js");
  const a = buildScopeRegistry("province-30");
  const b = buildScopeRegistry("province-30");
  assert.deepEqual(a, b, "registry must be fully deterministic");

  assert.equal(a.provinceId, "province-30");
  assert.equal(a.provinceName, "همدان");
  assert.equal(a.source, "input/30.json");
  assert.equal(a.counts.counties, 9);
  assert.equal(a.counts.cities, 31);
  assert.equal(a.counts.villages, 962);

  const famnin = a.tree.find((c) => c.name === "فامنین");
  assert.ok(famnin, "فامنین must be in the tree");
  assert.equal(famnin.id, "county-30-5");
  assert.equal(famnin.cities.length, 1);
  assert.equal(famnin.villages.length, 63);

  // Every unit has a dedicated, unique, pattern-valid id.
  const ids = Object.keys(a.index);
  assert.equal(ids.length, 9 + 31 + 962);
  assert.equal(new Set(ids).size, ids.length, "all scope ids must be unique");
  for (const id of ids) {
    assert.match(id, /^county-30-\d+$|^city-30-\d+$|^village-30-v\d+$/);
  }

  // Hierarchy: villages + cities of a county are parented to that county.
  for (const v of famnin.villages) assert.equal(v.parentId, "county-30-5");
  for (const c of famnin.cities) assert.equal(c.parentId, "county-30-5");

  // Duplicate names (same village name in different counties) get distinct ids.
  const multi = Object.entries(a.indexByName).filter(([, u]) => u.length > 1);
  assert.ok(multi.length > 0, "expected shared village names across counties to map to multiple ids");
  const [name, units] = multi[0];
  assert.ok(units.length >= 2);
  assert.notEqual(units[0].id, units[1].id);
  assert.equal(units[0].name, name);
  assert.equal(units[1].name, name);
});

test("scopes index lists all 31 provinces with county ids", async () => {
  const { listProvinceScopesIndex } = await import("../dist/scopes.js");
  const idx = listProvinceScopesIndex();
  assert.equal(idx.length, 31);
  assert.equal(idx[0].provinceId, "province-1");
  assert.equal(idx[29].provinceId, "province-30");
  assert.equal(idx[29].provinceName, "همدان");
  assert.equal(idx[29].counts.counties, 9);
  assert.equal(idx[29].counties.length, 9);
  assert.equal(idx[29].counties[4].id, "county-30-5");
  assert.equal(idx[29].counties[4].name, "فامنین");
  assert.equal(idx[29].counties[4].villages, 63);
});

test("invalid province ids are rejected", async () => {
  const { buildScopeRegistry } = await import("../dist/scopes.js");
  assert.throws(() => buildScopeRegistry("province-99"), /out of range/);
  assert.throws(() => buildScopeRegistry("province-x"), /Invalid provinceId/);
  assert.throws(() => buildScopeRegistry("county-30-5"), /Invalid provinceId/);
});

test("import_province_scopes registers structure + dedicated ids, no deep research", async () => {
  const { toolImportProvinceScopes } = await import("../dist/tools.js");
  const { readNotes } = await import("../dist/notes.js");
  const { listEntities } = await import("../dist/dataset.js");

  const r = toolImportProvinceScopes({ provinceId: "province-30" });
  assert.equal(r.imported, true);
  assert.equal(r.provinceName, "همدان");
  assert.deepEqual(r.scopeSummary, { counties: 9, cities: 31, villages: 962 });
  assert.equal(r.registeredNodes, 1 + 9 + 31 + 962);
  assert.match(r.note, /Stage 1/);

  const st = readNotes("province-30");
  assert.equal(st.nodes.length, 1 + 9 + 31 + 962);
  assert.equal(st.nodes.filter((n) => n.nodeType === "county").length, 9);
  assert.equal(st.nodes.filter((n) => n.nodeType === "city").length, 31);
  assert.equal(st.nodes.filter((n) => n.nodeType === "village").length, 962);
  assert.equal(listEntities("province-30").length, 0, "structure only — no entity JSON files");

  // Count contract: the reference checklist counts are recorded as complete.
  const task = (nodeId, track) => st.discoveryTasks.find((t) => t.nodeId === nodeId && t.track === track);
  assert.equal(task("province-30", "counties").state, "complete");
  assert.equal(task("province-30", "counties").declaredCount, 9);
  assert.equal(task("county-30-5", "cities").declaredCount, 1);
  assert.equal(task("county-30-5", "villages").declaredCount, 63);
  assert.ok(st.nextStep.includes("Scope A"));
});

test("import_province_scopes is idempotent", async () => {
  const { toolImportProvinceScopes } = await import("../dist/tools.js");
  const { readNotes } = await import("../dist/notes.js");

  toolImportProvinceScopes({ provinceId: "province-30" });
  toolImportProvinceScopes({ provinceId: "province-30" });
  const st = readNotes("province-30");
  assert.equal(st.nodes.length, 1 + 9 + 31 + 962, "no duplicate registrations across calls");
  assert.equal(st.activeScopeId, null);
});

test("set_active_scope locks DFS to the selected scope subtree", async () => {
  const { toolImportProvinceScopes, toolSetActiveScope, toolGetNextResearchNode, toolGetScopeState } = await import("../dist/tools.js");

  toolImportProvinceScopes({ provinceId: "province-30" });

  const s = toolSetActiveScope({ provinceId: "province-30", nodeId: "county-30-5" });
  assert.equal(s.activeScopeId, "county-30-5");
  assert.equal(s.nextRequiredNode.nodeId, "county-30-5", "scope root is the first required node");

  const next = toolGetNextResearchNode({ provinceId: "province-30" });
  assert.equal(next.activeScopeId, "county-30-5");
  assert.equal(next.nodeId, "county-30-5");

  const scopeState = toolGetScopeState({ provinceId: "province-30" });
  assert.equal(scopeState.activeScopeId, "county-30-5");

  // Reset to province-wide mode.
  const r = toolSetActiveScope({ provinceId: "province-30", nodeId: null });
  assert.equal(r.activeScopeId, null);
  assert.equal(toolGetNextResearchNode({ provinceId: "province-30" }).nodeId, "province-30");
});

test("mark_node_complete outside the active scope is rejected", async () => {
  const { toolImportProvinceScopes, toolSetActiveScope, toolUpdateNotes } = await import("../dist/tools.js");

  toolImportProvinceScopes({ provinceId: "province-30" });
  toolSetActiveScope({ provinceId: "province-30", nodeId: "county-30-5" });

  assert.throws(
    () => toolUpdateNotes({ provinceId: "province-30", operation: "mark_node_complete", payload: { nodeId: "county-30-1" } }),
    /SCOPE VIOLATION/,
  );
});

test("set_active_scope requires a registered node id", async () => {
  const { toolImportProvinceScopes, toolSetActiveScope } = await import("../dist/tools.js");
  toolImportProvinceScopes({ provinceId: "province-30" });
  assert.throws(
    () => toolSetActiveScope({ provinceId: "province-30", nodeId: "county-99-1" }),
    /not registered/,
  );
});
