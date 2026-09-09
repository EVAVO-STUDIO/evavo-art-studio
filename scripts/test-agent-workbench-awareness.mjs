#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileAgentWorkbench } from "./agent-workbench.mjs";

const parent = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-workbench-awareness-"));
const target = path.join(parent, "target");
const development = path.join(parent, "evavo-development-studio");
fs.mkdirSync(path.join(target, ".evavo"), { recursive: true });
fs.mkdirSync(path.join(development, "config"), { recursive: true });

fs.writeFileSync(path.join(target, ".evavo", "agent-workbench.v1.json"), JSON.stringify({
  contractVersion: "evavo_agent_workbench_config_v1",
  repository: "EVAVO-STUDIO/target",
  authority: "target",
  role: "target role",
  capabilityManifest: "evavo.capabilities.json",
  packageManifest: "package.json",
  readFirst: ["AGENTS.md"],
  phases: [{ id: "orient", purpose: "orient", evidence: ["manifest"] }],
  automation: { safeWithoutApproval: ["read"], gated: ["write"], neverImplied: ["execution"] },
  handoffs: [],
}, null, 2));
fs.writeFileSync(path.join(target, "evavo.capabilities.json"), JSON.stringify({
  contractVersion: "evavo_repository_capabilities_v1",
  repository: "EVAVO-STUDIO/target",
  authority: "target",
  summary: "target",
  capabilities: [{ id: "target.read", title: "Read", description: "Read target", interfaces: ["cli"], effects: ["read", "compute"], entrypoints: ["read"], tags: ["read"], requires: [] }],
  brain: { consult: true, sanityCheck: true, topics: [] },
}, null, 2));
fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({ name: "target", scripts: { check: "node check.mjs" } }, null, 2));
fs.writeFileSync(path.join(target, ".mcp.json"), JSON.stringify({
  mcpServers: {
    "local-secret": {
      command: "node",
      args: ["server.mjs", "--token", "dont-retain-me"],
      env: { API_TOKEN: "dont-retain-me-either", MODE: "read-only" },
    },
  },
}, null, 2));
fs.writeFileSync(path.join(development, "config", "agent-tool-registry.json"), JSON.stringify({
  tools: [{ id: "development-test", repository: "EVAVO-STUDIO/evavo-development-studio", purpose: "Development test tool", useWhen: ["testing"], entrypoints: ["test"], truthBoundary: "read only" }],
}, null, 2));

const snapshot = compileAgentWorkbench({ root: target, objective: "development local secret", limit: 20 });
assert.equal(snapshot.discovery.toolRegistryOrigin, "sibling-development-studio");
assert.equal(snapshot.discovery.siblingDevelopmentStudioRegistryAutoDiscovered, true);
assert.equal(snapshot.inventory.registeredToolCount, 1);
assert.equal(snapshot.inventory.mcpServerCount, 1);
assert.ok(snapshot.matches.tools.some((item) => item.id === "development-test"));
const mcp = snapshot.matches.tools.find((item) => item.id === "mcp:local-secret");
assert.ok(mcp);
assert.equal(mcp.runtimeReadiness, "unknown");
assert.deepEqual(mcp.environmentKeys, ["API_TOKEN", "MODE"]);
assert.equal(mcp.argumentCount, 3);
assert.equal(snapshot.sourceEvidence.mcpLaunchManifest.sanitized, true);
assert.equal(snapshot.sourceEvidence.mcpLaunchManifest.rawEnvironmentValuesRetained, false);
assert.equal(snapshot.sourceEvidence.mcpLaunchManifest.rawArgumentValuesRetained, false);
assert.equal(snapshot.policy.mcpRegistrationDoesNotImplyRuntimeReadiness, true);
const serialized = JSON.stringify(snapshot);
assert.equal(serialized.includes("dont-retain-me"), false);
assert.equal(serialized.includes("dont-retain-me-either"), false);

fs.rmSync(parent, { recursive: true, force: true });
process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_awareness_test_v1", status: "passed", assertions: 15 }, null, 2)}\n`);
