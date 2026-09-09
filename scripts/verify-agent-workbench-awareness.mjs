#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CONTRACT = "evavo_agent_workbench_awareness_verification_v1";
const SNAPSHOT_CONTRACT = "evavo_agent_workbench_snapshot_v1";
const TOOL_REGISTRY_ORIGINS = new Set(["explicit", "repository-config", "sibling-development-studio", "unavailable"]);
const ESTATE_ORIGINS = new Set(["explicit", "development-studio-latest-estate-audit", "unavailable"]);
const HEX64 = /^[a-f0-9]{64}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const FORBIDDEN_MCP_FIELDS = new Set(["args", "env", "environment", "command", "environmentValues", "argumentValues"]);
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value) => typeof value === "string" ? value.trim() : "";
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function readJson(filePath) {
  const resolved = path.resolve(filePath);
  const metadata = fs.lstatSync(resolved);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), "Snapshot must be a regular non-link file.");
  const bytes = fs.readFileSync(resolved);
  return { path: resolved, bytes, sha256: digest(bytes), value: JSON.parse(bytes.toString("utf8")) };
}

function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer.`);
}

function verifyBase(value) {
  assert(record(value) && value.contract === SNAPSHOT_CONTRACT, `Snapshot contract must be ${SNAPSHOT_CONTRACT}.`);
  assert(REPOSITORY.test(text(value.repository)), "Snapshot repository identity is invalid.");
  assert(text(value.authority), "Snapshot authority is required.");
  assert(record(value.sourceEvidence), "Snapshot sourceEvidence is required.");
  assert(record(value.inventory), "Snapshot inventory is required.");
  assert(record(value.discovery), "Current awareness snapshot discovery block is required.");
  assert(record(value.matches), "Snapshot matches are required.");
  assert(Array.isArray(value.matches.tools), "Snapshot matches.tools must be an array.");
  assert(Array.isArray(value.matches.estateCapabilities), "Snapshot matches.estateCapabilities must be an array.");
  assert(record(value.policy), "Snapshot policy is required.");
  assert(value.policy.readOnlyCompiler === true, "Snapshot must remain read-only.");
  assert(value.policy.commandExecutionPerformed === false, "Snapshot must prove commandExecutionPerformed=false.");
  assert(value.policy.mutationPerformed === false, "Snapshot must prove mutationPerformed=false.");
  assert(value.policy.sourceCapabilityDoesNotImplyRuntimeReadiness === true, "Snapshot must retain source/runtime separation.");
  assert(value.policy.routeDoesNotAuthorizeEffects === true, "Snapshot route must not authorize effects.");
  assert(value.policy.planDoesNotProveExecution === true, "Snapshot plan must not prove execution.");
  assert(value.policy.publicationRequiresSeparateAuthority === true, "Snapshot must retain publication authority separation.");
}

export function verifyAgentWorkbenchAwareness(snapshotRead) {
  const value = snapshotRead?.value;
  verifyBase(value);
  const inventory = value.inventory;
  for (const [key, observed] of Object.entries({
    capabilityCount: inventory.capabilityCount,
    packageScriptCount: inventory.packageScriptCount,
    toolCount: inventory.toolCount,
    registeredToolCount: inventory.registeredToolCount,
    mcpServerCount: inventory.mcpServerCount,
    estateCapabilityCount: inventory.estateCapabilityCount,
  })) nonNegativeInteger(observed, `inventory.${key}`);
  assert(inventory.registeredToolCount + inventory.mcpServerCount <= inventory.toolCount, "Inventory tool counts are inconsistent.");

  const discovery = value.discovery;
  assert(TOOL_REGISTRY_ORIGINS.has(discovery.toolRegistryOrigin), "discovery.toolRegistryOrigin is invalid.");
  assert(typeof discovery.siblingDevelopmentStudioRegistryAutoDiscovered === "boolean", "Sibling registry discovery flag must be boolean.");
  assert(typeof discovery.mcpLaunchManifestObserved === "boolean", "MCP launch observation flag must be boolean.");
  assert(typeof discovery.mcpLaunchManifestSanitized === "boolean", "MCP launch sanitization flag must be boolean.");
  assert(ESTATE_ORIGINS.has(discovery.estateSnapshotOrigin), "discovery.estateSnapshotOrigin is invalid.");
  assert(typeof discovery.developmentEstateAuditAutoDiscovered === "boolean", "Development estate audit discovery flag must be boolean.");
  assert(typeof discovery.estateEvidenceComplete === "boolean", "Estate evidence completeness flag must be boolean.");
  assert(discovery.siblingDevelopmentStudioRegistryAutoDiscovered === (discovery.toolRegistryOrigin === "sibling-development-studio"), "Sibling registry discovery flag does not match its origin.");
  assert(discovery.developmentEstateAuditAutoDiscovered === (discovery.estateSnapshotOrigin === "development-studio-latest-estate-audit"), "Development estate audit discovery flag does not match its origin.");
  if (discovery.toolRegistryOrigin === "unavailable") {
    assert(value.sourceEvidence.toolRegistry === undefined, "Unavailable tool registry must not claim source evidence.");
  } else {
    assert(record(value.sourceEvidence.toolRegistry), "Observed tool registry requires source evidence.");
  }

  const mcpEvidence = value.sourceEvidence.mcpLaunchManifest;
  if (discovery.mcpLaunchManifestObserved) {
    assert(discovery.mcpLaunchManifestSanitized === true, "Observed MCP launch evidence must be sanitized.");
    assert(record(mcpEvidence), "Observed MCP launch manifest requires sourceEvidence.mcpLaunchManifest.");
    assert(HEX64.test(text(mcpEvidence.sha256)), "Sanitized MCP launch evidence SHA-256 is invalid.");
    nonNegativeInteger(mcpEvidence.bytes, "sourceEvidence.mcpLaunchManifest.bytes");
    assert(mcpEvidence.sanitized === true, "MCP launch evidence must declare sanitized=true.");
    assert(mcpEvidence.rawEnvironmentValuesRetained === false, "MCP launch evidence must not retain environment values.");
    assert(mcpEvidence.rawArgumentValuesRetained === false, "MCP launch evidence must not retain argument values.");
    assert(value.policy.mcpRegistrationDoesNotImplyRuntimeReadiness === true, "MCP registration must not imply runtime readiness.");
    assert(value.policy.mcpEnvironmentValuesRetained === false, "Snapshot policy must forbid retaining MCP environment values.");
    assert(value.policy.mcpArgumentValuesRetained === false, "Snapshot policy must forbid retaining MCP argument values.");
  } else {
    assert(discovery.mcpLaunchManifestSanitized === false, "Unobserved MCP launch manifest cannot be marked sanitized.");
    assert(mcpEvidence === undefined, "Unobserved MCP launch manifest must not claim source evidence.");
    assert(inventory.mcpServerCount === 0, "Unobserved MCP launch manifest must have mcpServerCount=0.");
  }

  let visibleMcpTools = 0;
  for (const candidate of value.matches.tools) {
    const item = record(candidate);
    assert(item, "Tool match entries must be objects.");
    if (item.source !== "root-mcp-launch-manifest") continue;
    visibleMcpTools += 1;
    assert(text(item.id).startsWith("mcp:"), "MCP launch tool id must start with mcp:.");
    assert(item.runtimeReadiness === "unknown", "MCP launch registration must keep runtimeReadiness=unknown.");
    nonNegativeInteger(item.argumentCount, `tool:${item.id}:argumentCount`);
    assert(Array.isArray(item.environmentKeys) && item.environmentKeys.every((entry) => typeof entry === "string"), `tool:${item.id}:environmentKeys must be strings.`);
    assert(typeof item.commandBaseName === "string", `tool:${item.id}:commandBaseName must be a string.`);
    for (const field of FORBIDDEN_MCP_FIELDS) assert(!(field in item), `MCP launch tool ${item.id} retains forbidden field: ${field}.`);
  }
  assert(visibleMcpTools <= inventory.mcpServerCount, "Visible MCP tool matches exceed inventory.mcpServerCount.");

  const estateEvidence = value.sourceEvidence.estateSnapshot;
  const estate = inventory.estate;
  if (discovery.estateSnapshotOrigin === "unavailable") {
    assert(estateEvidence === undefined, "Unavailable estate snapshot must not claim source evidence.");
    assert(estate === null, "Unavailable estate snapshot must have inventory.estate=null.");
    assert(inventory.estateCapabilityCount === 0, "Unavailable estate snapshot must have estateCapabilityCount=0.");
    assert(discovery.estateEvidenceComplete === false, "Unavailable estate snapshot cannot be complete.");
    assert(value.policy.incompleteEstateCannotProveAbsence === true, "Unavailable estate evidence must forbid absence claims.");
  } else {
    assert(record(estateEvidence), "Observed estate snapshot requires sourceEvidence.estateSnapshot.");
    assert(HEX64.test(text(estateEvidence.sha256)), "Estate source evidence SHA-256 is invalid.");
    nonNegativeInteger(estateEvidence.bytes, "sourceEvidence.estateSnapshot.bytes");
    assert(record(estate), "Observed estate snapshot requires inventory.estate.");
    assert(typeof estate.evidenceComplete === "boolean", "inventory.estate.evidenceComplete must be boolean.");
    assert(estate.evidenceComplete === discovery.estateEvidenceComplete, "Estate completeness does not match discovery state.");
    assert(estate.absenceClaimsAllowed === estate.evidenceComplete, "Estate absence semantics must follow evidence completeness.");
    assert(value.policy.incompleteEstateCannotProveAbsence === !estate.evidenceComplete, "Snapshot absence policy does not follow estate completeness.");
    assert(value.policy.estateAutoDiscoveryRunsProviderQueries === false, "Workbench estate auto-discovery must not run provider queries.");
  }

  let visibleEstateCapabilities = 0;
  for (const candidate of value.matches.estateCapabilities) {
    const item = record(candidate);
    assert(item && text(item.id), "Estate capability match entries must have an id.");
    assert(REPOSITORY.test(text(item.repository)), `Estate capability ${item.id} repository identity is invalid.`);
    assert(item.runtimeReadiness === "unknown", `Estate capability ${item.id} must keep runtimeReadiness=unknown.`);
    if (item.evidenceState === "validated-standard-manifest") assert(item.manifestStatus === "valid", `Estate capability ${item.id} validated evidence requires manifestStatus=valid.`);
    visibleEstateCapabilities += 1;
  }
  assert(visibleEstateCapabilities <= inventory.estateCapabilityCount, "Visible estate capability matches exceed inventory.estateCapabilityCount.");

  return Object.freeze({
    contract: CONTRACT,
    status: "passed",
    repository: value.repository,
    toolRegistryOrigin: discovery.toolRegistryOrigin,
    estateSnapshotOrigin: discovery.estateSnapshotOrigin,
    estateEvidenceComplete: discovery.estateEvidenceComplete,
    registeredToolCount: inventory.registeredToolCount,
    mcpServerCount: inventory.mcpServerCount,
    estateCapabilityCount: inventory.estateCapabilityCount,
    visibleMcpToolMatches: visibleMcpTools,
    visibleEstateCapabilityMatches: visibleEstateCapabilities,
    truthBoundary: Object.freeze({
      mcpRegistrationProvesRuntimeReadiness: false,
      estateCapabilityProvesRuntimeReadiness: false,
      estateAutoDiscoveryRunsProviderQueries: false,
      rawMcpEnvironmentValuesRetained: false,
      rawMcpArgumentValuesRetained: false,
      executionAuthorityGranted: false,
      mutationAuthorityGranted: false,
      publicationAuthorityGranted: false,
    }),
  });
}

function selfTest() {
  const evidence = { path: "/tmp/test", sha256: "a".repeat(64), bytes: 1 };
  const snapshot = {
    contract: SNAPSHOT_CONTRACT,
    repository: "EVAVO-STUDIO/test",
    authority: "test",
    sourceEvidence: {
      workbenchConfig: evidence,
      capabilityManifest: evidence,
      packageManifest: evidence,
      toolRegistry: evidence,
      mcpLaunchManifest: { ...evidence, sanitized: true, rawEnvironmentValuesRetained: false, rawArgumentValuesRetained: false },
      estateSnapshot: evidence,
    },
    inventory: {
      capabilityCount: 1,
      packageScriptCount: 1,
      toolCount: 2,
      registeredToolCount: 1,
      mcpServerCount: 1,
      estateCapabilityCount: 1,
      estate: { evidenceComplete: true, absenceClaimsAllowed: true },
    },
    discovery: {
      toolRegistryOrigin: "sibling-development-studio",
      siblingDevelopmentStudioRegistryAutoDiscovered: true,
      mcpLaunchManifestObserved: true,
      mcpLaunchManifestSanitized: true,
      estateSnapshotOrigin: "development-studio-latest-estate-audit",
      developmentEstateAuditAutoDiscovered: true,
      estateEvidenceComplete: true,
    },
    matches: {
      tools: [{ id: "mcp:test", source: "root-mcp-launch-manifest", runtimeReadiness: "unknown", commandBaseName: "node", argumentCount: 1, environmentKeys: ["MODE"] }],
      estateCapabilities: [{ id: "art.test", repository: "EVAVO-STUDIO/art", manifestStatus: "valid", evidenceState: "validated-standard-manifest", runtimeReadiness: "unknown" }],
    },
    policy: {
      readOnlyCompiler: true,
      commandExecutionPerformed: false,
      mutationPerformed: false,
      sourceCapabilityDoesNotImplyRuntimeReadiness: true,
      routeDoesNotAuthorizeEffects: true,
      planDoesNotProveExecution: true,
      publicationRequiresSeparateAuthority: true,
      incompleteEstateCannotProveAbsence: false,
      mcpRegistrationDoesNotImplyRuntimeReadiness: true,
      mcpEnvironmentValuesRetained: false,
      mcpArgumentValuesRetained: false,
      estateAutoDiscoveryRunsProviderQueries: false,
    },
  };
  const result = verifyAgentWorkbenchAwareness({ value: snapshot });
  assert(result.status === "passed", "Awareness verifier positive self-test failed.");
  assert(result.visibleMcpToolMatches === 1, "Awareness verifier MCP count self-test failed.");
  assert(result.visibleEstateCapabilityMatches === 1, "Awareness verifier estate count self-test failed.");
  const unsafeMcp = structuredClone(snapshot);
  unsafeMcp.matches.tools[0].args = ["secret"];
  let rejected = false;
  try { verifyAgentWorkbenchAwareness({ value: unsafeMcp }); } catch { rejected = true; }
  assert(rejected, "Awareness verifier must reject raw MCP args.");
  const unsafeEstate = structuredClone(snapshot);
  unsafeEstate.matches.estateCapabilities[0].runtimeReadiness = "ready";
  rejected = false;
  try { verifyAgentWorkbenchAwareness({ value: unsafeEstate }); } catch { rejected = true; }
  assert(rejected, "Awareness verifier must reject ready estate capability routes.");
  const unsafeAbsence = structuredClone(snapshot);
  unsafeAbsence.inventory.estate.evidenceComplete = false;
  rejected = false;
  try { verifyAgentWorkbenchAwareness({ value: unsafeAbsence }); } catch { rejected = true; }
  assert(rejected, "Awareness verifier must reject inconsistent estate absence semantics.");
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_awareness_verifier_self_test_v2", status: "passed", assertions: 6 }, null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--self-test") return selfTest();
  assert(args[0], "Usage: verify-agent-workbench-awareness.mjs <snapshot.json> | --self-test");
  const snapshotRead = readJson(args[0]);
  const result = verifyAgentWorkbenchAwareness(snapshotRead);
  process.stdout.write(`${JSON.stringify({ ...result, input: { path: snapshotRead.path, sha256: snapshotRead.sha256, bytes: snapshotRead.bytes.length } }, null, 2)}\n`);
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; }
}
