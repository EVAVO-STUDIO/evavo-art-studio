#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CONTRACT = "evavo_agent_workbench_shared_drift_v1";
const CONFIG_RELATIVE = ".evavo/agent-workbench.v1.json";
const SHARED_PATHS = Object.freeze([
  "WORKBENCH_FIRST.md",
  "scripts/agent-workbench.mjs",
  "scripts/test-agent-workbench-awareness.mjs",
  "scripts/verify-agent-workbench-awareness.mjs",
  "scripts/test-agent-workbench-awareness-verifier.mjs",
  "scripts/agent-workbench-fleet.mjs",
  "scripts/test-agent-workbench-fleet.mjs",
  "scripts/verify-agent-workbench-fleet.mjs",
  "scripts/verify-agent-workbench.mjs",
  "scripts/compile-agent-workbench-handoff.mjs",
  "scripts/agent-workbench-guide.mjs",
  "scripts/test-agent-workbench-guide.mjs",
  "scripts/verify-agent-workbench-guidance.mjs",
  "scripts/agent-workbench-mcp.mjs",
  "scripts/test-agent-workbench-mcp.mjs",
  "scripts/agent-workbench-mcp-v2.mjs",
  "scripts/test-agent-workbench-mcp-v2.mjs",
  "scripts/agent-workbench-mcp-registration.mjs",
  "scripts/test-agent-workbench-mcp-registration.mjs",
  "scripts/agent-workbench-doctor.mjs",
  "scripts/test-agent-workbench-doctor.mjs",
  "scripts/agent-workbench-shared-drift.mjs",
  "scripts/test-agent-workbench-shared-drift.mjs",
  "scripts/agent-workbench-health-fleet.mjs",
  "scripts/test-agent-workbench-health-fleet.mjs",
  "schemas/evavo.agent-workbench-config.schema.json",
  "schemas/evavo.agent-workbench-snapshot.schema.json",
  "schemas/evavo.agent-workbench-handoff.schema.json",
  "schemas/evavo.agent-workbench-guidance.schema.json",
  "schemas/evavo.agent-workbench-fleet.schema.json"
]);

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw new Error(message); };
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function regularFile(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function regularDirectory(directoryPath) {
  try {
    const stat = fs.lstatSync(directoryPath);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function repositoryIdentity(root) {
  const configPath = path.join(root, CONFIG_RELATIVE);
  if (!regularFile(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!isRecord(config) || config.contractVersion !== "evavo_agent_workbench_config_v1" || typeof config.repository !== "string" || !config.repository) return null;
    return { repository: config.repository, authority: typeof config.authority === "string" ? config.authority : "unknown" };
  } catch {
    return null;
  }
}

function hashFile(root, relative) {
  const filePath = path.join(root, relative);
  if (!regularFile(filePath)) return { present: false, sha256: null, bytes: 0 };
  const bytes = fs.readFileSync(filePath);
  return { present: true, sha256: digest(bytes), bytes: bytes.length };
}

function discoverWorkbenchRoots(workspaceRoot) {
  if (!regularDirectory(workspaceRoot)) return [];
  const roots = [];
  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = path.join(workspaceRoot, entry.name);
    const identity = repositoryIdentity(candidate);
    if (identity) roots.push({ root: candidate, ...identity });
  }
  return roots.sort((a, b) => a.repository.localeCompare(b.repository) || a.root.localeCompare(b.root));
}

export function inspectSharedWorkbenchDrift(root, options = {}) {
  const repositoryRoot = path.resolve(root);
  const currentIdentity = repositoryIdentity(repositoryRoot);
  if (!currentIdentity) fail("Current repository does not have a valid EVAVO Workbench config.");
  const workspaceRoot = path.resolve(options.workspaceRoot ?? path.dirname(repositoryRoot));
  const sharedPaths = Array.isArray(options.sharedPaths) && options.sharedPaths.length ? [...new Set(options.sharedPaths)] : [...SHARED_PATHS];
  const roots = discoverWorkbenchRoots(workspaceRoot);
  const siblingRoots = roots.filter((item) => path.resolve(item.root) !== repositoryRoot);
  const current = new Map(sharedPaths.map((relative) => [relative, hashFile(repositoryRoot, relative)]));
  const comparisons = [];
  const mismatches = [];

  for (const sibling of siblingRoots) {
    let mismatchCount = 0;
    const files = [];
    for (const relative of sharedPaths) {
      const left = current.get(relative);
      const right = hashFile(sibling.root, relative);
      let state = "aligned";
      if (!left.present || !right.present) state = "missing";
      else if (left.sha256 !== right.sha256) state = "mismatched";
      if (state !== "aligned") {
        mismatchCount += 1;
        mismatches.push({
          repository: sibling.repository,
          path: relative,
          state,
          current: left,
          sibling: right
        });
      }
      files.push({ path: relative, state, currentSha256: left.sha256, siblingSha256: right.sha256 });
    }
    comparisons.push({
      repository: sibling.repository,
      authority: sibling.authority,
      root: sibling.root,
      status: mismatchCount === 0 ? "aligned" : "drifted",
      mismatchCount,
      files
    });
  }

  const status = siblingRoots.length === 0 ? "unavailable" : mismatches.length === 0 ? "aligned" : "drifted";
  return {
    contract: CONTRACT,
    generatedAt: new Date().toISOString(),
    repository: currentIdentity.repository,
    authority: currentIdentity.authority,
    workspaceRoot,
    status,
    sharedPathCount: sharedPaths.length,
    comparedRepositoryCount: siblingRoots.length,
    comparedRepositories: comparisons.map((item) => item.repository),
    mismatchCount: mismatches.length,
    mismatches,
    comparisons,
    policy: {
      readOnly: true,
      providerQueriesPerformed: false,
      mutationPerformed: false,
      unavailableDoesNotProveAlignment: true,
      siblingDiscoveryScope: "workspace-root-direct-children",
      comparisonBasis: "byte-identical-sha256"
    }
  };
}

function parse(argv) {
  const options = { root: null, workspaceRoot: null, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root") options.root = argv[++index] ?? null;
    else if (token === "--workspace-root") options.workspaceRoot = argv[++index] ?? null;
    else if (token === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${token}`);
  }
  return options;
}

function selfTest() {
  const assertions = [
    SHARED_PATHS.length >= 20,
    new Set(SHARED_PATHS).size === SHARED_PATHS.length,
    SHARED_PATHS.includes("scripts/agent-workbench.mjs"),
    SHARED_PATHS.includes("scripts/agent-workbench-doctor.mjs"),
    SHARED_PATHS.includes("scripts/agent-workbench-health-fleet.mjs"),
    SHARED_PATHS.includes("scripts/test-agent-workbench-health-fleet.mjs"),
    SHARED_PATHS.includes("scripts/verify-agent-workbench-guidance.mjs"),
    SHARED_PATHS.includes("schemas/evavo.agent-workbench-fleet.schema.json"),
    CONTRACT === "evavo_agent_workbench_shared_drift_v1"
  ];
  if (assertions.some((value) => value !== true)) fail("shared-drift self-test failed");
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_shared_drift_self_test_v2", status: "passed", assertions: assertions.length }, null, 2)}\n`);
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.selfTest) return selfTest();
  const root = path.resolve(options.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const result = inspectSharedWorkbenchDrift(root, { workspaceRoot: options.workspaceRoot });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "drifted") process.exitCode = 2;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; }
}
