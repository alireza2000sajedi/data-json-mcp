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

  server.registerResource("place-schema", "planro://schema/place", { title: "Place schema", mimeType: "application/json" }, async (uri) => {
    const text = fs.readFileSync(path.join(config.datasetDir, "place.schema.json"), "utf8");
    return textResource(uri.href, text, "application/json");
  });

  server.registerResource("iran-cpi-schema", "planro://schema/iran-cpi", { title: "Iran CPI schema", mimeType: "application/json" }, async (uri) => {
    const text = fs.readFileSync(path.join(config.datasetDir, "iran-cpi.schema.json"), "utf8");
    return textResource(uri.href, text, "application/json");
  });

  server.registerResource("brand-voice", "planro://rules/brand-voice", { title: "Planro brand voice examples", description: "Before/after examples of brand-compliant vs. rejected copy.", mimeType: "text/markdown" }, async (uri) => {
    const text = fs.readFileSync(path.join(config.datasetDir, "brand_voice_example.md"), "utf8");
    return textResource(uri.href, text, "text/markdown");
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
