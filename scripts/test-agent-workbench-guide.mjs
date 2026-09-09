#!/usr/bin/env node

import crypto from "node:crypto";
import { compileAgentWorkbenchGuidance } from "./agent-workbench-guide.mjs";

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function guidance(snapshot, options = {}) {
  const bytes = Buffer.from(JSON.stringify(snapshot), "utf8");
  return compileAgentWorkbenchGuidance({ snapshotRead: { value: snapshot, bytes, sha256: digest(bytes) }, ...options });
}

const policy = { readOnlyCompiler: true, commandExecutionPerformed: false, mutationPerformed: false, routeDoesNotAuthorizeEffects: true, planDoesNotProveExecution: true, publicationRequiresSeparateAuthority: true };
const base = {
  contract: "evavo_agent_workbench_snapshot_v1",
  generatedAt: new Date(0).toISOString(),
  repository: "EVAVO-STUDIO/test",
  authority: "test",
  objective: "do work",
  orientation: { phases: [{ id: "orient", purpose: "orient", evidence: ["manifest"] }, { id: "review", purpose: "review", evidence: ["review receipt"] }] },
  automation: { neverImplied: ["execution from route"] },
  policy,
};

const local = guidance({ ...base, matches: { capabilities: [{ id: "local.read", relevance: 4, effects: ["read", "compute"], requires: [] }], tools: [], estateCapabilities: [], scripts: [] } });
assert(local.guidance.disposition === "read-compute-route", "local read classification failed");
assert(local.guidance.nextPhase === "orient", "initial phase failed");

const effect = guidance({ ...base, matches: { capabilities: [{ id: "local.write", relevance: 4, effects: ["write", "execute"], requires: ["approval"] }], tools: [], estateCapabilities: [], scripts: [] } }, { currentPhase: "orient" });
assert(effect.guidance.disposition === "effect-admission-required", "effect classification failed");
assert(effect.guidance.nextPhase === "review", "next phase failed");
assert(effect.guidance.blockers.some((item) => item.includes("approval")), "requirement blocker missing");

const remote = guidance({ ...base, matches: { capabilities: [], tools: [], estateCapabilities: [{ id: "art.remote", repository: "EVAVO-STUDIO/art", authority: "art", relevance: 5, runtimeReadiness: "unknown" }], scripts: [] } });
assert(remote.guidance.disposition === "handoff-runtime-unverified", "remote classification failed");
assert(remote.guidance.nextAuthority === "EVAVO-STUDIO/art", "remote authority failed");
assert(remote.guidance.handoffRecommended === true, "remote handoff failed");

const script = guidance({ ...base, matches: { capabilities: [], tools: [], estateCapabilities: [], scripts: [{ name: "build", command: "tool build", relevance: 3 }] } });
assert(script.guidance.disposition === "resolve-script-through-capability", "script classification failed");

const capabilityBeatsLauncher = guidance({ ...base, matches: {
  capabilities: [{ id: "semantic.read", relevance: 1, effects: ["read", "compute"], requires: [] }],
  tools: [{ id: "mcp:semantic.read", source: "root-mcp-launch-manifest", repository: "EVAVO-STUDIO/test", runtimeReadiness: "unknown", relevance: 99 }],
  estateCapabilities: [], scripts: [],
} });
assert(capabilityBeatsLauncher.selectedRoute.id === "semantic.read", "raw MCP launcher outranked matching capability");
assert(capabilityBeatsLauncher.guidance.disposition === "read-compute-route", "capability priority classification failed");

const semanticToolBeatsLauncher = guidance({ ...base, matches: {
  capabilities: [],
  tools: [
    { id: "shared-tool", source: "development-tool-registry", repository: "EVAVO-STUDIO/dev", purpose: "shared tool", relevance: 1 },
    { id: "mcp:shared-tool", source: "root-mcp-launch-manifest", repository: "EVAVO-STUDIO/test", runtimeReadiness: "unknown", relevance: 99 },
  ],
  estateCapabilities: [], scripts: [],
} });
assert(semanticToolBeatsLauncher.selectedRoute.id === "shared-tool", "raw MCP launcher outranked semantic registered tool");
assert(semanticToolBeatsLauncher.guidance.disposition === "handoff-registered-tool", "semantic registered tool handoff classification failed");

const explicitMcp = guidance({ ...base, matches: {
  capabilities: [],
  tools: [{ id: "mcp:exact", source: "root-mcp-launch-manifest", repository: "EVAVO-STUDIO/test", runtimeReadiness: "unknown", relevance: 10 }],
  estateCapabilities: [], scripts: [],
} }, { routeType: "tool", routeId: "mcp:exact" });
assert(explicitMcp.guidance.disposition === "mcp-runtime-verification-required", "MCP launcher classification failed");
assert(explicitMcp.guidance.blockers.some((item) => item.includes("live protocol/discovery receipt")), "MCP live protocol blocker missing");
assert(explicitMcp.guidance.handoffRecommended === false, "local MCP launcher should not require repository handoff");

process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_guidance_test_v2", status: "passed", assertions: 16 }, null, 2)}\n`);
