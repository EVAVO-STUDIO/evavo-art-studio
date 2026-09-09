#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileAgentWorkbenchFleet } from "./agent-workbench-fleet.mjs";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-fleet-"));
const development = path.join(workspace, "evavo-development-studio");
fs.mkdirSync(path.join(development, "config"), { recursive: true });
fs.mkdirSync(path.join(development, ".studio", "estate-audit"), { recursive: true });
fs.writeFileSync(path.join(development, "config", "agent-tool-registry.json"), JSON.stringify({
  tools: [{ id: "shared-tool", repository: "EVAVO-STUDIO/evavo-development-studio", purpose: "shared semantic tool route", useWhen: ["shared tool"], entrypoints: ["shared"], truthBoundary: "read-only discovery" }],
}, null, 2));
fs.writeFileSync(path.join(development, ".studio", "estate-audit", "2026-09-09.json"), JSON.stringify({
  githubRepositoryCapabilities: {
    contract: "evavo_github_repository_capability_evidence_v1",
    generatedAt: "2026-09-09T00:00:00.000Z",
    owner: "EVAVO-STUDIO",
    authenticated: true,
    estateEvidenceComplete: true,
    evidenceComplete: true,
    counts: { repositoryCount: 1, validManifestRepositoryCount: 1, declaredCapabilityCount: 1 },
    repositories: [{ repository: "EVAVO-STUDIO/estate-art", authority: "art-studio", manifestStatus: "valid", capabilityIds: ["art.estate"] }],
  },
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

const result = compileAgentWorkbenchFleet({ workspaceRoot: workspace, objective: "shared tool estate", limit: 10 });
assert.equal(result.counts.repositoriesCompiled, 2);
assert.equal(result.counts.compileErrors, 0);
assert.equal(result.repositories.length, 2);
assert.equal(result.repositories.every((item) => item.discovery.toolRegistryOrigin === "sibling-development-studio"), true);
assert.equal(result.repositories.every((item) => item.discovery.estateSnapshotOrigin === "development-studio-latest-estate-audit"), true);
assert.equal(result.repositories.every((item) => item.discovery.estateEvidenceComplete === true), true);
assert.equal(result.counts.routeCandidatesRaw, 5);
assert.equal(result.counts.routeCandidates, 3);
assert.equal(result.counts.duplicateRoutesCollapsed, 2);
assert.equal(result.policy.canonicalRouteOwnershipApplied, true);
assert.equal(result.policy.duplicateRoutesCollapsed, true);

const semantic = result.bestRoutes.find((item) => item.source === "development-tool-registry");
assert.ok(semantic);
assert.equal(semantic.repository, "EVAVO-STUDIO/evavo-development-studio");
assert.equal(semantic.authority, "development-studio");
assert.deepEqual(semantic.observedFromRepositories, ["EVAVO-STUDIO/alpha", "EVAVO-STUDIO/beta"]);
assert.equal(result.bestRoutes[0].id, "shared-tool");

const estate = result.bestRoutes.find((item) => item.type === "estate-capability" && item.id === "art.estate");
assert.ok(estate);
assert.equal(estate.repository, "EVAVO-STUDIO/estate-art");
assert.equal(estate.authority, "art-studio");
assert.equal(estate.runtimeReadiness, "unknown");
assert.deepEqual(estate.observedFromRepositories, ["EVAVO-STUDIO/alpha", "EVAVO-STUDIO/beta"]);

const mcp = result.bestRoutes.find((item) => item.source === "root-mcp-launch-manifest");
assert.ok(mcp);
assert.equal(mcp.repository, "EVAVO-STUDIO/beta");
assert.equal(mcp.runtimeReadiness, "unknown");
assert.deepEqual(mcp.observedFromRepositories, ["EVAVO-STUDIO/beta"]);
assert.equal(result.policy.absenceClaimsAllowed, false);
assert.equal(result.policy.providerEstateCompletenessClaimed, false);
assert.equal(JSON.stringify(result).includes("fleet-secret"), false);
assert.equal(JSON.stringify(result).includes("fleet-secret-env"), false);

fs.rmSync(workspace, { recursive: true, force: true });
console.log(JSON.stringify({ contract: "evavo_agent_workbench_fleet_test_v2", status: "passed", assertions: 29 }, null, 2));
