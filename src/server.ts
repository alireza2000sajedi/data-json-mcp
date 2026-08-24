import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerResources } from "./resources.js";
import {
  toolGetScopeState,
  toolGetNextResearchNode,
  toolGetNodeContext,
  toolFindExistingEntity,
  toolReserveEntityId,
  toolRecordSearchResult,
  toolCreateCandidate,
  toolResolveCandidate,
  toolSaveActiveEntity,
  toolLinkEntities,
  toolUpdateNotes,
  toolCheckDefinitionOfDone,
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
    "get_scope_state",
    "Return the full scope state for a province: open candidates, open conflicts, definition of done, and next node.",
    { provinceId: z.string().min(1) },
    toolGetScopeState,
  );

  register(
    "get_next_research_node",
    "Return the first unfinished node in depth-first administrative traversal.",
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
    "save_active_entity",
    "Validate and save an active entity at its canonical path (all-or-nothing quality gate).",
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
    "Check whether the province scope meets its Definition of Done.",
    { provinceId: z.string().min(1) },
    toolCheckDefinitionOfDone,
  );

  return server;
}
