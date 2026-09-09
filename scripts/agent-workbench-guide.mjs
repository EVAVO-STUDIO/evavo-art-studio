#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CONTRACT = "evavo_agent_workbench_guidance_v1";
const SNAPSHOT_CONTRACT = "evavo_agent_workbench_snapshot_v1";
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value) => typeof value === "string" ? value.trim() : "";
const strings = (value) => Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : [];
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw new Error(message); };

function parse(argv) {
  const options = { snapshot: null, routeType: null, routeId: null, currentPhase: null, output: null, compact: false, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--snapshot") options.snapshot = argv[++index] ?? null;
    else if (token === "--route-type") options.routeType = argv[++index] ?? null;
    else if (token === "--route-id") options.routeId = argv[++index] ?? null;
    else if (token === "--current-phase") options.currentPhase = argv[++index] ?? null;
    else if (token === "--output") options.output = argv[++index] ?? null;
    else if (token === "--compact") options.compact = true;
    else if (token === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${token}`);
  }
  return options;
}

function readSnapshot(filePath) {
  const resolved = path.resolve(filePath);
  const bytes = fs.readFileSync(resolved);
  const value = JSON.parse(bytes.toString("utf8"));
  assertSnapshot(value);
  return { path: resolved, bytes, sha256: digest(bytes), value };
}

function assertSnapshot(value) {
  if (value?.contract !== SNAPSHOT_CONTRACT) fail(`Snapshot contract must be ${SNAPSHOT_CONTRACT}.`);
  const policy = record(value.policy);
  if (!policy || policy.readOnlyCompiler !== true || policy.commandExecutionPerformed !== false || policy.mutationPerformed !== false || policy.routeDoesNotAuthorizeEffects !== true || policy.planDoesNotProveExecution !== true || policy.publicationRequiresSeparateAuthority !== true) {
    fail("Snapshot truth boundary is incomplete or unsafe.");
  }
  if (!record(value.orientation) || !Array.isArray(value.orientation.phases) || value.orientation.phases.length < 1) fail("Snapshot phases are required.");
  if (!record(value.matches)) fail("Snapshot matches are required.");
}

function collection(snapshot, type) {
  if (type === "capability") return snapshot.matches.capabilities;
  if (type === "script") return snapshot.matches.scripts;
  if (type === "tool") return snapshot.matches.tools;
  if (type === "estate-capability") return snapshot.matches.estateCapabilities;
  return null;
}

function identity(item, type) {
  return type === "script" ? text(item.name) : text(item.id);
}

function routePriority(type, item = {}) {
  if (type === "capability") return 5;
  if (type === "tool" && item.source === "development-tool-registry") return 4;
  if (type === "estate-capability") return 3;
  if (type === "tool" && item.source === "root-mcp-launch-manifest") return 2;
  if (type === "tool") return 3;
  if (type === "script") return 1;
  return 0;
}

function candidateRoutes(snapshot) {
  const output = [];
  for (const type of ["capability", "tool", "estate-capability", "script"]) {
    const items = collection(snapshot, type);
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!record(item) || !identity(item, type)) continue;
      output.push({ type, item, id: identity(item, type), relevance: Number.isFinite(item.relevance) ? item.relevance : 0, priority: routePriority(type, item) });
    }
  }
  return output.sort((a, b) => b.priority - a.priority || b.relevance - a.relevance || a.id.localeCompare(b.id));
}

function selectRoute(snapshot, routeType = null, routeId = null) {
  if ((routeType && !routeId) || (!routeType && routeId)) fail("routeType and routeId must be supplied together.");
  if (routeType) {
    if (!["capability", "script", "tool", "estate-capability"].includes(routeType)) fail("Unsupported route type.");
    const items = collection(snapshot, routeType);
    const item = Array.isArray(items) ? items.find((candidate) => record(candidate) && identity(candidate, routeType) === routeId) : null;
    if (!item) fail(`Route not found in snapshot: ${routeType}:${routeId}`);
    return { type: routeType, id: routeId, item, selection: "explicit" };
  }
  const best = candidateRoutes(snapshot)[0];
  if (!best) return null;
  return { type: best.type, id: best.id, item: best.item, selection: "deterministic-top-match" };
}

function phaseGuidance(snapshot, currentPhase) {
  const phases = snapshot.orientation.phases.filter(record);
  const ids = phases.map((phase) => text(phase.id));
  const currentIndex = currentPhase ? ids.indexOf(currentPhase) : -1;
  if (currentPhase && currentIndex < 0) fail(`Current phase is not in snapshot: ${currentPhase}`);
  const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, phases.length - 1);
  const next = phases[nextIndex];
  const completed = currentIndex >= phases.length - 1;
  return {
    currentPhase: currentIndex >= 0 ? ids[currentIndex] : null,
    nextPhase: text(next.id),
    nextPurpose: text(next.purpose),
    requiredEvidence: strings(next.evidence),
    phaseSequence: ids,
    atFinalPhase: completed,
  };
}

function classifyRoute(snapshot, selected) {
  if (!selected) return {
    disposition: "no-route-match",
    effects: [],
    requirements: [],
    blockers: ["No matching route is present in the snapshot; broaden the objective or supply fresher capability/tool evidence."],
    nextAuthority: snapshot.repository,
    handoffRecommended: false,
  };

  const item = selected.item;
  const effects = strings(item.effects);
  const requirements = strings(item.requires);
  const highEffects = effects.filter((effect) => ["network", "write", "execute", "publish", "financial"].includes(effect));
  const blockers = [];
  let disposition;
  let nextAuthority = snapshot.repository;
  let handoffRecommended = false;

  if (selected.type === "estate-capability") {
    disposition = "handoff-runtime-unverified";
    nextAuthority = text(item.repository) || text(item.authority) || "canonical-specialist";
    handoffRecommended = true;
    blockers.push("Runtime readiness is unknown for estate-manifest capability evidence.");
    blockers.push("The receiving authority must perform its own runtime/effect admission.");
  } else if (selected.type === "tool" && item.source === "root-mcp-launch-manifest") {
    disposition = "mcp-runtime-verification-required";
    nextAuthority = text(item.repository) || snapshot.repository;
    handoffRecommended = nextAuthority !== snapshot.repository;
    blockers.push("MCP launch registration proves only that a launch surface is configured; runtime readiness remains unknown.");
    blockers.push("Obtain a live protocol/discovery receipt for the exact server before any tool call or effect claim.");
    blockers.push("After runtime verification, apply the owning tool/capability effect gate before execution.");
  } else if (selected.type === "tool") {
    const owner = text(item.repository);
    if (owner && owner !== snapshot.repository) {
      disposition = "handoff-registered-tool";
      nextAuthority = owner;
      handoffRecommended = true;
      blockers.push("Registered tool discovery does not prove live runtime readiness or grant execution authority.");
    } else {
      disposition = "registered-tool-admission-required";
      blockers.push("Tool registration does not by itself grant execution authority.");
    }
  } else if (selected.type === "script") {
    disposition = "resolve-script-through-capability";
    blockers.push("Package scripts are automation inventory, not a standalone safety or authority classification.");
    blockers.push("Resolve this script through its owning capability/mission before execution.");
  } else if (highEffects.length > 0) {
    disposition = "effect-admission-required";
    blockers.push(`Selected capability declares gated effects: ${highEffects.join(", ")}.`);
    blockers.push("Obtain the owning authority's effect-specific admission before execution.");
  } else {
    disposition = "read-compute-route";
    blockers.push("Source declaration still does not prove a live callable runtime; verify the intended interface before execution.");
  }

  for (const requirement of requirements) blockers.push(`Requirement: ${requirement}`);
  return { disposition, effects, requirements, blockers: [...new Set(blockers)], nextAuthority, handoffRecommended };
}

export function compileAgentWorkbenchGuidance({ snapshotRead, routeType = null, routeId = null, currentPhase = null } = {}) {
  if (!snapshotRead?.value || !snapshotRead?.bytes || !snapshotRead?.sha256) fail("snapshotRead with exact bytes and SHA-256 is required.");
  assertSnapshot(snapshotRead.value);
  const selected = selectRoute(snapshotRead.value, routeType, routeId);
  const phase = phaseGuidance(snapshotRead.value, currentPhase);
  const classification = classifyRoute(snapshotRead.value, selected);
  const routeEvidence = selected ? selected.item : null;
  return Object.freeze({
    contract: CONTRACT,
    generatedAt: new Date().toISOString(),
    repository: snapshotRead.value.repository,
    authority: snapshotRead.value.authority,
    objective: snapshotRead.value.objective,
    snapshot: Object.freeze({ contract: snapshotRead.value.contract, sha256: snapshotRead.sha256, generatedAt: snapshotRead.value.generatedAt }),
    selectedRoute: selected ? Object.freeze({ type: selected.type, id: selected.id, selection: selected.selection, relevance: Number.isFinite(routeEvidence.relevance) ? routeEvidence.relevance : 0, sha256: digest(Buffer.from(JSON.stringify(routeEvidence), "utf8")), evidence: routeEvidence }) : null,
    guidance: Object.freeze({ ...phase, ...classification }),
    mustNot: strings(snapshotRead.value.automation?.neverImplied),
    policy: Object.freeze({ readOnlyCompiler: true, commandExecutionPerformed: false, mutationPerformed: false, selectionDoesNotAuthorizeEffects: true, guidanceDoesNotProveReadiness: true, downstreamAdmissionRequired: classification.disposition !== "no-route-match" }),
  });
}

function selfTest() {
  const snapshot = {
    contract: SNAPSHOT_CONTRACT,
    generatedAt: new Date(0).toISOString(),
    repository: "EVAVO-STUDIO/test",
    authority: "test",
    objective: "repair alpha",
    orientation: { phases: [{ id: "orient", purpose: "orient", evidence: ["manifest"] }, { id: "execute", purpose: "execute", evidence: ["receipt"] }] },
    matches: { capabilities: [{ id: "art.alpha", relevance: 1, effects: ["read", "compute"], requires: [] }], scripts: [], tools: [{ id: "mcp:art.alpha", source: "root-mcp-launch-manifest", relevance: 9, repository: "EVAVO-STUDIO/test", runtimeReadiness: "unknown" }], estateCapabilities: [] },
    automation: { neverImplied: ["execution from route"] },
    policy: { readOnlyCompiler: true, commandExecutionPerformed: false, mutationPerformed: false, routeDoesNotAuthorizeEffects: true, planDoesNotProveExecution: true, publicationRequiresSeparateAuthority: true },
  };
  const bytes = Buffer.from(JSON.stringify(snapshot), "utf8");
  const output = compileAgentWorkbenchGuidance({ snapshotRead: { value: snapshot, bytes, sha256: digest(bytes) } });
  if (output.selectedRoute?.id !== "art.alpha") fail("semantic route priority self-test failed");
  if (output.guidance.disposition !== "read-compute-route") fail("disposition self-test failed");
  const mcp = compileAgentWorkbenchGuidance({ snapshotRead: { value: snapshot, bytes, sha256: digest(bytes) }, routeType: "tool", routeId: "mcp:art.alpha" });
  if (mcp.guidance.disposition !== "mcp-runtime-verification-required") fail("MCP runtime verification self-test failed");
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_guidance_self_test_v2", status: "passed", assertions: 3 }, null, 2)}\n`);
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.selfTest) return selfTest();
  if (!options.snapshot) fail("--snapshot is required.");
  const snapshotRead = readSnapshot(options.snapshot);
  const result = compileAgentWorkbenchGuidance({ snapshotRead, routeType: options.routeType, routeId: options.routeId, currentPhase: options.currentPhase });
  const output = `${JSON.stringify(result, null, options.compact ? 0 : 2)}\n`;
  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, { flag: "wx" });
    process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_guidance_write_v1", status: "created", path: outputPath, sha256: digest(Buffer.from(output, "utf8")) }, null, 2)}\n`);
  } else process.stdout.write(output);
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
