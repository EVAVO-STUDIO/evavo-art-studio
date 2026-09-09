#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(root, "scripts", "agent-workbench-mcp-v2.mjs");
const bundle = JSON.parse(fs.readFileSync(path.join(root, ".evavo", "agent-workbench.contracts.v1.json"), "utf8"));
const expectedRepository = bundle.repository;
const EVAVO_DISCOVERY_VERSION = "2026-07-28";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const child = spawn(process.execPath, [serverPath], {
  cwd: root,
  env: { ...process.env, EVAVO_AGENT_WORKBENCH_ROOT: root },
  stdio: ["pipe", "pipe", "pipe"],
});
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
const errors = [];
child.stderr.on("data", (chunk) => errors.push(String(chunk)));
const iterator = lines[Symbol.asyncIterator]();

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function nextResponse(timeoutMs = 5000) {
  return await Promise.race([
    iterator.next().then(({ value, done }) => {
      if (done || !value) throw new Error(`MCP server closed unexpectedly. ${errors.join("")}`);
      return JSON.parse(value);
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for MCP response.")), timeoutMs)),
  ]);
}

try {
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const initialized = await nextResponse();
  assert(initialized.result?.serverInfo?.name === "evavo-agent-workbench", "Unexpected MCP server identity.");
  assert(initialized.result?.protocolVersion === "2025-03-26", "Unexpected standard MCP protocol version.");

  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "server/discover", params: { protocolVersion: EVAVO_DISCOVERY_VERSION } });
  const discovered = await nextResponse();
  assert(discovered.result?.protocolVersion === EVAVO_DISCOVERY_VERSION, "EVAVO discovery protocol version mismatch.");
  assert(discovered.result?.supportedVersions?.includes(EVAVO_DISCOVERY_VERSION), "EVAVO discovery version was not advertised.");
  assert(discovered.result?.supportedVersions?.includes("2025-03-26"), "Standard MCP version was not advertised through EVAVO discovery.");
  assert(discovered.result?.serverInfo?.name === "evavo-agent-workbench", "EVAVO discovery server identity mismatch.");
  assert(discovered.result?.readOnly === true, "EVAVO discovery must advertise readOnly=true.");
  assert(discovered.result?.truthBoundary?.executionGranted === false && discovered.result?.truthBoundary?.mutationGranted === false && discovered.result?.truthBoundary?.publicationGranted === false, "EVAVO discovery truth boundary mismatch.");

  send({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} });
  const listed = await nextResponse();
  const names = listed.result?.tools?.map((item) => item.name) ?? [];
  assert(names.length === 4, "Expected exactly four workbench MCP tools.");
  for (const name of ["evavo_agent_workbench_capabilities", "evavo_agent_workbench_snapshot", "evavo_agent_workbench_guide", "evavo_agent_workbench_handoff"]) assert(names.includes(name), `Missing MCP tool: ${name}`);

  send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "evavo_agent_workbench_snapshot", arguments: { objective: "agent workbench smoke test", limit: 5 } } });
  const snapshotResponse = await nextResponse();
  const snapshot = snapshotResponse.result?.structuredContent;
  assert(snapshot?.contract === "evavo_agent_workbench_snapshot_v1", "Snapshot contract mismatch.");
  assert(snapshot?.repository === expectedRepository, "Snapshot repository identity mismatch.");
  assert(snapshot?.policy?.readOnlyCompiler === true && snapshot?.policy?.commandExecutionPerformed === false && snapshot?.policy?.mutationPerformed === false, "Snapshot truth boundary mismatch.");

  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_mcp_smoke_v2", status: "passed", repository: expectedRepository, standardProtocolVersion: initialized.result.protocolVersion, evavoDiscoveryVersion: discovered.result.protocolVersion, tools: names, snapshotMode: snapshot.mode }, null, 2)}\n`);
} finally {
  child.kill();
  lines.close();
}
