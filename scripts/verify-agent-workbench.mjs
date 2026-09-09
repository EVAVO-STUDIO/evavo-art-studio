#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const HEX64 = /^[a-f0-9]{64}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value) => typeof value === "string" ? value.trim() : "";
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

function readJson(filePath) {
  const resolved = path.resolve(filePath);
  const bytes = fs.readFileSync(resolved);
  return { path: resolved, bytes, sha256: digest(bytes), value: JSON.parse(bytes.toString("utf8")) };
}

function uniqueStrings(value, label) {
  assert(Array.isArray(value), `${label} must be an array.`);
  const values = value.map((item) => text(item));
  assert(values.every(Boolean), `${label} contains an empty/non-string value.`);
  assert(new Set(values).size === values.length, `${label} contains duplicates.`);
  return values;
}

function verifyConfig(document) {
  const value = record(document);
  assert(value?.contractVersion === "evavo_agent_workbench_config_v1", "Wrong workbench config contract.");
  assert(REPOSITORY.test(text(value.repository)), "Invalid config repository identity.");
  assert(text(value.authority), "Config authority is required.");
  assert(text(value.role), "Config role is required.");
  assert(text(value.capabilityManifest), "Config capabilityManifest is required.");
  assert(text(value.packageManifest), "Config packageManifest is required.");
  uniqueStrings(value.readFirst, "readFirst");
  assert(Array.isArray(value.phases) && value.phases.length > 0, "Config phases are required.");
  const phaseIds = [];
  for (const phase of value.phases) {
    const item = record(phase);
    assert(item && text(item.id) && text(item.purpose), "Each phase needs id and purpose.");
    phaseIds.push(text(item.id));
    uniqueStrings(item.evidence, `phase:${text(item.id)}:evidence`);
  }
  assert(new Set(phaseIds).size === phaseIds.length, "Phase ids must be unique.");
  const automation = record(value.automation);
  assert(automation, "Config automation block is required.");
  uniqueStrings(automation.safeWithoutApproval, "automation.safeWithoutApproval");
  uniqueStrings(automation.gated, "automation.gated");
  uniqueStrings(automation.neverImplied, "automation.neverImplied");
  assert(Array.isArray(value.handoffs), "Config handoffs must be an array.");
  for (const handoff of value.handoffs) {
    const item = record(handoff);
    assert(item && text(item.to) && text(item.when), "Each config handoff needs to and when.");
  }
  return { contract: value.contractVersion, repository: value.repository, authority: value.authority, phaseCount: phaseIds.length };
}

function verifyEvidence(value, label) {
  const item = record(value);
  assert(item && text(item.path), `${label}.path is required.`);
  assert(HEX64.test(text(item.sha256)), `${label}.sha256 must be lowercase SHA-256.`);
  assert(Number.isInteger(item.bytes) && item.bytes >= 0, `${label}.bytes must be a non-negative integer.`);
}

function verifySnapshot(document) {
  const value = record(document);
  assert(value?.contract === "evavo_agent_workbench_snapshot_v1", "Wrong workbench snapshot contract.");
  assert(REPOSITORY.test(text(value.repository)), "Invalid snapshot repository identity.");
  assert(text(value.authority), "Snapshot authority is required.");
  assert(!Number.isNaN(Date.parse(text(value.generatedAt))), "Snapshot generatedAt must be a date-time.");
  const evidence = record(value.sourceEvidence);
  assert(evidence, "Snapshot sourceEvidence is required.");
  for (const key of ["workbenchConfig", "capabilityManifest", "packageManifest"]) verifyEvidence(evidence[key], `sourceEvidence.${key}`);
  for (const [key, item] of Object.entries(evidence)) verifyEvidence(item, `sourceEvidence.${key}`);
  const matches = record(value.matches);
  assert(matches, "Snapshot matches are required.");
  for (const key of ["capabilities", "scripts", "tools", "estateCapabilities"]) assert(Array.isArray(matches[key]), `matches.${key} must be an array.`);
  for (const item of matches.estateCapabilities) {
    const route = record(item);
    assert(route?.runtimeReadiness === "unknown", "Estate capability source evidence must not imply runtime readiness.");
  }
  const policy = record(value.policy);
  assert(policy?.readOnlyCompiler === true, "Snapshot must retain readOnlyCompiler=true.");
  assert(policy?.commandExecutionPerformed === false, "Snapshot must prove commandExecutionPerformed=false.");
  assert(policy?.mutationPerformed === false, "Snapshot must prove mutationPerformed=false.");
  assert(policy?.sourceCapabilityDoesNotImplyRuntimeReadiness === true, "Snapshot must retain source/runtime truth boundary.");
  assert(policy?.routeDoesNotAuthorizeEffects === true, "Snapshot route must not authorize effects.");
  assert(policy?.planDoesNotProveExecution === true, "Snapshot plan must not prove execution.");
  assert(policy?.publicationRequiresSeparateAuthority === true, "Snapshot must retain publication authority boundary.");
  return { contract: value.contract, repository: value.repository, authority: value.authority, generatedAt: value.generatedAt };
}

