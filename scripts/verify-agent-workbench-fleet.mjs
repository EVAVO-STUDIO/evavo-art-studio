#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CONTRACT = "evavo_agent_workbench_fleet_verification_v1";
const SNAPSHOT = "evavo_agent_workbench_fleet_snapshot_v1";
const TYPES = new Set(["capability", "tool", "estate-capability", "script"]);
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value) => typeof value === "string" ? value.trim() : "";
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function readJson(filePath) {
  const resolved = path.resolve(filePath);
  const metadata = fs.lstatSync(resolved);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), "Fleet snapshot must be a regular non-link file.");
  const bytes = fs.readFileSync(resolved);
  return { path: resolved, bytes, sha256: digest(bytes), value: JSON.parse(bytes.toString("utf8")) };
}
function integer(value, label) { assert(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer.`); }

export function verifyAgentWorkbenchFleet(read) {
  const value = record(read?.value);
  assert(value?.contract === SNAPSHOT, `Fleet contract must be ${SNAPSHOT}.`);
  assert(!Number.isNaN(Date.parse(text(value.generatedAt))), "Fleet generatedAt is invalid.");
  assert(value.scope === "local-workbench-enabled-siblings", "Fleet scope is invalid.");
  assert(text(value.workspaceRoot), "Fleet workspaceRoot is required.");
  const counts = record(value.counts);
  assert(counts, "Fleet counts are required.");
  for (const key of ["repositoryRootsObserved", "repositoriesCompiled", "compileErrors", "routeCandidates", "bestRoutes"]) integer(counts[key], `counts.${key}`);
  assert(counts.repositoriesCompiled + counts.compileErrors <= counts.repositoryRootsObserved, "Fleet repository counts are inconsistent.");
  assert(Array.isArray(value.repositories), "Fleet repositories must be an array.");
  assert(value.repositories.length === counts.repositoriesCompiled, "Fleet repositories length does not match counts.repositoriesCompiled.");
  assert(Array.isArray(value.bestRoutes), "Fleet bestRoutes must be an array.");
  assert(value.bestRoutes.length === counts.bestRoutes, "Fleet bestRoutes length does not match counts.bestRoutes.");
  assert(Array.isArray(value.errors), "Fleet errors must be an array.");
  assert(value.errors.length === counts.compileErrors, "Fleet errors length does not match counts.compileErrors.");
  for (const route of value.bestRoutes) {
    assert(record(route) && TYPES.has(route.type), "Fleet route type is invalid.");
    assert(text(route.id) && text(route.repository) && text(route.authority), "Fleet route identity is incomplete.");
    assert(Number.isFinite(route.relevance), "Fleet route relevance must be finite.");
    assert(Array.isArray(route.effects) && Array.isArray(route.requires), "Fleet route effects/requires must be arrays.");
    if (route.source === "root-mcp-launch-manifest") assert(route.runtimeReadiness === "unknown", "Fleet MCP launch routes must keep runtimeReadiness=unknown.");
  }
  const policy = record(value.policy);
  assert(policy?.readOnlyCompiler === true, "Fleet must be read-only.");
  assert(policy?.commandExecutionPerformed === false, "Fleet must prove commandExecutionPerformed=false.");
  assert(policy?.mutationPerformed === false, "Fleet must prove mutationPerformed=false.");
  assert(policy?.localSiblingDiscoveryOnly === true, "Fleet must remain local-sibling scoped.");
  assert(policy?.providerEstateCompletenessClaimed === false, "Fleet must not claim provider estate completeness.");
  assert(policy?.absenceClaimsAllowed === false, "Fleet must not allow absence claims.");
  assert(policy?.mcpRegistrationDoesNotImplyRuntimeReadiness === true, "Fleet must retain MCP registration/readiness separation.");
  assert(policy?.rawMcpEnvironmentValuesRetained === false, "Fleet must not retain raw MCP environment values.");
  assert(policy?.rawMcpArgumentValuesRetained === false, "Fleet must not retain raw MCP argument values.");
  return Object.freeze({ contract: CONTRACT, status: "passed", repositoriesCompiled: counts.repositoriesCompiled, compileErrors: counts.compileErrors, bestRoutes: counts.bestRoutes, truthBoundary: Object.freeze({ providerEstateCompletenessClaimed: false, absenceClaimsAllowed: false, executionAuthorityGranted: false, mutationAuthorityGranted: false, publicationAuthorityGranted: false }) });
}

function selfTest() {
  const value = { contract: SNAPSHOT, generatedAt: new Date(0).toISOString(), scope: "local-workbench-enabled-siblings", workspaceRoot: "/tmp", counts: { repositoryRootsObserved: 1, repositoriesCompiled: 1, compileErrors: 0, routeCandidates: 1, bestRoutes: 1 }, repositories: [{ repository: "EVAVO-STUDIO/test" }], bestRoutes: [{ type: "tool", id: "mcp:test", repository: "EVAVO-STUDIO/test", authority: "test", relevance: 1, source: "root-mcp-launch-manifest", effects: [], requires: [], runtimeReadiness: "unknown" }], errors: [], policy: { readOnlyCompiler: true, commandExecutionPerformed: false, mutationPerformed: false, localSiblingDiscoveryOnly: true, providerEstateCompletenessClaimed: false, absenceClaimsAllowed: false, mcpRegistrationDoesNotImplyRuntimeReadiness: true, rawMcpEnvironmentValuesRetained: false, rawMcpArgumentValuesRetained: false } };
  const result = verifyAgentWorkbenchFleet({ value });
  assert(result.status === "passed", "Fleet verifier positive self-test failed.");
  const unsafe = structuredClone(value);
  unsafe.bestRoutes[0].runtimeReadiness = "ready";
  let rejected = false;
  try { verifyAgentWorkbenchFleet({ value: unsafe }); } catch { rejected = true; }
  assert(rejected, "Fleet verifier must reject ready MCP launch routes.");
  const unsafeAbsence = structuredClone(value);
  unsafeAbsence.policy.absenceClaimsAllowed = true;
  rejected = false;
  try { verifyAgentWorkbenchFleet({ value: unsafeAbsence }); } catch { rejected = true; }
  assert(rejected, "Fleet verifier must reject absence claims.");
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_fleet_verifier_self_test_v1", status: "passed", assertions: 3 }, null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--self-test") return selfTest();
  assert(args[0], "Usage: verify-agent-workbench-fleet.mjs <fleet.json> | --self-test");
  const read = readJson(args[0]);
  const result = verifyAgentWorkbenchFleet(read);
  process.stdout.write(`${JSON.stringify({ ...result, input: { path: read.path, sha256: read.sha256, bytes: read.bytes.length } }, null, 2)}\n`);
}
const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) { try { main(); } catch (error) { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; } }
