import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerResources } from "./resources.js";
import { assertProvinceId } from "./config.js";
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
  toolRecordMediaCandidate,
  toolFinalizeMedia,
  toolGetSourceCoverage,
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
  const server = new McpServer({ name: "planro-mcp", version: "0.2.0" });

  registerResources(server);

  const register = (name: string, description: string, inputSchema: z.ZodRawShape, handler: (args: any) => unknown) => {
    server.registerTool(name, { title: name, description, inputSchema }, async (args) => {
      try {
        // Prompt contract: the agent may pass the raw numeric province id
        // (`30`); every tool works on the canonical `province-30`.
        const normalized =
          args && typeof (args as any).provinceId === "string"
            ? { ...args, provinceId: assertProvinceId((args as any).provinceId) }
            : args;
        const result = handler(normalized);
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
    "Province Stage, step 1: derive the full administrative scope list of a province from the reference checklist input/{n}.json and register every county/city/village with a DEDICATED deterministic id (county-{p}-{n}, city-{p}-{n}, village-{p}-v{n}). Structure + ids only here — then CONTINUE with the PROVINCE STAGE: full deep research of the province node itself (entity + province-level places + camping + Entity-owned media from the 5 primary sources), mark it complete, and only then STOP and ask the user for the next county/city/village.",
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
    "Return the full scope state for a province: effective scope (selected scope or province stage), open candidates, open conflicts, definition of done, and next node.",
    { provinceId: z.string().min(1) },
    toolGetScopeState,
  );

  register(
    "get_next_research_node",
    "Return the first unfinished node in depth-first administrative traversal. When awaitingScopeSelection:true the province stage is complete: STOP and wait for an explicit scope choice (map the Persian name to its id via planro://scopes/{provinceId}), then call set_active_scope. When done:true, run the DoD checks before the final report.",
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
    "§9 LAST-RESORT disposition: close the CURRENT required entity node WITHOUT a JSON file. Under the Entity-owned media policy a lack of images is NOT a reason (1..target-1 images → save with media.status 'partial'; 0 images → save WITHOUT media, status 'unavailable'). Use ONLY when no valid entity data at all could be gathered. Refuses when usable media candidates exist. Requires reason, searchesPerformed (≥2) and closed discovery/candidates/conflicts + primary-source coverage.",
    {
      provinceId: z.string().min(1),
      nodeId: z.string().min(1),
      reason: z.string().min(1),
      imagesFound: z.number().int().min(0).max(20),
      searchesPerformed: z.array(z.string().min(1)).min(2),
    },
    toolMarkNodeMediaDeficit,
  );

  register(
    "record_media_candidate",
    "Best-effort media pipeline step 1 (§9): record EVERY attributable image you find for a node — nothing is discarded for being below target. imageUrl = direct raw HTTPS file URL; pageUrl = the page hosting/licensing it; license from the schema enum (all-rights-reserved is fine for credited web images); optional score 0..1. Media discovery never counts toward fact-source coverage; only record_search_result does.",
    {
      provinceId: z.string().min(1),
      nodeId: z.string().min(1),
      imageUrl: z.string().min(1),
      pageUrl: z.string().min(1),
      license: z.string().min(1),
      source: z.string().optional(),
      credit: z.string().optional(),
      alt: z.string().optional(),
      caption: z.string().optional(),
      score: z.number().min(0).max(1).optional(),
    },
    toolRecordMediaCandidate,
  );

  register(
    "finalize_media",
    "Best-effort media pipeline step 2 (§9): deduplicate the node's media candidates by URL, drop invalid licenses/URLs, rank (score, free-license and primary-source bonus) and store the BEST min(usable, target) images — never more than target (target: 5 for province/county/city/place, 3 for village/camping; the thumbnail counts inside this budget; 20 is only the absolute validation cap). Returns the ready-to-attach media object incl. media.status (complete/partial/unavailable) — attach it to entity.media and save with save_active_entity.",
    { provinceId: z.string().min(1), nodeId: z.string().min(1) },
    toolFinalizeMedia,
  );

  register(
    "get_source_coverage",
    "Audit the mandatory primary-fact-source searches (dataset/source_policy.json): per-node detail (nodeId) or the list of nodes whose required primary-source coverage is still unsatisfied. All five primaries (Kojaro, Jabama, Alibaba, Lastsecond, Flytoday) are required for EVERY entity node; a recorded no-result/unreachable attempt counts, but media discovery never does. A node cannot be completed — and an entity cannot be saved with zero images — until its coverage is satisfied.",
    { provinceId: z.string().min(1), nodeId: z.string().min(1).optional() },
    toolGetSourceCoverage,
  );

  register(
    "save_active_entity",
    "Validate and save an active entity at its canonical path (all-or-nothing quality gate). Media is BEST-EFFORT and NON-BLOCKING: the target (5 for province/county/city/place, 3 for village/camping) is required for DoD completion; partial media may be saved during research; 0 images after COMPLETE primary-source coverage → save WITHOUT media (status 'unavailable' injected automatically; saving with zero images is rejected with MEDIA_ZERO_WITHOUT_PRIMARY_COVERAGE until every mandatory primary source has been attempted/recorded). Never store more than target images (advisory) / 20 (hard cap); credited web images (all-rights-reserved) are acceptable.",
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
    "Check whether the current scope meets its Definition of Done. Scope-aware: with an active scope only that subtree counts; with no scope selected the PROVINCE STAGE counts (province node + its direct places), so the province stage can pass and stop while counties stay pending for their own runs. Result is persisted to notes.md DoD section. MUST be run (returning complete:true) together with validate_province (returning invalid:0) before producing the final report of the current scope.",
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
