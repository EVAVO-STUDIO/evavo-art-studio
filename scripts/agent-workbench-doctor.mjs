#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { planAgentWorkbenchMcpRegistration, applyAgentWorkbenchMcpRegistration } from "./agent-workbench-mcp-registration.mjs";
import { inspectSharedWorkbenchDrift } from "./agent-workbench-shared-drift.mjs";

const CONTRACT = "evavo_agent_workbench_doctor_v1";
const STANDARD_PROTOCOL = "2025-03-26";
const EVAVO_DISCOVERY_PROTOCOL = "2026-07-28";
const FLEET_SCOPE = "local-workbench-enabled-siblings";
const FLEET_PROVENANCE = "observedFromRepositories";
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

export function inspectAgentWorkbench(root, options = {}) {
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
    "evavo_agent_workbench_handoff"
  ];
  if (JSON.stringify(descriptor.tools) !== JSON.stringify(expectedTools)) fail("Workbench MCP v2 tool set mismatch.");
  if (descriptor.protocolVersion !== STANDARD_PROTOCOL || !Array.isArray(descriptor.supportedProtocolVersions) || !descriptor.supportedProtocolVersions.includes(STANDARD_PROTOCOL) || !descriptor.supportedProtocolVersions.includes(EVAVO_DISCOVERY_PROTOCOL) || descriptor.evavoDiscoveryMethod !== "server/discover") fail("Workbench MCP v2 dual-protocol contract mismatch.");

  const fleet = descriptor.fleet ?? {};
  if (fleet.schema !== bundle.schemas?.fleet || fleet.compiler !== bundle.entrypoints?.fleet || fleet.verifier !== bundle.entrypoints?.verifyFleet || fleet.scope !== FLEET_SCOPE || fleet.canonicalRouteOwnership !== true || fleet.duplicateRoutesCollapsed !== true || fleet.observationProvenance !== FLEET_PROVENANCE) fail("Workbench MCP v2 fleet binding mismatch.");
  const descriptorTruth = descriptor.truthBoundary ?? {};
  if (descriptor.readOnly !== true || descriptorTruth.grantsExecutionAuthority !== false || descriptorTruth.grantsMutationAuthority !== false || descriptorTruth.grantsPublicationAuthority !== false || descriptorTruth.guidanceProvesReadiness !== false || descriptorTruth.fleetAuthorizesExecution !== false || descriptorTruth.fleetClaimsProviderCompleteness !== false || descriptorTruth.fleetAllowsAbsenceClaims !== false || descriptorTruth.fleetCanonicalRouteOwnershipApplied !== true || descriptorTruth.fleetDuplicateRoutesCollapsed !== true) fail("Workbench MCP v2 truth boundary mismatch.");

  const bundleTruth = bundle.truthBoundary ?? {};
  if (bundleTruth.mcpLaunchEvidenceAuthorizesExecution !== false || bundleTruth.mcpLaunchEvidenceRetainsEnvironmentValues !== false || bundleTruth.mcpLaunchEvidenceRetainsArgumentValues !== false) fail("Workbench awareness truth boundary mismatch.");
  if (bundleTruth.fleetAuthorizesExecution !== false || bundleTruth.fleetClaimsProviderCompleteness !== false || bundleTruth.fleetAllowsAbsenceClaims !== false || bundleTruth.fleetCanonicalRouteOwnershipApplied !== true || bundleTruth.fleetDuplicateRoutesCollapsed !== true) fail("Workbench fleet truth boundary mismatch.");
  if (bundleTruth.sharedDriftCheckReadOnly !== true || bundleTruth.sharedDriftAutomaticRepair !== false || bundleTruth.sharedDriftUnavailableDoesNotProveAlignment !== true) fail("Workbench shared drift truth boundary mismatch.");

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
    bundle.entrypoints?.sharedDrift,
    bundle.entrypoints?.sharedDriftTest,
    "scripts/agent-workbench-mcp-registration.mjs",
    "scripts/test-agent-workbench-mcp-registration.mjs",
    bundle.schemas?.config,
    bundle.schemas?.snapshot,
    bundle.schemas?.handoff,
    bundle.schemas?.guidance,
    bundle.schemas?.fleet
  ].filter(Boolean);

  const artifacts = requiredPaths.map((relative) => {
    const filePath = safeFile(repositoryRoot, relative, "workbench artifact");
    const bytes = fs.readFileSync(filePath);
    return { path: relative, sha256: digest(bytes), bytes: bytes.length };
  });

  const registration = planAgentWorkbenchMcpRegistration(repositoryRoot);
  const registrationState = registration.alreadyExact ? "registered" : registration.existingEntryWasDifferent ? "drifted" : "missing";
  const sharedDrift = inspectSharedWorkbenchDrift(repositoryRoot, { workspaceRoot: options.workspaceRoot });
  const findings = [];
  if (!registration.alreadyExact) findings.push({ severity: "repair", code: "workbench-mcp-v2-registration-not-exact", state: registrationState, action: "node scripts/agent-workbench-mcp-registration.mjs --write" });
  if (sharedDrift.status === "drifted") findings.push({ severity: "error", code: "workbench-shared-files-drifted", state: "drifted", mismatchCount: sharedDrift.mismatchCount, comparedRepositories: sharedDrift.comparedRepositories, action: "Align shared Workbench files from the canonical reviewed source; automatic drift repair is intentionally disabled." });

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
    fleet: {
      required: true,
      toolExposed: true,
      localSiblingDiscoveryOnly: true,
      providerEstateCompletenessClaimed: false,
      absenceClaimsAllowed: false,
      canonicalRouteOwnershipApplied: true,
      duplicateRoutesCollapsed: true,
      observationProvenance: FLEET_PROVENANCE
    },
    sharedDrift,
    artifactCount: artifacts.length,
    artifacts,
    registration: {
      state: registrationState,
      serverName: registration.serverName,
      alreadyExact: registration.alreadyExact,
      existingEntryPresent: registration.existingEntryPresent,
      existingEntryWasDifferent: registration.existingEntryWasDifferent,
      beforeSha256: registration.beforeSha256,
      afterSha256: registration.afterSha256
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
      fleetCanonicalRouteOwnershipApplied: true,
      fleetDuplicateRoutesCollapsed: true,
      sharedDriftCheckReadOnly: true,
      sharedDriftUnavailableDoesNotProveAlignment: true,
      sharedDriftAutomaticRepair: false,
      repairScope: ".mcp.json workbench v2 registration only"
    }
  };
}