function routeCollection(snapshot, type) {
  const matches = record(snapshot.matches) ?? {};
  if (type === "capability") return matches.capabilities;
  if (type === "script") return matches.scripts;
  if (type === "tool") return matches.tools;
  if (type === "estate-capability") return matches.estateCapabilities;
  return null;
}

function routeIdentity(route, type) {
  return type === "script" ? text(route.name) : text(route.id);
}

function verifyHandoff(document, snapshotRead = null) {
  const value = record(document);
  assert(value?.contract === "evavo_agent_workbench_handoff_v1", "Wrong workbench handoff contract.");
  assert(!Number.isNaN(Date.parse(text(value.createdAt))), "Handoff createdAt must be a date-time.");
  const from = record(value.from);
  assert(from && REPOSITORY.test(text(from.repository)) && text(from.authority), "Handoff from identity is invalid.");
  assert(text(value.to) && text(value.objective) && text(value.reason), "Handoff to/objective/reason are required.");
  const snapshot = record(value.snapshot);
  assert(snapshot?.contract === "evavo_agent_workbench_snapshot_v1", "Handoff snapshot contract is invalid.");
  assert(HEX64.test(text(snapshot.sha256)), "Handoff snapshot SHA-256 is invalid.");
  const route = record(value.route);
  assert(route && ["capability", "script", "tool", "estate-capability"].includes(route.type), "Handoff route type is invalid.");
  assert(text(route.id) && HEX64.test(text(route.sha256)) && record(route.evidence), "Handoff route evidence is invalid.");
  const authority = record(value.authority);
  assert(authority?.executionGranted === false && authority?.mutationGranted === false && authority?.publicationGranted === false && authority?.financialGranted === false && authority?.requiresDownstreamAdmission === true, "Handoff authority must be all-false and downstream-admission required.");
  if (snapshotRead) {
    verifySnapshot(snapshotRead.value);
    assert(snapshotRead.sha256 === snapshot.sha256, "Handoff snapshot digest does not match supplied snapshot bytes.");
    assert(snapshotRead.value.repository === snapshot.repository && snapshotRead.value.repository === from.repository, "Handoff repository does not match supplied snapshot.");
    const collection = routeCollection(snapshotRead.value, route.type);
    assert(Array.isArray(collection), "Selected route collection is unavailable in supplied snapshot.");
    const found = collection.find((item) => record(item) && routeIdentity(item, route.type) === route.id);
    assert(found, "Selected route does not exist in supplied snapshot.");
    assert(digest(Buffer.from(JSON.stringify(found), "utf8")) === route.sha256, "Selected route digest does not match supplied snapshot route.");
  }
  return { contract: value.contract, from: from.repository, to: value.to, routeType: route.type, routeId: route.id };
}

function selfTest() {
  verifyConfig({ contractVersion: "evavo_agent_workbench_config_v1", repository: "EVAVO-STUDIO/test", authority: "test", role: "test", capabilityManifest: "evavo.capabilities.json", packageManifest: "package.json", readFirst: ["AGENTS.md"], phases: [{ id: "orient", purpose: "orient", evidence: ["manifest"] }], automation: { safeWithoutApproval: ["read"], gated: ["write"], neverImplied: ["execution"] }, handoffs: [] });
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_verifier_self_test_v1", status: "passed", assertions: 1 }, null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--self-test") return selfTest();
  const kind = args[0];
  const file = args[1];
  assert(["config", "snapshot", "handoff"].includes(kind), "Usage: verify-agent-workbench.mjs <config|snapshot|handoff> <file> [--snapshot <snapshot.json>] | --self-test");
  assert(file, "A file path is required.");
  const read = readJson(file);
  let result;
  if (kind === "config") result = verifyConfig(read.value);
  else if (kind === "snapshot") result = verifySnapshot(read.value);
  else {
    const snapshotIndex = args.indexOf("--snapshot");
    result = verifyHandoff(read.value, snapshotIndex >= 0 ? readJson(args[snapshotIndex + 1]) : null);
  }
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_verification_v1", status: "passed", input: { path: read.path, sha256: read.sha256, bytes: read.bytes.length }, result }, null, 2)}\n`);
}

try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
