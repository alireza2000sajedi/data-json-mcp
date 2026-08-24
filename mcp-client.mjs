#!/usr/bin/env node
/**
 * planro-mcp CLI client
 *
 * A thin stdio MCP client so a shell-driven agent can call Planro tools without
 * hand-writing JSON-RPC. Each invocation spawns a fresh server process (fast and
 * robust for one-shot calls).
 *
 * Usage:
 *   node mcp-client.mjs call <toolName> '<jsonArgs>'        # call a tool
 *   node mcp-client.mjs call <toolName>                     # reads jsonArgs from stdin
 *   node mcp-client.mjs read <uri>                          # read a resource
 *   node mcp-client.mjs list-tools                          # list tools
 *   node mcp-client.mjs list-resources                      # list resources
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, "dist", "index.js");

function run(serverPath) {
  return spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
}

function makeClient(serverPath) {
  const child = run(serverPath);
  let buf = "";
  let nextId = 1;
  const pending = new Map();

  child.stdout.on("data", (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id != null && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    }
  });

  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });

  const close = () => child.kill();

  return { request, close, child };
}

async function init(client) {
  await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "planro-cli", version: "1.0.0" },
  });
  client.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd) {
    console.error(
      "usage: node mcp-client.mjs call <tool> '<json>' | read <uri> | list-tools | list-resources",
    );
    process.exit(2);
  }

  const client = makeClient(serverPath);

  (async () => {
    await init(client);
    try {
      if (cmd === "list-tools") {
        const r = await client.request("tools/list", {});
        for (const t of r.tools) {
          console.log(`${t.name}\t${(t.description ?? "").replace(/\n/g, " ")}`);
        }
      } else if (cmd === "list-resources") {
        const r = await client.request("resources/list", {});
        for (const res of r.resources) {
          console.log(`${res.uri}\t${res.name ?? ""}`);
        }
      } else if (cmd === "read") {
        const uri = rest[0];
        if (!uri) throw new Error("read requires a URI");
        const r = await client.request("resources/read", { uri });
        for (const c of r.contents ?? []) {
          console.log(c.text ?? c.blob ?? "");
        }
      } else if (cmd === "call") {
        const tool = rest[0];
        if (!tool) throw new Error("call requires a tool name");
        let argsJson = rest.slice(1).join(" ");
        if (!argsJson || argsJson.trim() === "") {
          argsJson = fs.readFileSync(0, "utf8");
        }
        const args = JSON.parse(argsJson);
        const r = await client.request("tools/call", { name: tool, arguments: args });
        if (r.isError) {
          console.error("TOOL ERROR:");
        }
        for (const c of r.content ?? []) {
          if (c.type === "text") {
            // pretty-print if JSON
            try {
              console.log(JSON.stringify(JSON.parse(c.text), null, 2));
            } catch {
              console.log(c.text);
            }
          } else {
            console.log(c);
          }
        }
        if (r.isError) process.exitCode = 1;
      } else {
        throw new Error(`unknown command: ${cmd}`);
      }
    } catch (e) {
      console.error("client error:", e.message);
      process.exitCode = 1;
    } finally {
      client.close();
    }
  })();
}

main();
