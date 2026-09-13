#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { compileAgentWorkbench } from "./agent-workbench.mjs";
import { compileAgentWorkbenchFleet } from "./agent-workbench-fleet.mjs";
import { compileHandoff } from "./compile-agent-workbench-handoff.mjs";
import { compileAgentWorkbenchGuidance } from "./agent-workbench-guide.mjs";
import { inspectSharedWorkbenchDrift } from "./agent-workbench-shared-drift.mjs";

const STANDARD_PROTOCOL = "2025-03-26";
const EVAVO_DISCOVERY_PROTOCOL = "2026-07-28";
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(process.env.EVAVO_AGENT_WORKBENCH_ROOT || scriptRoot);
const workspaceParent = path.dirname(repositoryRoot);
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value) => typeof value === "string" ? value.trim() : "";
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function configuredRoots() {
  const separator = process.platform === "win32" ? ";" : ":";
  const fromEnvironment = text(process.env.EVAVO_AGENT_WORKBENCH_EVIDENCE_ROOTS)
    ? process.env.EVAVO_AGENT_WORKBENCH_EVIDENCE_ROOTS.split(separator).map((item) => item.trim()).filter(Boolean)
    : [];
  const siblingDevelopmentStudio = path.resolve(repositoryRoot, "..", "evavo-development-studio");
  const candidates = [repositoryRoot, ...fromEnvironment, ...(fs.existsSync(siblingDevelopmentStudio) ? [siblingDevelopmentStudio] : [])];
  const roots = [];
  for (const candidate of [...new Set(candidates.map((item) => path.resolve(item)))]) {
    let metadata;
    try { metadata = fs.lstatSync(candidate); } catch { continue; }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) continue;
    roots.push(Object.freeze({ lexical: candidate, real: fs.realpathSync(candidate) }));
  }
  if (!roots.length) throw new Error("No safe workbench evidence roots are available.");
  return roots;
}

