#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectAgentWorkbench } from "./agent-workbench-doctor.mjs";
import { planAgentWorkbenchMcpRegistration, applyAgentWorkbenchMcpRegistration } from "./agent-workbench-mcp-registration.mjs";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-wbdoctor-workspace-"));
const root = path.join(workspace, "current");
const sibling = path.join(workspace, "sibling");
for (const repoRoot of [root, sibling]) { fs.mkdirSync(path.join(repoRoot, ".evavo"), { recursive: true }); fs.mkdirSync(path.join(repoRoot, "scripts"), { recursive: true }); fs.mkdirSync(path.join(repoRoot, "schemas"), { recursive: true }); }
const repository = "EVAVO-STUDIO/test";
const siblingRepository = "EVAVO-STUDIO/test-sibling";
const authority = "test";
const orientationGuide = "WORKBENCH_FIRST.md";
const observationProvenance = "observedFromRepositories";
const entrypoints = { compileSnapshot:"scripts/a", awarenessTest:"scripts/awareness", verifyAwareness:"scripts/verify-awareness", awarenessVerifierTest:"scripts/awareness-verifier", fleet:"scripts/fleet", fleetTest:"scripts/fleet-test", verifyFleet:"scripts/verify-fleet", verify:"scripts/b", compileHandoff:"scripts/c", guide:"scripts/d", guideTest:"scripts/e", verifyGuidance:"scripts/f", mcp:"scripts/g", mcpSmoke:"scripts/h", mcpV2:"scripts/agent-workbench-mcp-v2.mjs", mcpV2Smoke:"scripts/j", sharedDrift:"scripts/agent-workbench-shared-drift.mjs", sharedDriftTest:"scripts/test-agent-workbench-shared-drift.mjs" };
const schemas = { config:"schemas/a", snapshot:"schemas/b", handoff:"schemas/c", guidance:"schemas/d", fleet:"schemas/e" };
const truthBoundary = { mcpLaunchEvidenceAuthorizesExecution:false, mcpLaunchEvidenceRetainsEnvironmentValues:false, mcpLaunchEvidenceRetainsArgumentValues:false, fleetAuthorizesExecution:false, fleetClaimsProviderCompleteness:false, fleetAllowsAbsenceClaims:false, fleetCanonicalRouteOwnershipApplied:true, fleetDuplicateRoutesCollapsed:true, sharedDriftCheckReadOnly:true, sharedDriftAutomaticRepair:false, sharedDriftUnavailableDoesNotProveAlignment:true };
const tools = ["evavo_agent_workbench_capabilities", "evavo_agent_workbench_snapshot", "evavo_agent_workbench_fleet", "evavo_agent_workbench_shared_drift", "evavo_agent_workbench_guide", "evavo_agent_workbench_handoff"];
fs.writeFileSync(path.join(root, orientationGuide), "# Workbench First\n");
fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.v1.json"), JSON.stringify({ contractVersion: "evavo_agent_workbench_config_v1", repository, authority, readFirst: [orientationGuide] }));
fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.contracts.v1.json"), JSON.stringify({ contractVersion:"evavo_agent_workbench_contract_bundle_v1", repository, authority, orientationGuide, mcpV2:".evavo/agent-workbench.mcp.v2.json", entrypoints, schemas, truthBoundary }));
fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.mcp.v2.json"), JSON.stringify({ contractVersion:"evavo_agent_workbench_mcp_v2", repository, authority, protocolVersion:"2025-03-26", supportedProtocolVersions:["2025-03-26","2026-07-28"], evavoDiscoveryMethod:"server/discover", readOnly:true, tools, fleet:{ schema:schemas.fleet, compiler:entrypoints.fleet, verifier:entrypoints.verifyFleet, scope:"local-workbench-enabled-siblings", canonicalRouteOwnership:true, duplicateRoutesCollapsed:true, observationProvenance }, sharedDrift:{ inspector:entrypoints.sharedDrift, test:entrypoints.sharedDriftTest, scope:"workspace-root-direct-children", comparisonBasis:"byte-identical-sha256" }, truthBoundary:{ grantsExecutionAuthority:false, grantsMutationAuthority:false, grantsPublicationAuthority:false, guidanceProvesReadiness:false, fleetAuthorizesExecution:false, fleetClaimsProviderCompleteness:false, fleetAllowsAbsenceClaims:false, fleetCanonicalRouteOwnershipApplied:true, fleetDuplicateRoutesCollapsed:true, sharedDriftAuthorizesExecution:false, sharedDriftAuthorizesMutation:false, sharedDriftAutomaticRepair:false, sharedDriftUnavailableDoesNotProveAlignment:true } }));
for (const relative of [...Object.values(entrypoints), "scripts/agent-workbench-mcp-registration.mjs", "scripts/test-agent-workbench-mcp-registration.mjs", ...Object.values(schemas)]) { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive:true }); if (!fs.existsSync(target)) fs.writeFileSync(target, "//fixture\n"); }
fs.writeFileSync(path.join(root, ".mcp.json"), JSON.stringify({ mcpServers: { existing: { command:"existing", args:[] } } }, null, 2));
const sharedPaths = ["WORKBENCH_FIRST.md", "scripts/agent-workbench.mjs", "scripts/test-agent-workbench-awareness.mjs", "scripts/verify-agent-workbench-awareness.mjs", "scripts/test-agent-workbench-awareness-verifier.mjs", "scripts/agent-workbench-fleet.mjs", "scripts/test-agent-workbench-fleet.mjs", "scripts/verify-agent-workbench-fleet.mjs", "scripts/verify-agent-workbench.mjs", "scripts/compile-agent-workbench-handoff.mjs", "scripts/agent-workbench-guide.mjs", "scripts/test-agent-workbench-guide.mjs", "scripts/verify-agent-workbench-guidance.mjs", "scripts/agent-workbench-mcp.mjs", "scripts/test-agent-workbench-mcp.mjs", "scripts/agent-workbench-mcp-v2.mjs", "scripts/test-agent-workbench-mcp-v2.mjs", "scripts/agent-workbench-mcp-registration.mjs", "scripts/test-agent-workbench-mcp-registration.mjs", "scripts/agent-workbench-doctor.mjs", "scripts/test-agent-workbench-doctor.mjs", "scripts/agent-workbench-shared-drift.mjs", "scripts/test-agent-workbench-shared-drift.mjs", "schemas/evavo.agent-workbench-config.schema.json", "schemas/evavo.agent-workbench-snapshot.schema.json", "schemas/evavo.agent-workbench-handoff.schema.json", "schemas/evavo.agent-workbench-guidance.schema.json", "schemas/evavo.agent-workbench-fleet.schema.json"];
for (const relative of sharedPaths) { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive:true }); if (!fs.existsSync(target)) fs.writeFileSync(target, relative === orientationGuide ? "# Workbench First\n" : "//shared-fixture\n"); const siblingTarget = path.join(sibling, relative); fs.mkdirSync(path.dirname(siblingTarget), { recursive:true }); fs.copyFileSync(target, siblingTarget); }
fs.writeFileSync(path.join(sibling, ".evavo", "agent-workbench.v1.json"), JSON.stringify({ contractVersion:"evavo_agent_workbench_config_v1", repository:siblingRepository, authority:"sibling" }));
let result = inspectAgentWorkbench(root, { workspaceRoot: workspace });
if (result.status !== "repair-required" || result.registration.state !== "missing") throw new Error("doctor did not identify missing registration");
if (result.protocol.toolCount !== 6 || result.sharedDrift.status !== "aligned" || result.sharedDrift.comparedRepositoryCount !== 1 || result.sharedDrift.mismatchCount !== 0) throw new Error("doctor did not prove six-tool aligned shared health");
if (result.orientation.guide !== orientationGuide || result.orientation.readFirst !== true) throw new Error("doctor did not retain Workbench First orientation");
if (result.fleet.canonicalRouteOwnershipApplied !== true || result.fleet.duplicateRoutesCollapsed !== true || result.fleet.observationProvenance !== observationProvenance) throw new Error("doctor did not retain canonical fleet routing semantics");
if (result.policy.sharedDriftCheckReadOnly !== true || result.policy.sharedDriftUnavailableDoesNotProveAlignment !== true || result.policy.sharedDriftAutomaticRepair !== false) throw new Error("doctor shared drift policy mismatch");
const plan = planAgentWorkbenchMcpRegistration(root); applyAgentWorkbenchMcpRegistration(plan);
result = inspectAgentWorkbench(root, { workspaceRoot: workspace });
if (result.status !== "ready" || result.registration.state !== "registered" || result.artifactCount !== 26) throw new Error("doctor did not reach six-tool ready state after registration");
fs.writeFileSync(path.join(sibling, "scripts", "verify-agent-workbench-guidance.mjs"), "//intentional-drift\n");
result = inspectAgentWorkbench(root, { workspaceRoot: workspace });
if (result.status !== "repair-required" || result.registration.state !== "registered" || result.sharedDrift.status !== "drifted" || result.sharedDrift.mismatchCount !== 1) throw new Error("shared drift did not fail health independently of registration");
if (!result.findings.some((item) => item.code === "workbench-shared-files-drifted" && item.severity === "error")) throw new Error("shared drift finding missing");
fs.rmSync(workspace, { recursive: true, force: true });
console.log(JSON.stringify({ contract:"evavo_agent_workbench_doctor_test_v9", status:"passed", assertions:14 }, null, 2));
