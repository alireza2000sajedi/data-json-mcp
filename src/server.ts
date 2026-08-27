import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerResources } from "./resources.js";
import {
  toolImportProvinceScopes,
  toolSetActiveScope,
  toolGetScopeState,
  toolGetNextResearchNode,
  toolGetNodeContext,
  toolFindExistingEntity,
  toolReserveEntityId,
  toolRecordSearchResult,
  toolCreateCandidate,
  toolResolveCandidate,
  toolMarkNodeMediaDeficit,
  toolSaveActiveEntity,
  toolLinkEntities,
  toolUpdateNotes,
  toolCheckDefinitionOfDone,
  toolDiscoverNode,
  toolValidateProvince,
  toolSaveEntities,
  toolDiscoverSubtree,
  toolListPendingNodes,
} from "./tools.js";

export function createServer(): McpServer {
  const server = new McpServer({ name: "planro-mcp", version: "0.1.0" });

  registerResources(server);

  const register = (name: string, description: string, inputSchema: z.ZodRawShape, handler: (args: any) => unknown) => {
    server.registerTool(name, { title: name, description, inputSchema }, async (args) => {
      try {
        const result = handler(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: (e as Error).message }, null, 2) }],
        };
      }
    });
  };

  register(
    "import_province_scopes",
    "Scope A (Province Discovery): derive the full administrative scope list of a province from the reference checklist input/{n}.json and register every county/city/village with a DEDICATED deterministic id (county-{p}-{n}, city-{p}-{n}, village-{p}-v{n}). Structure + ids only — no deep research, no POIs, no entity files. Then STOP and wait for the user's scope selection.",
    { provinceId: z.string().min(1) },
    toolImportProvinceScopes,
  );

  register(
    "set_active_scope",
    "Stage 2 (User Selection): lock the run to ONE scope subtree by its dedicated id (or null to reset to province-wide). DFS order, next-node and completion are then restricted to that scope only; everything else stays pending for separate runs.",
    { provinceId: z.string().min(1), nodeId: z.string().min(1).nullable() },
    toolSetActiveScope,
  );

  register(
    "get_scope_state",
    "Return the full scope state for a province: active scope, open candidates, open conflicts, definition of done, and next node.",
    { provinceId: z.string().min(1) },
    toolGetScopeState,
  );

  register(
    "get_next_research_node",
    "Return the first unfinished node in depth-first administrative traversal. When done:true, returns a reminder to run DoD checks before final report.",
    { provinceId: z.string().min(1) },
    toolGetNextResearchNode,
  );

  register(
    "get_node_context",
    "Return administrative context for a node (path, alternative names, relations, discovery tracks).",
    { provinceId: z.string().min(1), nodeId: z.string().min(1) },
    toolGetNodeContext,
  );

  register(
    "find_existing_entity",
    "Look up existing entities to prevent duplicates before creating a new one.",
    {
      provinceId: z.string().min(1),
      name: z.string().min(1),
      alternativeNames: z.array(z.string()).optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      administrativePath: z.array(z.string()).optional(),
    },
    toolFindExistingEntity,
  );

  register(
    "reserve_entity_id",
    "Reserve a unique id and slug for a new entity, checking the registry and all JSON files.",
    { provinceId: z.string().min(1), entityKind: z.string().min(1), preferredSlug: z.string().min(1) },
    toolReserveEntityId,
  );

  register(
    "record_search_result",
    "Record a search result and its ownership status in the source matrix (notes only).",
    {
      provinceId: z.string().min(1),
      nodeId: z.string().min(1),
      query: z.string().min(1),
      sourceUrl: z.string().min(1),
      sourceTitle: z.string().min(1),
      resultSummary: z.string().min(1),
      ownershipStatus: z.enum(["belongs_to_node", "belongs_to_parent", "belongs_to_child", "nearby_only", "unverified", "rejected"]),
      discoveredNames: z.array(z.string()).optional(),
    },
    toolRecordSearchResult,
  );

  register(
    "create_candidate",
    "Record an unfinished lead as a candidate in notes.md (never writes a JSON file).",
    {
      provinceId: z.string().min(1),
      nodeId: z.string().min(1),
      name: z.string().min(1),
      entityKind: z.string().min(1),
      query: z.string().min(1),
      sourceUrls: z.array(z.string()),
      reason: z.string().min(1),
      blockingRequirements: z.array(z.string()).optional(),
    },
    toolCreateCandidate,
  );

  register(
    "resolve_candidate",
    "Resolve an open candidate with an outcome.",
    { provinceId: z.string().min(1), candidateId: z.string().min(1), outcome: z.enum(["promoted_to_active", "not_found_after_research", "duplicate_of_entity", "out_of_scope", "needs_more_research"]) },
    toolResolveCandidate,
  );

  register(
    "mark_node_media_deficit",
    "§9 disposition: close the CURRENT required entity node WITHOUT a JSON file when an exhaustive search — BOTH free-license archives (Wikimedia Commons category/geosearch, Flickr CC…) AND general web image search (Google/Bing Images, Persian tourism sites, news agencies) — found fewer attributable images than this node type's minimum. Minimums: village/place/camping 3, city/county 5, province 10 (max 20). Requires imagesFound (0 … minimum−1), reason, and searchesPerformed with ≥2 entries (at least one web image search). All discovery tracks must be complete and no open candidates/conflicts remain. The node counts as done for DFS/DoD; saving a real active entity for it later auto-resolves the disposition.",
    {
      provinceId: z.string().min(1),
      nodeId: z.string().min(1),
      reason: z.string().min(1),
      imagesFound: z.number().int().min(0),
      searchesPerformed: z.array(z.string().min(1)).min(2),
    },
    toolMarkNodeMediaDeficit,
  );

  register(
    "save_active_entity",
    "Validate and save an active entity at its canonical path (all-or-nothing quality gate). Media bar: thumbnail + at least 3 distinct attributable images for village/place/camping, 5 for city/county, 10 for province (max 20). Credited web images (license all-rights-reserved) are acceptable — a free license is NOT required; always try web image search before giving up.",
    { provinceId: z.string().min(1), entity: z.record(z.any()), expectedNodeId: z.string().min(1) },
    toolSaveActiveEntity,
  );

  register(
    "link_entities",
    "Create a validated relation between two existing entities, updating both files.",
    {
      provinceId: z.string().min(1),
      fromId: z.string().min(1),
      toId: z.string().min(1),
      relationType: z.string().min(1),
      distanceKm: z.number().optional(),
      travelTimeMinutes: z.number().int().optional(),
      note: z.string().optional(),
    },
    toolLinkEntities,
  );

  register(
    "update_notes",
    "Perform a structured, traceable update to notes.md (never a free-form overwrite).",
    { provinceId: z.string().min(1), operation: z.string().min(1), payload: z.record(z.any()).optional() },
    toolUpdateNotes,
  );

  register(
    "check_definition_of_done",
    "Check whether the scope meets its Definition of Done. Scope-aware: when a scope is active (set_active_scope), only that scope's subtree counts — a finished county/village/POI scope reports complete:true while other scopes stay pending for their own runs. Result is persisted to notes.md DoD section. MUST be run (returning complete:true) together with validate_province (returning invalid:0) before producing the final report of the current scope.",
    { provinceId: z.string().min(1) },
    toolCheckDefinitionOfDone,
  );

  register(
    "discover_node",
    "Generate node-scoped discovery query strings (query generator only — never performs the search). Includes media/image queries (fa+en): run them with web image search (Google/Bing Images) and Wikimedia Commons to collect the node's attributable images.",
    {
      provinceId: z.string().min(1),
      nodeType: z.enum(["province", "county", "district", "ruralDistrict", "city", "village", "place", "camping"]),
      canonicalName: z.string().min(1),
      context: z
        .object({
          province: z.string().optional(),
          county: z.string().optional(),
          district: z.string().optional(),
          ruralDistrict: z.string().optional(),
          city: z.string().optional(),
          village: z.string().optional(),
        })
        .optional(),
    },
    toolDiscoverNode,
  );

  register(
    "validate_province",
    "Re-validate every stored entity in a province and report structured errors. Result is persisted to notes.md DoD section. MUST be run (returning invalid:0) together with check_definition_of_done (returning complete:true) before producing the final report.",
    { provinceId: z.string().min(1) },
    toolValidateProvince,
  );

  register(
    "save_entities",
    "Batch-save many entities in a single call (speed: one round-trip instead of N). Order matters — put parents before children so relations resolve. Each entity is URL-normalized, validated, and written independently; per-entity results are returned.",
    {
      provinceId: z.string().min(1),
      entities: z
        .array(z.object({ entity: z.record(z.unknown()), expectedNodeId: z.string().min(1) }))
        .min(1),
    },
    toolSaveEntities,
  );

  register(
    "discover_subtree",
    "Generate node-scoped discovery queries for every node in a subtree (or the whole province) at once, so searches can be run in parallel. Query generator only — never performs the search.",
    { provinceId: z.string().min(1), nodeId: z.string().min(1).optional() },
    toolDiscoverSubtree,
  );

  register(
    "list_pending_nodes",
    "Return the full work queue: every incomplete node in depth-first order. When pending:0, returns a reminder to run DoD checks before final report.",
    { provinceId: z.string().min(1) },
    toolListPendingNodes,
  );

  return server;
}