function parse(argv) {
  const options = { root: null, workspaceRoot: null, repairRegistration: false, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root") options.root = argv[++index] ?? null;
    else if (token === "--workspace-root") options.workspaceRoot = argv[++index] ?? null;
    else if (token === "--repair-registration") options.repairRegistration = true;
    else if (token === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${token}`);
  }
  return options;
}

function selfTest() {
  const assertions = [
    digest(Buffer.from("test")).length === 64,
    STANDARD_PROTOCOL !== EVAVO_DISCOVERY_PROTOCOL,
    FLEET_SCOPE === "local-workbench-enabled-siblings",
    FLEET_PROVENANCE === "observedFromRepositories",
    ORIENTATION_GUIDE === "WORKBENCH_FIRST.md",
    CONTRACT === "evavo_agent_workbench_doctor_v1",
    typeof inspectSharedWorkbenchDrift === "function"
  ];
  if (assertions.some((value) => value !== true)) fail("doctor self-test failed");
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_doctor_self_test_v5", status: "passed", assertions: assertions.length }, null, 2)}\n`);
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.selfTest) return selfTest();
  const root = path.resolve(options.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const inspectOptions = { workspaceRoot: options.workspaceRoot };
  let result = inspectAgentWorkbench(root, inspectOptions);
  let repair = null;
  if (options.repairRegistration && result.registration.alreadyExact !== true) {
    const plan = planAgentWorkbenchMcpRegistration(root);
    repair = applyAgentWorkbenchMcpRegistration(plan);
    result = inspectAgentWorkbench(root, inspectOptions);
    if (result.status !== "ready") fail("Workbench doctor registration repair did not reach ready state; unresolved shared drift or another health finding remains.");
  }
  process.stdout.write(`${JSON.stringify({ ...result, repair: repair ? { registrationWritePerformed: repair.written, backupPath: repair.backupPath } : null }, null, 2)}\n`);
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; }
}