const allowedRoots = configuredRoots();
function inside(root, candidate) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); }
function confined(value, label) {
  if (!text(value) || value.includes("\0")) throw new Error(`${label} must be a non-empty path containing no NUL.`);
  const candidate = path.resolve(value);
  const root = allowedRoots.find((entry) => inside(entry.lexical, candidate));
  if (!root) throw new Error(`${label} is outside EVAVO_AGENT_WORKBENCH_EVIDENCE_ROOTS.`);
  const relative = path.relative(root.lexical, candidate);
  let current = root.lexical;
  let existing = root.lexical;
  for (const part of relative === "" ? [] : relative.split(path.sep)) {
    current = path.join(current, part);
    let metadata;
    try { metadata = fs.lstatSync(current); } catch (error) { if (error?.code === "ENOENT") break; throw error; }
    if (metadata.isSymbolicLink()) throw new Error(`${label} contains a symbolic-link component.`);
    existing = current;
  }
  if (!inside(root.real, fs.realpathSync(existing))) throw new Error(`${label} escaped its admitted root.`);
  return candidate;
}
function workbenchWorkspaceRoot(value) {
  const candidate = path.resolve(value ? value : workspaceParent);
  const explicitAllowed = candidate === repositoryRoot || candidate === workspaceParent || allowedRoots.some((entry) => inside(entry.lexical, candidate));
  if (!explicitAllowed) throw new Error("workspaceRoot is outside the repository workspace or EVAVO_AGENT_WORKBENCH_EVIDENCE_ROOTS.");
  const metadata = fs.lstatSync(candidate);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("workspaceRoot must be a regular non-link directory.");
  return candidate;
}
function boundedString(value, label, maximum = 4000, required = false) {
  if (value === undefined || value === null || value === "") { if (required) throw new Error(`${label} is required.`); return ""; }
  if (typeof value !== "string" || value.length > maximum || value.includes("\0")) throw new Error(`${label} must be a bounded string containing no NUL.`);
  return value.trim();
}
function boundedInteger(value, label, fallback, minimum, maximum) { if (value === undefined) return fallback; if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`); return value; }
const objectSchema = (properties, required = []) => ({ type: "object", additionalProperties: false, properties, required });
const pathField = { type: "string", minLength: 1, maxLength: 32768 };
const tools = Object.freeze([
  { name: "evavo_agent_workbench_capabilities", description: "Describe the EVAVO Agent Workbench contracts, admitted evidence roots and truth boundaries. Performs no repository or provider mutation.", inputSchema: objectSchema({}) },
  { name: "evavo_agent_workbench_snapshot", description: "Compile a read-only objective-ranked repository capability, package automation and optional live estate/tool orientation snapshot. Discovery never grants execution or publication authority.", inputSchema: objectSchema({ objective: { type: "string", maxLength: 4000 }, limit: { type: "integer", minimum: 1, maximum: 200 }, all: { type: "boolean" }, toolRegistryPath: pathField, estateSnapshotPath: pathField }) },
  { name: "evavo_agent_workbench_fleet", description: "Compile a read-only ranked view across local workbench-enabled sibling repositories. The local sibling scan never claims provider-estate completeness or absence.", inputSchema: objectSchema({ workspaceRoot: pathField, objective: { type: "string", maxLength: 4000 }, limit: { type: "integer", minimum: 1, maximum: 200 }, perRepositoryLimit: { type: "integer", minimum: 1, maximum: 100 }, repositoryLimit: { type: "integer", minimum: 1, maximum: 512 }, estateSnapshotPath: pathField }) },
  { name: "evavo_agent_workbench_shared_drift", description: "Compare shared EVAVO Workbench files across local sibling checkouts by SHA-256. Read-only; unavailable sibling evidence never proves alignment and no automatic repair is performed.", inputSchema: objectSchema({ workspaceRoot: pathField }) },
  { name: "evavo_agent_workbench_guide", description: "Compile read-only next-phase and route-risk guidance from one exact workbench snapshot. Guidance classifies required admission/handoff evidence but grants no execution authority.", inputSchema: objectSchema({ snapshotPath: pathField, routeType: { enum: ["capability", "script", "tool", "estate-capability"] }, routeId: { type: "string", minLength: 1, maxLength: 512 }, currentPhase: { type: "string", minLength: 1, maxLength: 128 } }, ["snapshotPath"]) },
  { name: "evavo_agent_workbench_handoff", description: "Compile an evidence-bound, all-authority-false handoff from one exact workbench snapshot file and selected route. The receiving authority must separately admit execution or mutation.", inputSchema: objectSchema({ snapshotPath: pathField, routeType: { enum: ["capability", "script", "tool", "estate-capability"] }, routeId: { type: "string", minLength: 1, maxLength: 512 }, to: { type: "string", minLength: 1, maxLength: 256 }, objective: { type: "string", minLength: 1, maxLength: 4000 }, reason: { type: "string", minLength: 1, maxLength: 4000 } }, ["snapshotPath", "routeType", "routeId", "to", "reason"]) }
]);
function contractBundle() { const bundlePath = path.join(repositoryRoot, ".evavo", "agent-workbench.contracts.v1.json"); const bytes = fs.readFileSync(bundlePath); return { bundle: JSON.parse(bytes.toString("utf8")), evidence: { path: bundlePath, sha256: digest(bytes), bytes: bytes.length }, allowedEvidenceRoots: allowedRoots.map((item) => item.lexical), policy: { readOnly: true, executionGranted: false, mutationGranted: false, publicationGranted: false } }; }
function assertSnapshotBoundary(value) { if (value?.contract !== "evavo_agent_workbench_snapshot_v1") throw new Error("Snapshot contract is not evavo_agent_workbench_snapshot_v1."); const policy = record(value.policy); if (!policy || policy.readOnlyCompiler !== true || policy.commandExecutionPerformed !== false || policy.mutationPerformed !== false || policy.routeDoesNotAuthorizeEffects !== true || policy.planDoesNotProveExecution !== true || policy.publicationRequiresSeparateAuthority !== true) throw new Error("Snapshot truth boundary is incomplete or unsafe."); }
function callTool(name, input) {
  if (name === "evavo_agent_workbench_capabilities") return contractBundle();
  if (name === "evavo_agent_workbench_snapshot") { const toolRegistryPath = input.toolRegistryPath ? confined(input.toolRegistryPath, "toolRegistryPath") : null; const estateSnapshotPath = input.estateSnapshotPath ? confined(input.estateSnapshotPath, "estateSnapshotPath") : null; return compileAgentWorkbench({ root: repositoryRoot, objective: boundedString(input.objective, "objective"), limit: boundedInteger(input.limit, "limit", 20, 1, 200), all: input.all === true, ...(toolRegistryPath ? { toolRegistryPath } : {}), ...(estateSnapshotPath ? { estateSnapshotPath } : {}) }); }
  if (name === "evavo_agent_workbench_fleet") { const estateSnapshotPath = input.estateSnapshotPath ? confined(input.estateSnapshotPath, "estateSnapshotPath") : null; return compileAgentWorkbenchFleet({ workspaceRoot: workbenchWorkspaceRoot(input.workspaceRoot), objective: boundedString(input.objective, "objective"), limit: boundedInteger(input.limit, "limit", 50, 1, 200), perRepositoryLimit: boundedInteger(input.perRepositoryLimit, "perRepositoryLimit", 20, 1, 100), repositoryLimit: boundedInteger(input.repositoryLimit, "repositoryLimit", 256, 1, 512), ...(estateSnapshotPath ? { estateSnapshotPath } : {}) }); }
  if (name === "evavo_agent_workbench_shared_drift") return inspectSharedWorkbenchDrift(repositoryRoot, { workspaceRoot: workbenchWorkspaceRoot(input.workspaceRoot) });
  if (name === "evavo_agent_workbench_guide") { const snapshotPath = confined(input.snapshotPath, "snapshotPath"); const bytes = fs.readFileSync(snapshotPath); const value = JSON.parse(bytes.toString("utf8")); assertSnapshotBoundary(value); return compileAgentWorkbenchGuidance({ snapshotRead: { value, bytes, sha256: digest(bytes) }, routeType: input.routeType ? boundedString(input.routeType, "routeType", 32, true) : null, routeId: input.routeId ? boundedString(input.routeId, "routeId", 512, true) : null, currentPhase: input.currentPhase ? boundedString(input.currentPhase, "currentPhase", 128, true) : null }); }
  if (name === "evavo_agent_workbench_handoff") { const snapshotPath = confined(input.snapshotPath, "snapshotPath"); const bytes = fs.readFileSync(snapshotPath); const value = JSON.parse(bytes.toString("utf8")); assertSnapshotBoundary(value); return compileHandoff({ snapshotRead: { value, bytes, sha256: digest(bytes) }, routeType: boundedString(input.routeType, "routeType", 32, true), routeId: boundedString(input.routeId, "routeId", 512, true), to: boundedString(input.to, "to", 256, true), objective: boundedString(input.objective ?? value.objective, "objective", 4000, true), reason: boundedString(input.reason, "reason", 4000, true) }); }
  throw new Error(`Unknown tool: ${name}`);
}
function response(id, result) { process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`); }
function errorResponse(id, error) { process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })}\n`); }
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
    if (request.method === "server/discover") response(request.id, { protocolVersion: EVAVO_DISCOVERY_PROTOCOL, supportedVersions: [STANDARD_PROTOCOL, EVAVO_DISCOVERY_PROTOCOL], serverInfo: { name: "evavo-agent-workbench", version: "2.1.0" }, capabilities: { tools: { count: tools.length, names: tools.map((tool) => tool.name), listChanged: false }, guidance: true, handoff: true, fleet: true, sharedDrift: true }, readOnly: true, truthBoundary: { readOnly: true, executionGranted: false, mutationGranted: false, publicationGranted: false, completionClaimProven: false, sharedDriftAutomaticRepair: false, sharedDriftUnavailableDoesNotProveAlignment: true } });
    else if (request.method === "initialize") response(request.id, { protocolVersion: STANDARD_PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "evavo-agent-workbench", version: "2.1.0" } });
    else if (request.method === "notifications/initialized") { }
    else if (request.method === "tools/list") response(request.id, { tools });
    else if (request.method === "tools/call") { const output = callTool(request.params?.name, request.params?.arguments ?? {}); response(request.id, { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output, isError: false }); }
    else errorResponse(request.id, new Error(`Unsupported method: ${request.method}`));
  } catch (error) { if (request?.id !== undefined) errorResponse(request.id, error); }
}
