#!/usr/bin/env node

import assert from "node:assert/strict";
import { verifyAgentWorkbenchAwareness } from "./verify-agent-workbench-awareness.mjs";

const evidence = { path: "/tmp/test", sha256: "a".repeat(64), bytes: 1 };
function base() {
  return {
    contract: "evavo_agent_workbench_snapshot_v1",
    repository: "EVAVO-STUDIO/test",
    authority: "test",
    sourceEvidence: {
      workbenchConfig: evidence,
      capabilityManifest: evidence,
      packageManifest: evidence,
      toolRegistry: evidence,
      mcpLaunchManifest: { ...evidence, sanitized: true, rawEnvironmentValuesRetained: false, rawArgumentValuesRetained: false },
    },
    inventory: { capabilityCount: 1, packageScriptCount: 1, toolCount: 2, registeredToolCount: 1, mcpServerCount: 1, estateCapabilityCount: 0, estate: null },
    discovery: { toolRegistryOrigin: "sibling-development-studio", siblingDevelopmentStudioRegistryAutoDiscovered: true, mcpLaunchManifestObserved: true, mcpLaunchManifestSanitized: true },
    matches: { tools: [{ id: "mcp:test", source: "root-mcp-launch-manifest", runtimeReadiness: "unknown", commandBaseName: "node", argumentCount: 2, environmentKeys: ["API_TOKEN"] }] },
    policy: { readOnlyCompiler: true, commandExecutionPerformed: false, mutationPerformed: false, sourceCapabilityDoesNotImplyRuntimeReadiness: true, routeDoesNotAuthorizeEffects: true, planDoesNotProveExecution: true, publicationRequiresSeparateAuthority: true, mcpRegistrationDoesNotImplyRuntimeReadiness: true, mcpEnvironmentValuesRetained: false, mcpArgumentValuesRetained: false },
  };
}

const ok = verifyAgentWorkbenchAwareness({ value: base() });
assert.equal(ok.status, "passed");
assert.equal(ok.mcpServerCount, 1);
assert.equal(ok.toolRegistryOrigin, "sibling-development-studio");

for (const mutate of [
  (value) => { value.matches.tools[0].runtimeReadiness = "ready"; },
  (value) => { value.sourceEvidence.mcpLaunchManifest.rawEnvironmentValuesRetained = true; },
  (value) => { value.discovery.siblingDevelopmentStudioRegistryAutoDiscovered = false; },
]) {
  const value = base();
  mutate(value);
  assert.throws(() => verifyAgentWorkbenchAwareness({ value }));
}

process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_awareness_verifier_test_v1", status: "passed", assertions: 6 }, null, 2)}\n`);
