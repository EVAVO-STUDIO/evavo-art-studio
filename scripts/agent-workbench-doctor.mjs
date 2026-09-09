#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { planAgentWorkbenchMcpRegistration, applyAgentWorkbenchMcpRegistration } from "./agent-workbench-mcp-registration.mjs";

const CONTRACT = "evavo_agent_workbench_doctor_v1";
const STANDARD_PROTOCOL = "2025-03-26";
const EVAVO_DISCOVERY_PROTOCOL = "2026-07-28";
const FLEET_SCOPE = "local-workbench-enabled-siblings";
const ORIENTATION_GUIDE = "WORKBENCH_FIRST.md";
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw new Error(message); };

function readRegularJson(filePath, label) {
  const metadata = fs.lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`${label} must be a regular non-link file.`);
  const bytes = fs.readFileSync(filePath);
  return { value: JSON.parse(bytes.toString("utf8")), evidence: { path: filePath, sha256: digest(bytes), bytes: bytes.length } };
}

function safeFile(root, relative, label) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.includes("..")) fail(`${label} must be a repository-relative path.`);
  const filePath = path.join(root, relative);
  const metadata = fs.lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`${label} is missing or unsafe: ${relative}`);
  return filePath;
}

export function inspectAgentWorkbench(root) {
  const repositoryRoot = path.resolve(root);
  const configRead = readRegularJson(path.join(repositoryRoot, ".evavo", "agent-workbench.v1.json"), "workbench config");
  const bundleRead = readRegularJson(path.join(repositoryRoot, ".evavo", "agent-workbench.contracts.v1.json"), "workbench bundle");
  const descriptorRead = readRegularJson(path.join(repositoryRoot, ".evavo", "agent-workbench.mcp.v2.json"), "workbench MCP v2 descriptor");
  const config = configRead.value;
  const bundle = bundleRead.value;
  const descriptor = descriptorRead.value;

  if (config.contractVersion !== "evavo_agent_workbench_config_v1") fail("Workbench config contract mismatch.");
  if (bundle.contractVersion !== "evavo_agent_workbench_contract_bundle_v1") fail("Workbench bundle contract mismatch.");
  if (bundle.orientationGuide !== ORIENTATION_GUIDE) fail("Workbench orientation guide contract mismatch.");
  if (!Array.isArray(config.readFirst) || config.readFirst[0] !== ORIENTATION_GUIDE) fail("Workbench config must read WORKBENCH_FIRST.md first.");
  if (descriptor.contractVersion !== "evavo_agent_workbench_mcp_v2") fail("Workbench MCP v2 descriptor contract mismatch.");
  if (config.repository !== bundle.repository || config.repository !== descriptor.repository || config.authority !== bundle.authority || config.authority !== descriptor.authority) fail("Workbench identity mismatch across config/bundle/descriptor.");

  const expectedTools = [
    "evavo_agent_workbench_capabilities",
    "evavo_agent_workbench_snapshot",
    "evavo_agent_workbench_fleet",
    "evavo_agent_workbench_guide",
    "evavo_agent_workbench_handoff",
  ];
  if (JSON.stringify(descriptor.tools) !== JSON.stringify(expectedTools)) fail("Workbench MCP v2 tool set mismatch.");
  if (descriptor.protocolVersion !== STANDARD_PROTOCOL || !Array.isArray(descriptor.supportedProtocolVersions) || !descriptor.supportedProtocolVersions.includes(STANDARD_PROTOCOL) || !descriptor.supportedProtocolVersions.includes(EVAVO_DISCOVERY_PROTOCOL) || descriptor.evavoDiscoveryMethod !== "server/discover") fail("Workbench MCP v2 dual-protocol contract mismatch.");
  if (descriptor.fleet?.schema !== bundle.schemas?.fleet || descriptor.fleet?.compiler !== bundle.entrypoints?.fleet || descriptor.fleet?.verifier !== bundle.entrypoints?.verifyFleet || descriptor.fleet?.scope !== FLEET_SCOPE) fail("Workbench MCP v2 fleet binding mismatch.");
  if (descriptor.readOnly !== true || descriptor.truthBoundary?.grantsExecutionAuthority !== false || descriptor.truthBoundary?.grantsMutationAuthority !== false || descriptor.truthBoundary?.grantsPublicationAuthority !== false || descriptor.truthBoundary?.guidanceProvesReadiness !== false || descriptor.truthBoundary?.fleetAuthorizesExecution !== false || descriptor.truthBoundary?.fleetClaimsProviderCompleteness !== false || descriptor.truthBoundary?.fleetAllowsAbsenceClaims !== false) fail("Workbench MCP v2 truth boundary mismatch.");
  if (bundle.truthBoundary?.mcpLaunchEvidenceAuthorizesExecution !== false || bundle.truthBoundary?.mcpLaunchEvidenceRetainsEnvironmentValues !== false || bundle.truthBoundary?.mcpLaunchEvidenceRetainsArgumentValues !== false) fail("Workbench awareness truth boundary mismatch.");
  if (bundle.truthBoundary?.fleetAuthorizesExecution !== false || bundle.truthBoundary?.fleetClaimsProviderCompleteness !== false || bundle.truthBoundary?.fleetAllowsAbsenceClaims !== false) fail("Workbench fleet truth boundary mismatch.");

  const requiredPaths = [
    bundle.orientationGuide,
    bundle.entrypoints?.compileSnapshot,
    bundle.entrypoints?.awarenessTest,
    bundle.entrypoints?.verifyAwareness,
    bundle.entrypoints?.awarenessVerifierTest,
    bundle.entrypoints?.fleet,
    bundle.entrypoints?.fleetTest,
    bundle.entrypoints?.verifyFleet,
    bundle.entrypoints?.verify,
    bundle.entrypoints?.compileHandoff,
    bundle.entrypoints?.guide,
    bundle.entrypoints?.guideTest,
    bundle.entrypoints?.verifyGuidance,
    bundle.entrypoints?.mcp,
    bundle.entrypoints?.mcpSmoke,
    bundle.entrypoints?.mcpV2,
    bundle.entrypoints?.mcpV2Smoke,
    "scripts/agent-workbench-mcp-registration.mjs",
    "scripts/test-agent-workbench-mcp-registration.mjs",
    bundle.schemas?.config,
    bundle.schemas?.snapshot,
    bundle.schemas?.handoff,
    bundle.schemas?.guidance,
    bundle.schemas?.fleet,
  ].filter(Boolean);

  const artifacts = requiredPaths.map((relative) => {
    const filePath = safeFile(repositoryRoot, relative, "workbench artifact");
    const bytes = fs.readFileSync(filePath);
    return { path: relative, sha256: digest(bytes), bytes: bytes.length };
  });

  const registration = planAgentWorkbenchMcpRegistration(repositoryRoot);
  const registrationState = registration.alreadyExact ? "registered" : registration.existingEntryWasDifferent ? "drifted" : "missing";
  const findings = [];
  if (!registration.alreadyExact) findings.push({ severity: "repair", code: "workbench-mcp-v2-registration-not-exact", state: registrationState, action: "node scripts/agent-workbench-mcp-registration.mjs --write" });

  return {
    contract: CONTRACT,
    generatedAt: new Date().toISOString(),
    repository: config.repository,
    authority: config.authority,
    status: findings.length === 0 ? "ready" : "repair-required",
    contracts: { config: configRead.evidence, bundle: bundleRead.evidence, mcpV2: descriptorRead.evidence },
    orientation: { guide: ORIENTATION_GUIDE, readFirst: true },
    protocol: { standard: STANDARD_PROTOCOL, evavoDiscovery: EVAVO_DISCOVERY_PROTOCOL, dualProtocolReady: true },
    awareness: { required: true, sanitizedMcpEvidenceRequired: true, siblingToolRegistryDiscoverySupported: true },
    fleet: { required: true, toolExposed: true, localSiblingDiscoveryOnly: true, providerEstateCompletenessClaimed: false, absenceClaimsAllowed: false },
    artifactCount: artifacts.length,
    artifacts,
    registration: {
      state: registrationState,
      serverName: registration.serverName,
      alreadyExact: registration.alreadyExact,
      existingEntryPresent: registration.existingEntryPresent,
      existingEntryWasDifferent: registration.existingEntryWasDifferent,
      beforeSha256: registration.beforeSha256,
      afterSha256: registration.afterSha256,
    },
    findings,
    policy: {
      readOnlyByDefault: true,
      doctorExecutesCandidateCommands: false,
      doctorGrantsExecutionAuthority: false,
      doctorGrantsMutationAuthority: false,
      doctorGrantsPublicationAuthority: false,
      mcpLaunchEvidenceAuthorizesExecution: false,
      mcpLaunchEvidenceRetainsEnvironmentValues: false,
      mcpLaunchEvidenceRetainsArgumentValues: false,
      fleetAuthorizesExecution: false,
      fleetClaimsProviderCompleteness: false,
      fleetAllowsAbsenceClaims: false,
      repairScope: ".mcp.json workbench v2 registration only",
    },
  };
}

