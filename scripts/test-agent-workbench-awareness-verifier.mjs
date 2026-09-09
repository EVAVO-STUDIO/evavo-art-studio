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
    discovery: {
      toolRegistryOrigin: "sibling-development-studio",
      siblingDevelopmentStudioRegistryAutoDiscovered: true,
      mcpLaunchManifestObserved: true,
      mcpLaunchManifestSanitized: true,
      estateSnapshotOrigin: "unavailable",
      developmentEstateAuditAutoDiscovered: false,
      estateEvidenceComplete: false,
    },
    matches: {
      tools: [{ id: "mcp:test", source: "root-mcp-launch-manifest", runtimeReadiness: "unknown", commandBaseName: "node", argumentCount: 2, environmentKeys: ["API_TOKEN"] }],
      estateCapabilities: [],
    },
    policy: {
      readOnlyCompiler: true,
      commandExecutionPerformed: false,
      mutationPerformed: false,
      sourceCapabilityDoesNotImplyRuntimeReadiness: true,
      routeDoesNotAuthorizeEffects: true,
      planDoesNotProveExecution: true,
      publicationRequiresSeparateAuthority: true,
      incompleteEstateCannotProveAbsence: true,
      mcpRegistrationDoesNotImplyRuntimeReadiness: true,
      mcpEnvironmentValuesRetained: false,
      mcpArgumentValuesRetained: false,
      estateAutoDiscoveryRunsProviderQueries: false,
    },
  };
}

function withEstate() {
  const value = base();
  value.sourceEvidence.estateSnapshot = evidence;
  value.inventory.estateCapabilityCount = 1;
  value.inventory.estate = { evidenceComplete: true, absenceClaimsAllowed: true, declaredCapabilityCount: 1 };
  value.discovery.estateSnapshotOrigin = "development-studio-latest-estate-audit";
  value.discovery.developmentEstateAuditAutoDiscovered = true;
  value.discovery.estateEvidenceComplete = true;
  value.matches.estateCapabilities = [{ id: "art.test", repository: "EVAVO-STUDIO/art", manifestStatus: "valid", evidenceState: "validated-standard-manifest", runtimeReadiness: "unknown" }];
  value.policy.incompleteEstateCannotProveAbsence = false;
  return value;
}

const ok = verifyAgentWorkbenchAwareness({ value: base() });
assert.equal(ok.status, "passed");
assert.equal(ok.mcpServerCount, 1);
assert.equal(ok.toolRegistryOrigin, "sibling-development-studio");
const estateOk = verifyAgentWorkbenchAwareness({ value: withEstate() });
assert.equal(estateOk.estateEvidenceComplete, true);
assert.equal(estateOk.visibleEstateCapabilityMatches, 1);

for (const mutate of [
  (value) => { value.matches.tools[0].runtimeReadiness = "ready"; },
  (value) => { value.sourceEvidence.mcpLaunchManifest.rawEnvironmentValuesRetained = true; },
  (value) => { value.discovery.siblingDevelopmentStudioRegistryAutoDiscovered = false; },
]) {
  const value = base();
  mutate(value);
  assert.throws(() => verifyAgentWorkbenchAwareness({ value }));
}

for (const mutate of [
  (value) => { value.matches.estateCapabilities[0].runtimeReadiness = "ready"; },
  (value) => { value.discovery.developmentEstateAuditAutoDiscovered = false; },
  (value) => { value.inventory.estate.evidenceComplete = false; },
  (value) => { value.inventory.estate.absenceClaimsAllowed = false; },
  (value) => { value.policy.incompleteEstateCannotProveAbsence = true; },
  (value) => { delete value.sourceEvidence.estateSnapshot; },
]) {
  const value = withEstate();
  mutate(value);
  assert.throws(() => verifyAgentWorkbenchAwareness({ value }));
}

process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_awareness_verifier_test_v2", status: "passed", assertions: 14 }, null, 2)}\n`);
