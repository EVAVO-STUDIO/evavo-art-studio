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
const expectedTools = [
  "evavo_agent_workbench_capabilities",
  "evavo_agent_workbench_snapshot",
  "evavo_agent_workbench_fleet",
  "evavo_agent_workbench_shared_drift",
  "evavo_agent_workbench_guide",
  "evavo_agent_workbench_handoff",
];
function assert(condition, message) { if (!condition) throw new Error(message); }
const child = spawn(process.execPath, [serverPath], { cwd: root, env: { ...process.env, EVAVO_AGENT_WORKBENCH_ROOT: root }, stdio: ["pipe", "pipe", "pipe"] });
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
const errors = [];
child.stderr.on("data", (chunk) => errors.push(String(chunk)));
const iterator = lines[Symbol.asyncIterator]();
function send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); }
async function nextResponse(timeoutMs = 15000) { return await Promise.race([iterator.next().then(({ value, done }) => { if (done || !value) throw new Error(`MCP server closed unexpectedly. ${errors.join("")}`); return JSON.parse(value); }), new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for MCP response.")), timeoutMs))]); }

try {
  send({ jsonrpc: "2.0", id: 0, method: "server/discover", params: { protocolVersion: "2026-07-28" } });
  const discovered = await nextResponse();
  assert(discovered.result?.protocolVersion === "2026-07-28", "EVAVO discovery protocol version mismatch.");
  assert(Array.isArray(discovered.result?.supportedVersions) && discovered.result.supportedVersions.includes("2025-03-26") && discovered.result.supportedVersions.includes("2026-07-28"), "EVAVO discovery did not advertise both protocols.");
  assert(discovered.result?.serverInfo?.name === "evavo-agent-workbench", "EVAVO discovery server identity mismatch.");
  assert(discovered.result?.readOnly === true && discovered.result?.truthBoundary?.executionGranted === false && discovered.result?.truthBoundary?.mutationGranted === false && discovered.result?.truthBoundary?.publicationGranted === false, "EVAVO discovery truth boundary mismatch.");
  assert(discovered.result?.capabilities?.tools?.count === expectedTools.length, "EVAVO discovery tool count mismatch.");
  assert(JSON.stringify(discovered.result?.capabilities?.tools?.names) === JSON.stringify(expectedTools), "EVAVO discovery tool names mismatch.");
  assert(discovered.result?.capabilities?.fleet === true && discovered.result?.capabilities?.sharedDrift === true, "EVAVO discovery did not advertise fleet/shared-drift awareness.");

  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const initialized = await nextResponse();
  assert(initialized.result?.serverInfo?.name === "evavo-agent-workbench", "Unexpected MCP server identity.");
  assert(initialized.result?.protocolVersion === "2025-03-26", "Unexpected MCP protocol version.");

  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const listed = await nextResponse();
  const names = listed.result?.tools?.map((item) => item.name) ?? [];
  assert(JSON.stringify(names) === JSON.stringify(expectedTools), "Expected exactly the canonical six workbench MCP tools.");

  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "evavo_agent_workbench_snapshot", arguments: { objective: "agent workbench smoke test", limit: 5 } } });
  const snapshotResponse = await nextResponse();
  const snapshot = snapshotResponse.result?.structuredContent;
  assert(snapshot?.contract === "evavo_agent_workbench_snapshot_v1", "Snapshot contract mismatch.");
  assert(snapshot?.repository === expectedRepository, "Snapshot repository identity mismatch.");
  assert(snapshot?.policy?.readOnlyCompiler === true && snapshot?.policy?.commandExecutionPerformed === false && snapshot?.policy?.mutationPerformed === false, "Snapshot truth boundary mismatch.");

  send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "evavo_agent_workbench_fleet", arguments: { workspaceRoot: root, objective: "agent workbench smoke test", limit: 5, repositoryLimit: 5 } } });
  const fleetResponse = await nextResponse();
  const fleet = fleetResponse.result?.structuredContent;
  assert(fleet?.contract === "evavo_agent_workbench_fleet_snapshot_v1", "Fleet contract mismatch.");
  assert(fleet?.scope === "local-workbench-enabled-siblings", "Fleet scope mismatch.");
  assert(fleet?.policy?.readOnlyCompiler === true && fleet?.policy?.absenceClaimsAllowed === false && fleet?.policy?.providerEstateCompletenessClaimed === false, "Fleet truth boundary mismatch.");
  assert(fleet?.policy?.canonicalRouteOwnershipApplied === true && fleet?.policy?.duplicateRoutesCollapsed === true, "Fleet canonical routing policy mismatch.");

  send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "evavo_agent_workbench_shared_drift", arguments: { workspaceRoot: root } } });
  const driftResponse = await nextResponse();
  const drift = driftResponse.result?.structuredContent;
  assert(drift?.contract === "evavo_agent_workbench_shared_drift_v1", "Shared drift contract mismatch.");
  assert(drift?.repository === expectedRepository, "Shared drift repository identity mismatch.");
  assert(drift?.status === "unavailable", "Repository-scoped smoke should have unavailable sibling evidence.");
  assert(drift?.policy?.readOnly === true && drift?.policy?.providerQueriesPerformed === false && drift?.policy?.mutationPerformed === false && drift?.policy?.unavailableDoesNotProveAlignment === true, "Shared drift truth boundary mismatch.");

  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_mcp_smoke_v4", status: "passed", repository: expectedRepository, tools: names, snapshotMode: snapshot.mode, fleetRepositories: fleet.counts?.repositoriesCompiled ?? 0, sharedDriftStatus: drift.status }, null, 2)}\n`);
} finally {
  child.kill();
  lines.close();
}