function parse(argv) {
  const options = { root: null, repairRegistration: false, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root") options.root = argv[++index] ?? null;
    else if (token === "--repair-registration") options.repairRegistration = true;
    else if (token === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${token}`);
  }
  return options;
}

function selfTest() {
  if (digest(Buffer.from("test")).length !== 64 || STANDARD_PROTOCOL === EVAVO_DISCOVERY_PROTOCOL || FLEET_SCOPE !== "local-workbench-enabled-siblings" || ORIENTATION_GUIDE !== "WORKBENCH_FIRST.md") fail("doctor self-test failed");
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_doctor_self_test_v3", status: "passed", assertions: 4 }, null, 2)}\n`);
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.selfTest) return selfTest();
  const root = path.resolve(options.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  let result = inspectAgentWorkbench(root);
  let repair = null;
  if (options.repairRegistration && result.registration.alreadyExact !== true) {
    const plan = planAgentWorkbenchMcpRegistration(root);
    repair = applyAgentWorkbenchMcpRegistration(plan);
    result = inspectAgentWorkbench(root);
    if (result.status !== "ready") fail("Workbench doctor registration repair did not reach ready state.");
  }
  process.stdout.write(`${JSON.stringify({ ...result, repair: repair ? { registrationWritePerformed: repair.written, backupPath: repair.backupPath } : null }, null, 2)}\n`);
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; }
}
