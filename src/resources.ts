import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { readNotes, notesPath } from "./notes.js";
import { getScopeState, nextRequiredNode, traverse, administrativePath, nodeStatus, REQUIRED_DISCOVERY } from "./graph.js";
import { listEntities } from "./dataset.js";
import { readReadme } from "./schemas.js";
import { buildScopeRegistry, listProvinceScopesIndex } from "./scopes.js";

function jsonResource(uri: string, data: unknown): ReadResourceResult {
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
}

function textResource(uri: string, text: string, mimeType = "text/plain"): ReadResourceResult {
  return { contents: [{ uri, mimeType, text }] };
}

function findEntityGlobal(entityId: string) {
  if (!fs.existsSync(config.outputDir)) return undefined;
  for (const dir of fs.readdirSync(config.outputDir)) {
    const full = path.join(config.outputDir, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const e of listEntities(dir)) {
      if (e.id === entityId) return e;
    }
  }
  return undefined;
}

export function registerResources(server: McpServer): void {
  // --- static resources ---
  server.registerResource("readme", "planro://rules/readme", { title: "Planro rules", description: "Source of truth for research rules and Definition of Done.", mimeType: "text/markdown" }, async (uri) =>
    textResource(uri.href, readReadme(), "text/markdown"),
  );

  server.registerResource("entity-fields", "planro://rules/entity-fields", { title:"Entity field applicability", description:"Normalized field policy by entity type.", mimeType:"application/json" }, async (uri) => {
    const text = fs.readFileSync(path.join(config.datasetDir, "entity-field-policy.json"), "utf8");
    return textResource(uri.href, text, "application/json");
  });

  server.registerResource("taxonomy", "planro://taxonomy", { title:"Global Planro taxonomy", description:"Shared canonical taxonomy catalogs.", mimeType:"application/json" }, async (uri) => {
    const names = ["types","subtypes","categories","activities","features","facilities","risks"];
    const data = Object.fromEntries(names.map((n) => [n, JSON.parse(fs.readFileSync(path.join(path.resolve(config.datasetDir, ".."), "taxonomy", `${n}.json`), "utf8"))]));
    return jsonResource(uri.href, data);
  });

  server.registerResource("place-schema", "planro://schema/place", { title: "Place schema", mimeType: "application/json" }, async (uri) => {
    const text = fs.readFileSync(path.join(config.datasetDir, "place.schema.json"), "utf8");
    return textResource(uri.href, text, "application/json");
  });

  server.registerResource(
    "source-policy",
    "planro://rules/source-policy",
    {
      title: "Planro source policy",
      description:
        "Mandatory primary sources (Kojaro, Jabama Mag, Alibaba Mag, Lastsecond, Flytoday), fallback sources (Wikipedia/Commons etc.) and the coverage contract (all primaries per entity node, 2 per village).",
      mimeType: "application/json",
    },
    async (uri) => {
      const text = fs.readFileSync(path.join(config.datasetDir, "source_policy.json"), "utf8");
      return textResource(uri.href, text, "application/json");
    },
  );

  server.registerResource("iran-cpi-schema", "planro://schema/iran-cpi", { title: "Iran CPI schema", mimeType: "application/json" }, async (uri) => {
    const text = fs.readFileSync(path.join(config.datasetDir, "iran-cpi.schema.json"), "utf8");
    return textResource(uri.href, text, "application/json");
  });

  server.registerResource("brand-voice-guide", "planro://rules/brand-voice-guide", { title: "Planro brand voice (v1.0)", description: "Verbal identity & brand tone v1.0 (single source): language modes, vocabulary system & blacklist, CTA rules, AI voice, 100 before/after examples, quality test, plus the applied dataset-content example (Masuleh appendix).", mimeType: "text/markdown" }, async (uri) => {
    const text = fs.readFileSync(path.join(config.datasetDir, "brand_voice.md"), "utf8");
    return textResource(uri.href, text, "text/markdown");
  });

  // --- scope registry resources (dedicated scope ids) ---
  server.registerResource("scopes-index", "planro://scopes", { title: "All province scope ids", description: "Index of the 31 provinces with their county scope ids and counts — the entry point of the staged workflow (Scope A).", mimeType: "application/json" }, async (uri) =>
    jsonResource(uri.href, { provinces: listProvinceScopesIndex() }),
  );

  const scopesTpl = new ResourceTemplate("planro://scopes/{provinceId}", { list: undefined });
  server.registerResource("scopes", scopesTpl, { title: "Province scope registry", description: "Deterministic scope ids (county/city/village) for a province, derived from input/{n}.json: tree + id index + name lookup.", mimeType: "application/json" }, async (uri) => {
    const m = uri.pathname.match(/^\/([^/]+)$/);
    const provinceId = m?.[1];
    if (!provinceId) throw new Error("Invalid scopes resource uri: planro://scopes/{provinceId}");
    return jsonResource(uri.href, buildScopeRegistry(provinceId));
  });

  // --- province resources ---
  const provinceTpl = (name: string, handler: (provinceId: string, uri: string) => ReadResourceResult) => {
    const template = new ResourceTemplate(`planro://province/{provinceId}/${name}`, { list: undefined });
    server.registerResource(`province-${name}`, template, { title: `Province ${name}` }, async (uri) => {
      const provinceId = uri.pathname.split("/")[2];
      return handler(provinceId, uri.href);
    });
  };

  provinceTpl("notes", (provinceId, href) => textResource(href, fs.readFileSync(notesPath(provinceId), "utf8"), "text/markdown"));

  provinceTpl("registry", (provinceId, href) => jsonResource(href, readNotes(provinceId).registry));

  provinceTpl("tree", (provinceId, href) => {
    const state = readNotes(provinceId);
    const nodes = traverse(provinceId).map((n) => ({
      nodeId: n.nodeId,
      nodeType: n.nodeType,
      canonicalName: n.canonicalName,
      parentNodeId: n.parentNodeId,
      state: n.state,
      administrativePath: administrativePath(state, n.nodeId),
      requiredDiscovery: REQUIRED_DISCOVERY[n.nodeType],
    }));
    return jsonResource(href, { provinceId, nodes });
  });

  provinceTpl("scope-state", (provinceId, href) => jsonResource(href, getScopeState(provinceId)));

  provinceTpl("next-node", (provinceId, href) => {
    const node = nextRequiredNode(provinceId);
    if (!node) return jsonResource(href, { provinceId, done: true, node: null });
    const state = readNotes(provinceId);
    const status = nodeStatus(provinceId, node);
    return jsonResource(href, {
      provinceId,
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      canonicalName: node.canonicalName,
      parentNodeId: node.parentNodeId,
      administrativePath: administrativePath(state, node.nodeId),
      state: node.state,
      requiredDiscovery: REQUIRED_DISCOVERY[node.nodeType],
      pendingDiscovery: status.pendingDiscovery,
    });
  });

  // --- entity resource ---
  const entityTpl = new ResourceTemplate("planro://entity/{entityId}", { list: undefined });
  server.registerResource("entity", entityTpl, { title: "Entity document" }, async (uri) => {
    const entityId = uri.pathname.split("/")[2];
    const found = findEntityGlobal(entityId);
    if (!found) throw new Error(`Entity '${entityId}' not found.`);
    return jsonResource(uri.href, found.entity);
  });
}
