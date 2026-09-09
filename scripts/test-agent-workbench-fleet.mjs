#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileAgentWorkbenchFleet } from "./agent-workbench-fleet.mjs";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-fleet-"));
const development = path.join(workspace, "evavo-development-studio");
fs.mkdirSync(path.join(development, "config"), { recursive: true });
fs.writeFileSync(path.join(development, "config", "agent-tool-registry.json"), JSON.stringify({
  tools: [{ id: "shared-tool", repository: "EVAVO-STUDIO/evavo-development-studio", purpose: "shared semantic tool route", useWhen: ["shared tool"], entrypoints: ["shared"], truthBoundary: "read-only discovery" }],
}, null, 2));

function writeRepo(name, withMcp) {
  const root = path.join(workspace, name);
  fs.mkdirSync(path.join(root, ".evavo"), { recursive: true });
  fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.v1.json"), JSON.stringify({
    contractVersion: "evavo_agent_workbench_config_v1",
    repository: `EVAVO-STUDIO/${name}`,
    authority: name,
    role: `${name} fixture`,
    capabilityManifest: "evavo.capabilities.json",
    packageManifest: "package.json",
    readFirst: ["AGENTS.md"],
    phases: [{ id: "orient", purpose: "orient", evidence: ["manifest"] }],
    automation: { safeWithoutApproval: ["read"], gated: ["write"], neverImplied: ["execution"] },
    handoffs: [],
  }, null, 2));
  fs.writeFileSync(path.join(root, "evavo.capabilities.json"), JSON.stringify({
    contractVersion: "evavo_repository_capabilities_v1",
    repository: `EVAVO-STUDIO/${name}`,
    authority: name,
    summary: `${name} fixture`,
    capabilities: [{ id: `${name}.read`, title: "Read", description: "Read fixture", interfaces: ["cli"], effects: ["read", "compute"], entrypoints: ["read"], tags: ["fixture"], requires: [] }],
    brain: { consult: true, sanityCheck: true, topics: [] },
  }, null, 2));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name, scripts: { check: "node check.mjs" } }, null, 2));
  if (withMcp) fs.writeFileSync(path.join(root, ".mcp.json"), JSON.stringify({ mcpServers: { "shared-tool": { command: "node", args: ["server.mjs", "--token", "fleet-secret"], env: { API_TOKEN: "fleet-secret-env" } } } }, null, 2));
}
writeRepo("alpha", false);
writeRepo("beta", true);

const result = compileAgentWorkbenchFleet({ workspaceRoot: workspace, objective: "shared tool", limit: 10 });
assert.equal(result.counts.repositoriesCompiled, 2);
assert.equal(result.counts.compileErrors, 0);
assert.equal(result.repositories.length, 2);
assert.equal(result.repositories.every((item) => item.discovery.toolRegistryOrigin === "sibling-development-studio"), true);
assert.equal(result.bestRoutes[0].source, "development-tool-registry");
const mcp = result.bestRoutes.find((item) => item.source === "root-mcp-launch-manifest");
assert.ok(mcp);
assert.equal(mcp.runtimeReadiness, "unknown");
assert.equal(result.policy.absenceClaimsAllowed, false);
assert.equal(JSON.stringify(result).includes("fleet-secret"), false);
assert.equal(JSON.stringify(result).includes("fleet-secret-env"), false);

fs.rmSync(workspace, { recursive: true, force: true });
console.log(JSON.stringify({ contract: "evavo_agent_workbench_fleet_test_v1", status: "passed", assertions: 10 }, null, 2));
