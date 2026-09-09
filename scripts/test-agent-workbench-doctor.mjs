#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectAgentWorkbench } from "./agent-workbench-doctor.mjs";
import { planAgentWorkbenchMcpRegistration, applyAgentWorkbenchMcpRegistration } from "./agent-workbench-mcp-registration.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-wbdoctor-"));
fs.mkdirSync(path.join(root, ".evavo"), { recursive: true });
fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
const repository = "EVAVO-STUDIO/test";
const authority = "test";
fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.v1.json"), JSON.stringify({ contractVersion: "evavo_agent_workbench_config_v1", repository, authority }));
const entrypoints = { compileSnapshot:"scripts/a", awarenessTest:"scripts/awareness", verifyAwareness:"scripts/verify-awareness", awarenessVerifierTest:"scripts/awareness-verifier", fleet:"scripts/fleet", fleetTest:"scripts/fleet-test", verifyFleet:"scripts/verify-fleet", verify:"scripts/b", compileHandoff:"scripts/c", guide:"scripts/d", guideTest:"scripts/e", verifyGuidance:"scripts/f", mcp:"scripts/g", mcpSmoke:"scripts/h", mcpV2:"scripts/agent-workbench-mcp-v2.mjs", mcpV2Smoke:"scripts/j" };
const schemas = { config:"schemas/a", snapshot:"schemas/b", handoff:"schemas/c", guidance:"schemas/d", fleet:"schemas/e" };
const truthBoundary = { mcpLaunchEvidenceAuthorizesExecution:false, mcpLaunchEvidenceRetainsEnvironmentValues:false, mcpLaunchEvidenceRetainsArgumentValues:false, fleetAuthorizesExecution:false, fleetClaimsProviderCompleteness:false, fleetAllowsAbsenceClaims:false };
fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.contracts.v1.json"), JSON.stringify({ contractVersion:"evavo_agent_workbench_contract_bundle_v1", repository, authority, mcpV2:".evavo/agent-workbench.mcp.v2.json", entrypoints, schemas, truthBoundary }));
fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.mcp.v2.json"), JSON.stringify({ contractVersion: "evavo_agent_workbench_mcp_v2", repository, authority, protocolVersion:"2025-03-26", supportedProtocolVersions:["2025-03-26","2026-07-28"], evavoDiscoveryMethod:"server/discover", readOnly: true, tools: ["evavo_agent_workbench_capabilities", "evavo_agent_workbench_snapshot", "evavo_agent_workbench_fleet", "evavo_agent_workbench_guide", "evavo_agent_workbench_handoff"], fleet:{ schema:schemas.fleet, compiler:entrypoints.fleet, verifier:entrypoints.verifyFleet, scope:"local-workbench-enabled-siblings" }, truthBoundary: { grantsExecutionAuthority: false, grantsMutationAuthority: false, grantsPublicationAuthority: false, guidanceProvesReadiness: false, fleetAuthorizesExecution:false, fleetClaimsProviderCompleteness:false, fleetAllowsAbsenceClaims:false } }));
for (const relative of [...Object.values(entrypoints), "scripts/agent-workbench-mcp-registration.mjs", "scripts/test-agent-workbench-mcp-registration.mjs", ...Object.values(schemas)]) {
  const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive:true }); if (!fs.existsSync(target)) fs.writeFileSync(target, "//fixture\n");
}
fs.writeFileSync(path.join(root, ".mcp.json"), JSON.stringify({ mcpServers: { existing: { command:"existing", args:[] } } }, null, 2));
let result = inspectAgentWorkbench(root);
if (result.status !== "repair-required" || result.registration.state !== "missing") throw new Error("doctor did not identify missing registration");
if (result.protocol.dualProtocolReady !== true || result.awareness.sanitizedMcpEvidenceRequired !== true) throw new Error("doctor did not report current protocol/awareness readiness");
if (result.fleet.toolExposed !== true || result.fleet.localSiblingDiscoveryOnly !== true || result.fleet.absenceClaimsAllowed !== false) throw new Error("doctor did not retain fleet tool/truth boundary");
const plan = planAgentWorkbenchMcpRegistration(root); applyAgentWorkbenchMcpRegistration(plan);
result = inspectAgentWorkbench(root);
if (result.status !== "ready" || result.registration.state !== "registered") throw new Error("doctor did not reach ready after registration");
if (result.artifactCount !== 23) throw new Error(`unexpected artifact count ${result.artifactCount}`);
console.log(JSON.stringify({ contract:"evavo_agent_workbench_doctor_test_v4", status:"passed", assertions:9 }, null, 2));
