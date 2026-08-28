#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RECEIPT_RELATIVE_ROOT = ".art-studio/local-validation";
export const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60 * 1_000;
export const MAX_COMMAND_TIMEOUT_MS = 4 * 60 * 60 * 1_000;

const ZERO_SHA = /^0{40}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const REF = /^(?:refs\/[^\s\0]+|HEAD|\(delete\))$/u;
const CANONICAL_PROFILES = new Set(["fast", "changed", "push", "full", "release"]);
const PROFILE_ALIASES = Object.freeze({ quick: "fast", prepush: "push" });
const INTERNAL_DEPENDENCY_FIELDS = Object.freeze([
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
]);
const SAFE_EXECUTABLES = new Set(["git", "pnpm", "python", "python3", process.execPath]);
const WORKSPACE_SCRIPT_ORDER = Object.freeze(["build", "typecheck", "test"]);

function command(label, executable, ...args) {
  return Object.freeze({
    label,
    executable,
    args: Object.freeze(args),
  });
}

const LOCAL_CONTRACT_COMMANDS = Object.freeze([
  command(
    "Validate local-first orchestration contracts",
    process.execPath,
    "--test",
    "scripts/test-local-quality-gate.mjs",
    "scripts/test-github-workflow-contexts.mjs",
    "scripts/test-setup-local-hooks.mjs",
    "scripts/test-run-local-studio.mjs",
    "scripts/test-local-storage-headroom.mjs",
    "scripts/test-run-local-worker.mjs",
    "scripts/test-local-first-workstation-docs.mjs",
  ),
  command(
    "Prove hosted automation remains inactive",
    process.execPath,
    "scripts/check-github-workflow-contexts.mjs",
  ),
]);

const FAST_COMMANDS = Object.freeze([
  command("Check repository diff formatting", "git", "diff", "--check"),
  ...LOCAL_CONTRACT_COMMANDS,
  command(
    "Compile sprite preview Python sources",
    "python",
    "-m",
    "py_compile",
    "tools/sprite_animation_preview.py",
    "scripts/test-sprite-animation-preview.py",
  ),
  command(
    "Run sprite preview cross-platform contract",
    "python",
    "scripts/test-sprite-animation-preview.py",
    "-v",
  ),
  command(
    "Type-check quality package",
    "pnpm",
    "--filter",
    "@evavo/art-quality",
    "typecheck",
  ),
  command(
    "Test quality package",
    "pnpm",
    "--filter",
    "@evavo/art-quality",
    "test",
  ),
]);

const FULL_COMMANDS = Object.freeze([
  command("Check repository diff formatting", "git", "diff", "--check"),
  ...LOCAL_CONTRACT_COMMANDS,
  command(
    "Compile sprite preview Python sources",
    "python",
    "-m",
    "py_compile",
    "tools/sprite_animation_preview.py",
    "scripts/test-sprite-animation-preview.py",
  ),
  command(
    "Run sprite preview cross-platform contract",
    "python",
    "scripts/test-sprite-animation-preview.py",
    "-v",
  ),
  command("Run complete local Art Studio validation", "pnpm", "check"),
]);

export class LocalQualityGateError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "LocalQualityGateError";
    this.code = code;
  }
}

function fail(code, message, options = {}) {
  throw new LocalQualityGateError(code, message, options);
}

function text(value, label, maximum = 32_768) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    fail("LOCAL_GATE_UNSAFE_TEXT", `${label} must be a bounded safe string.`);
  }
  return value;
}

export function canonicalProfile(value) {
  const requested = typeof value === "string" ? value.trim().toLowerCase() : "";
  const canonical = PROFILE_ALIASES[requested] ?? requested;
  if (!CANONICAL_PROFILES.has(canonical)) {
    fail(
      "LOCAL_GATE_PROFILE_INVALID",
      `profile must be one of ${[...CANONICAL_PROFILES].join(", ")} (legacy aliases: quick, prepush).`,
    );
  }
  return canonical;
}

export function timeoutFromEnvironment(environment = process.env) {
  const raw = environment.EVAVO_ART_LOCAL_GATE_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_COMMAND_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1_000 || value > MAX_COMMAND_TIMEOUT_MS) {
    fail(
      "LOCAL_GATE_TIMEOUT_INVALID",
      `EVAVO_ART_LOCAL_GATE_TIMEOUT_MS must be an integer from 1000 to ${MAX_COMMAND_TIMEOUT_MS}.`,
    );
  }
  return value;
}

export function normaliseRepositoryPath(value) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new TypeError("repository path must be a safe string");
  }
  const result = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (
    !result ||
    result.startsWith("/") ||
    /^[A-Za-z]:\//u.test(result) ||
    result.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new TypeError(`unsafe repository path: ${value}`);
  }
  return result;
}

function stableUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueCommands(commands) {
  const seen = new Set();
  return commands.filter((entry) => {
    const key = JSON.stringify([entry.executable, entry.args]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readJson(file, label = file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail("LOCAL_GATE_JSON_INVALID", `${label} is not valid JSON.`, { cause: error });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("LOCAL_GATE_JSON_ROOT_INVALID", `${label} must contain a JSON object.`);
  }
  return parsed;
}

function ordinaryDirectory(file, label) {
  const state = fs.lstatSync(file);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    fail("LOCAL_GATE_WORKSPACE_DIRECTORY_INVALID", `${label} must be an ordinary directory.`);
  }
}

function ordinaryFile(file, label) {
  const state = fs.lstatSync(file);
  if (state.isSymbolicLink() || !state.isFile()) {
    fail("LOCAL_GATE_WORKSPACE_MANIFEST_INVALID", `${label} must be an ordinary file.`);
  }
}

export function discoverWorkspaceManifests(root = REPOSITORY_ROOT) {
  const manifests = [];
  for (const family of ["packages", "apps"]) {
    const familyRoot = path.join(root, family);
    if (!fs.existsSync(familyRoot)) continue;
    ordinaryDirectory(familyRoot, family);
    const entries = fs
      .readdirSync(familyRoot, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const relativePath = `${family}/${entry.name}`;
      const workspaceRoot = path.join(root, relativePath);
      ordinaryDirectory(workspaceRoot, relativePath);
      const manifestPath = path.join(workspaceRoot, "package.json");
      if (!fs.existsSync(manifestPath)) continue;
      ordinaryFile(manifestPath, `${relativePath}/package.json`);
      manifests.push(
        Object.freeze({
          path: relativePath,
          manifest: readJson(manifestPath, `${relativePath}/package.json`),
        }),
      );
    }
  }
  return Object.freeze(manifests);
}

function scriptNames(manifest) {
  const scripts =
    manifest.scripts && typeof manifest.scripts === "object" && !Array.isArray(manifest.scripts)
      ? manifest.scripts
      : {};
  return new Set(
    Object.entries(scripts)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([name]) => name),
  );
}

export function buildWorkspaceGraph(manifests) {
  if (!Array.isArray(manifests)) throw new TypeError("workspace manifests must be an array");
  const byPath = new Map();
  const byName = new Map();

  for (const [index, entry] of manifests.entries()) {
    if (!entry || typeof entry !== "object") {
      fail("LOCAL_GATE_WORKSPACE_ENTRY_INVALID", `workspace manifest ${index} is invalid.`);
    }
    const workspacePath = normaliseRepositoryPath(entry.path);
    if (!/^(?:packages|apps)\/[^/]+$/u.test(workspacePath)) {
      fail("LOCAL_GATE_WORKSPACE_PATH_INVALID", `${workspacePath} is not a direct workspace path.`);
    }
    const manifest = entry.manifest;
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      fail("LOCAL_GATE_WORKSPACE_MANIFEST_INVALID", `${workspacePath}/package.json must be an object.`);
    }
    const name = text(manifest.name, `${workspacePath} package name`, 256);
    if (byPath.has(workspacePath)) {
      fail("LOCAL_GATE_WORKSPACE_PATH_DUPLICATE", `duplicate workspace path ${workspacePath}.`);
    }
    if (byName.has(name)) {
      fail("LOCAL_GATE_WORKSPACE_NAME_DUPLICATE", `duplicate workspace package name ${name}.`);
    }
    const node = {
      path: workspacePath,
      name,
      scripts: scriptNames(manifest),
      manifest,
      dependencies: new Set(),
      dependants: new Set(),
    };
    byPath.set(workspacePath, node);
    byName.set(name, node);
  }

  for (const node of byPath.values()) {
    for (const field of INTERNAL_DEPENDENCY_FIELDS) {
      const values = node.manifest[field];
      if (!values || typeof values !== "object" || Array.isArray(values)) continue;
      for (const dependencyName of Object.keys(values)) {
        const dependency = byName.get(dependencyName);
        if (!dependency || dependency.path === node.path) continue;
        node.dependencies.add(dependency.path);
        dependency.dependants.add(node.path);
      }
    }
  }

  return Object.freeze({ byPath, byName });
}

export function discoverWorkspaceGraph(root = REPOSITORY_ROOT) {
  return buildWorkspaceGraph([...discoverWorkspaceManifests(root)]);
}

export function expandWorkspaceClosure(seedPaths, graph) {
  if (!graph || !(graph.byPath instanceof Map)) {
    throw new TypeError("workspace graph is invalid");
  }
  const selected = new Set();
  const pending = stableUnique([...seedPaths].map(normaliseRepositoryPath));
  while (pending.length) {
    const workspacePath = pending.shift();
    if (selected.has(workspacePath)) continue;
    const node = graph.byPath.get(workspacePath);
    if (!node) {
      fail(
        "LOCAL_GATE_WORKSPACE_MISSING",
        `changed workspace ${workspacePath} has no current package manifest; complete validation is required.`,
      );
    }
    selected.add(workspacePath);
    const related = stableUnique([...node.dependencies, ...node.dependants]);
    for (const candidate of related) {
      if (!selected.has(candidate) && !pending.includes(candidate)) pending.push(candidate);
    }
    pending.sort((left, right) => left.localeCompare(right));
  }
  return Object.freeze(stableUnique([...selected]));
}

export function topologicalWorkspaceOrder(workspacePaths, graph) {
  const selected = new Set([...workspacePaths].map(normaliseRepositoryPath));
  const indegree = new Map();
  const dependants = new Map();
  for (const workspacePath of selected) {
    const node = graph.byPath.get(workspacePath);
    if (!node) fail("LOCAL_GATE_WORKSPACE_MISSING", `workspace ${workspacePath} is absent from the graph.`);
    const selectedDependencies = [...node.dependencies].filter((entry) => selected.has(entry));
    indegree.set(workspacePath, selectedDependencies.length);
    for (const dependency of selectedDependencies) {
      const list = dependants.get(dependency) ?? [];
      list.push(workspacePath);
      dependants.set(dependency, list);
    }
  }

  const ready = [...selected]
    .filter((workspacePath) => indegree.get(workspacePath) === 0)
    .sort((left, right) => left.localeCompare(right));
  const ordered = [];
  while (ready.length) {
    const workspacePath = ready.shift();
    ordered.push(workspacePath);
    for (const dependant of (dependants.get(workspacePath) ?? []).sort((left, right) => left.localeCompare(right))) {
      const next = (indegree.get(dependant) ?? 0) - 1;
      indegree.set(dependant, next);
      if (next === 0) {
        ready.push(dependant);
        ready.sort((left, right) => left.localeCompare(right));
      }
    }
  }

  // Cycles are retained deterministically instead of silently dropping workspaces.
  for (const workspacePath of [...selected].sort((left, right) => left.localeCompare(right))) {
    if (!ordered.includes(workspacePath)) ordered.push(workspacePath);
  }
  return Object.freeze(ordered);
}

function workspaceCommands(workspacePaths, graph) {
  const commands = [];
  for (const workspacePath of topologicalWorkspaceOrder(workspacePaths, graph)) {
    const node = graph.byPath.get(workspacePath);
    for (const script of WORKSPACE_SCRIPT_ORDER) {
      if (!node.scripts.has(script)) continue;
      commands.push(
        command(`${script} ${node.name}`, "pnpm", "--filter", node.name, "run", script),
      );
    }
  }
  return commands;
}

export function batchPythonFiles(files, maximumCharacters = process.platform === "win32" ? 12_000 : 96_000) {
  if (!Number.isInteger(maximumCharacters) || maximumCharacters < 256) {
    throw new TypeError("maximum Python batch characters must be an integer of at least 256");
  }
  const batches = [];
  let current = [];
  let currentCharacters = 0;
  for (const file of stableUnique(files.map(normaliseRepositoryPath))) {
    const cost = file.length + 1;
    if (cost > maximumCharacters) {
      fail("LOCAL_GATE_PYTHON_PATH_TOO_LONG", `${file} exceeds the safe Python command-line bound.`);
    }
    if (current.length && currentCharacters + cost > maximumCharacters) {
      batches.push(Object.freeze(current));
      current = [];
      currentCharacters = 0;
    }
    current.push(file);
    currentCharacters += cost;
  }
  if (current.length) batches.push(Object.freeze(current));
  return Object.freeze(batches);
}

function changedPythonCommands(files, root = REPOSITORY_ROOT) {
  const pythonFiles = files.filter((file) => file.endsWith(".py"));
  const commands = [];
  const batches = batchPythonFiles(pythonFiles);
  for (const [index, batch] of batches.entries()) {
    commands.push(
      command(
        `Compile changed Python sources${batches.length > 1 ? ` batch ${index + 1}` : ""}`,
        "python",
        "-m",
        "py_compile",
        ...batch,
      ),
    );
  }
  const tests = new Set();
  for (const file of pythonFiles) {
    if (/^scripts\/test-[^/]+\.py$/u.test(file)) tests.add(file);
    const match = /^tools\/([^/]+)\.py$/u.exec(file);
    if (match) {
      const testPath = `scripts/test-${match[1].replaceAll("_", "-")}.py`;
      if (fs.existsSync(path.join(root, testPath))) tests.add(testPath);
    }
  }
  for (const testPath of [...tests].sort()) {
    commands.push(command(`Run ${testPath}`, "python", testPath, "-v"));
  }
  return commands;
}

function changedNodeCommands(files, root = REPOSITORY_ROOT) {
  const commands = [];
  const tests = new Set();
  for (const file of files.filter((entry) => /^(?:scripts|tools)\/[^/]+\.mjs$/u.test(entry)).sort()) {
    commands.push(command(`Syntax-check ${file}`, process.execPath, "--check", file));
    if (/^scripts\/test-[^/]+\.mjs$/u.test(file) || /\.test\.mjs$/u.test(file)) tests.add(file);

    const directory = path.posix.dirname(file);
    const base = path.posix.basename(file, ".mjs");
    const candidates = new Set([
      `${directory}/${base}.test.mjs`,
      `scripts/test-${base}.mjs`,
    ]);
    for (const prefix of ["compile-", "check-", "build-"]) {
      if (base.startsWith(prefix)) candidates.add(`scripts/test-${base.slice(prefix.length)}.mjs`);
    }
    if (directory === "tools") candidates.add(`scripts/test-${base.replaceAll("_", "-")}.mjs`);
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(root, candidate))) tests.add(candidate);
    }
  }
  for (const testPath of [...tests].sort()) {
    commands.push(command(`Run ${testPath}`, process.execPath, "--test", testPath));
  }
  return commands;
}

function requiresFullValidation(files) {
  return files.some(
    (file) =>
      /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.base\.json|\.nvmrc|\.gitattributes|\.gitignore)$/u.test(file) ||
      /^(?:contracts|schemas|requirements)\//u.test(file) ||
      /^evavo\.(?:capabilities|reliability|tasks)\.json$/u.test(file) ||
      /^scripts\/(?:check|test)-repository-toolchain\.mjs$/u.test(file),
  );
}

function workspaceSeeds(files) {
  const result = new Set();
  for (const file of files) {
    const match = /^(packages|apps)\/([^/]+)(?:\/|$)/u.exec(file);
    if (match) result.add(`${match[1]}/${match[2]}`);
  }
  return [...result].sort((left, right) => left.localeCompare(right));
}

export function planForChanges(inputFiles, options = {}) {
  const root = options.root ?? REPOSITORY_ROOT;
  const files = stableUnique(inputFiles.map(normaliseRepositoryPath));
  if (requiresFullValidation(files)) {
    return Object.freeze({
      requestedProfile: "changed",
      profile: "full",
      reason: "cross-cutting repository contract changed",
      files,
      workspaces: Object.freeze([]),
      commands: FULL_COMMANDS,
      requireCleanStart: false,
      proveNoMutation: true,
    });
  }

  const commands = [command("Check repository diff formatting", "git", "diff", "--check"), ...LOCAL_CONTRACT_COMMANDS];
  let workspaces = [];
  const seeds = workspaceSeeds(files);
  if (seeds.length) {
    try {
      const graph = options.graph ?? discoverWorkspaceGraph(root);
      workspaces = [...expandWorkspaceClosure(seeds, graph)];
      commands.push(...workspaceCommands(workspaces, graph));
    } catch (error) {
      if (error instanceof LocalQualityGateError && error.code === "LOCAL_GATE_WORKSPACE_MISSING") {
        return Object.freeze({
          requestedProfile: "changed",
          profile: "full",
          reason: error.message,
          files,
          workspaces: Object.freeze([]),
          commands: FULL_COMMANDS,
          requireCleanStart: false,
          proveNoMutation: true,
        });
      }
      throw error;
    }
  }
  commands.push(...changedPythonCommands(files, root));
  commands.push(...changedNodeCommands(files, root));

  return Object.freeze({
    requestedProfile: "changed",
    profile: "changed",
    reason: files.length
      ? "dependency-aware checks selected from changed paths"
      : "no changed paths resolved; local contracts only",
    files,
    workspaces: Object.freeze(workspaces),
    commands: Object.freeze(uniqueCommands(commands)),
    requireCleanStart: false,
    proveNoMutation: true,
  });
}

export function parsePrePushUpdates(input) {
  if (typeof input !== "string") throw new TypeError("pre-push input must be a string");
  return input
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      const fields = line.trim().split(/\s+/u);
      if (fields.length !== 4) {
        fail("LOCAL_GATE_PREPUSH_FIELDS_INVALID", `pre-push line ${index + 1} must contain four fields`);
      }
      const [localRef, localSha, remoteRef, remoteSha] = fields;
      if (!REF.test(localRef) || !REF.test(remoteRef)) {
        fail("LOCAL_GATE_PREPUSH_REF_INVALID", `pre-push line ${index + 1} contains an invalid ref`);
      }
      if (!SHA.test(localSha) || !SHA.test(remoteSha)) {
        fail("LOCAL_GATE_PREPUSH_SHA_INVALID", `pre-push line ${index + 1} contains an invalid SHA`);
      }
      return Object.freeze({ localRef, localSha, remoteRef, remoteSha });
    });
}

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.root ?? REPOSITORY_ROOT,
    encoding: "utf8",
    shell: false,
    timeout: options.timeoutMs ?? 30_000,
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    if (options.optional) return undefined;
    fail("LOCAL_GATE_GIT_EXECUTION_FAILED", `git ${args.join(" ")} failed.`, { cause: result.error });
  }
  if (result.status !== 0) {
    if (options.optional) return undefined;
    fail(
      "LOCAL_GATE_GIT_COMMAND_FAILED",
      `git ${args.join(" ")} failed: ${(result.stderr || "").trim()}`,
    );
  }
  return (result.stdout || "").trim();
}

function baseForNewRef(localSha, root) {
  const mergeBase = runGit(["merge-base", localSha, "refs/remotes/origin/main"], {
    root,
    optional: true,
  });
  if (mergeBase && SHA.test(mergeBase)) return mergeBase;
  const roots = runGit(["rev-list", "--max-parents=0", localSha], { root });
  const first = roots.split(/\r?\n/u).find((entry) => SHA.test(entry));
  if (!first) fail("LOCAL_GATE_BASE_UNAVAILABLE", `could not determine a base commit for ${localSha}`);
  return first;
}

function filesForUpdates(updates, root = REPOSITORY_ROOT) {
  const files = new Set();
  for (const update of updates) {
    if (ZERO_SHA.test(update.localSha)) continue;
    const base = ZERO_SHA.test(update.remoteSha)
      ? baseForNewRef(update.localSha, root)
      : update.remoteSha;
    const output = runGit(
      ["diff", "--name-only", "--diff-filter=ACMRD", `${base}..${update.localSha}`],
      { root },
    );
    for (const file of output.split(/\r?\n/u).filter(Boolean)) {
      files.add(normaliseRepositoryPath(file));
    }
  }
  return [...files].sort((left, right) => left.localeCompare(right));
}

function changedFilesFromWorkingTree(root = REPOSITORY_ROOT) {
  const files = new Set();
  const upstream = runGit(["rev-parse", "--verify", "@{upstream}"], {
    root,
    optional: true,
  });
  const range = upstream && SHA.test(upstream) ? `${upstream}...HEAD` : "HEAD^..HEAD";
  const commands = [
    ["diff", "--name-only", "--diff-filter=ACMRD", range],
    ["diff", "--name-only", "--diff-filter=ACMRD"],
    ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  for (const args of commands) {
    const output = runGit(args, { root, optional: true });
    if (output === undefined) continue;
    for (const file of output.split(/\r?\n/u).filter(Boolean)) {
      files.add(normaliseRepositoryPath(file));
    }
  }
  return [...files].sort((left, right) => left.localeCompare(right));
}

function fixedPlan(requestedProfile, profile, reason, commands, options = {}) {
  return Object.freeze({
    requestedProfile,
    profile,
    reason,
    files: Object.freeze(options.files ?? []),
    workspaces: Object.freeze(options.workspaces ?? []),
    commands,
    requireCleanStart: options.requireCleanStart ?? false,
    proveNoMutation: options.proveNoMutation ?? true,
  });
}

export function buildPlan(requestedProfile, options = {}) {
  const profile = canonicalProfile(requestedProfile);
  if (profile === "fast") {
    return fixedPlan(requestedProfile, "fast", "bounded local smoke and contract validation", FAST_COMMANDS);
  }
  if (profile === "full") {
    return fixedPlan(requestedProfile, "full", "complete local validation requested", FULL_COMMANDS);
  }
  if (profile === "release") {
    return fixedPlan(
      requestedProfile,
      "release",
      "clean, complete local release validation requested",
      FULL_COMMANDS,
      { requireCleanStart: true },
    );
  }
  if (profile === "changed") {
    const plan = planForChanges(
      options.files ?? changedFilesFromWorkingTree(options.root),
      options,
    );
    return Object.freeze({ ...plan, requestedProfile });
  }

  const updates = options.updates ?? [];
  if (updates.some((entry) => entry.remoteRef === "refs/heads/main" && !ZERO_SHA.test(entry.localSha))) {
    return fixedPlan(
      requestedProfile,
      "release",
      "push updates main; clean complete local validation is authoritative",
      FULL_COMMANDS,
      { requireCleanStart: true },
    );
  }
  const plan = planForChanges(
    updates.length
      ? filesForUpdates(updates, options.root)
      : options.files ?? changedFilesFromWorkingTree(options.root),
    options,
  );
  return Object.freeze({ ...plan, requestedProfile });
}

export function assertCommandSafe(entry) {
  if (!entry || typeof entry !== "object") {
    fail("LOCAL_GATE_COMMAND_INVALID", "validation command must be an object.");
  }
  const executable = text(entry.executable, "command executable", 4_096);
  if (!SAFE_EXECUTABLES.has(executable)) {
    fail("LOCAL_GATE_EXECUTABLE_FORBIDDEN", `validation executable is not allow-listed: ${executable}`);
  }
  if (!Array.isArray(entry.args)) {
    fail("LOCAL_GATE_ARGUMENTS_INVALID", "validation command arguments must be an array.");
  }
  for (const [index, argument] of entry.args.entries()) {
    if (typeof argument !== "string" || argument.includes("\0") || argument.length > 32_768) {
      fail("LOCAL_GATE_ARGUMENT_INVALID", `validation argument ${index} is unsafe.`);
    }
  }
}

function terminateProcessTree(child, force = false) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      timeout: 10_000,
    });
    return;
  }
  const signal = force ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The child has already exited.
    }
  }
}

export async function runCommand(entry, options = {}) {
  assertCommandSafe(entry);
  const root = options.root ?? REPOSITORY_ROOT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const started = Date.now();
  const child = spawn(entry.executable, entry.args, {
    cwd: root,
    env: options.environment ?? process.env,
    shell: false,
    stdio: options.stdio ?? "inherit",
    detached: process.platform !== "win32",
    windowsHide: true,
  });

  return await new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let aborted = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      options.signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      aborted = true;
      terminateProcessTree(child, false);
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child, false);
    }, timeoutMs);
    timer.unref?.();
    const forceTimer = setTimeout(() => {
      if (timedOut || aborted) terminateProcessTree(child, true);
    }, timeoutMs + 5_000);
    forceTimer.unref?.();

    child.once("error", (error) => {
      finish(() =>
        reject(
          new LocalQualityGateError(
            "LOCAL_GATE_COMMAND_SPAWN_FAILED",
            `${entry.label} could not start: ${error.message}`,
            { cause: error },
          ),
        ),
      );
    });
    child.once("exit", (code, signal) => {
      const result = Object.freeze({
        label: entry.label,
        command: Object.freeze([entry.executable, ...entry.args]),
        status: timedOut ? "timed-out" : aborted ? "cancelled" : code === 0 ? "passed" : "failed",
        exitCode: code,
        signal,
        durationMs: Date.now() - started,
      });
      finish(() => {
        if (timedOut) {
          reject(
            new LocalQualityGateError(
              "LOCAL_GATE_COMMAND_TIMEOUT",
              `${entry.label} exceeded the ${timeoutMs} ms command timeout.`,
            ),
          );
        } else if (aborted) {
          reject(
            new LocalQualityGateError("LOCAL_GATE_CANCELLED", `${entry.label} was cancelled.`),
          );
        } else if (code !== 0) {
          const error = new LocalQualityGateError(
            "LOCAL_GATE_COMMAND_FAILED",
            `${entry.label} failed with exit code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}.`,
          );
          error.result = result;
          reject(error);
        } else resolve(result);
      });
    });
  });
}

export function worktreeSnapshot(root = REPOSITORY_ROOT) {
  const status = runGit(["status", "--porcelain=v1", "--untracked-files=all"], { root });
  return Object.freeze({
    status,
    clean: status.length === 0,
    sha256: createHash("sha256").update(status, "utf8").digest("hex"),
  });
}

function headSha(root = REPOSITORY_ROOT) {
  const value = runGit(["rev-parse", "HEAD"], { root, optional: true });
  return value && SHA.test(value) ? value : null;
}

function fileSha256(file) {
  return fs.existsSync(file)
    ? createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    : null;
}

export function serialisablePlan(plan) {
  return Object.freeze({
    schema: "evavo.art-studio.local-quality-plan.v2",
    requestedProfile: plan.requestedProfile,
    profile: plan.profile,
    reason: plan.reason,
    files: plan.files,
    workspaces: plan.workspaces,
    requireCleanStart: plan.requireCleanStart,
    proveNoMutation: plan.proveNoMutation,
    commands: plan.commands.map((entry) => ({
      label: entry.label,
      command: [entry.executable, ...entry.args],
    })),
    authority: {
      cloudRequired: false,
      githubActionsRequired: false,
      vercelRequired: false,
      providerExecution: false,
      deployment: false,
      publication: false,
      artifactPromotion: false,
      repositoryMutation: false,
      storageMutation: false,
      forcePush: false,
    },
  });
}

export function planFingerprint(plan, options = {}) {
  const root = options.root ?? REPOSITORY_ROOT;
  const payload = {
    plan: serialisablePlan(plan),
    headSha: options.headSha ?? headSha(root),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    lockfileSha256: options.lockfileSha256 ?? fileSha256(path.join(root, "pnpm-lock.yaml")),
    worktreeSha256: options.worktreeSha256 ?? worktreeSnapshot(root).sha256,
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function safeTimestamp(value) {
  return value.replace(/[:.]/gu, "-");
}

function writeAtomic(file, bytes) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  if (process.platform === "win32" && fs.existsSync(file)) fs.rmSync(file, { force: true });
  fs.renameSync(temporary, file);
}

export function writeReceiptAtomic(receipt, options = {}) {
  const root = options.root ?? REPOSITORY_ROOT;
  const receiptRoot = path.join(root, RECEIPT_RELATIVE_ROOT);
  const endedAt = typeof receipt.endedAt === "string" ? receipt.endedAt : new Date().toISOString();
  const head = typeof receipt.headSha === "string" ? receipt.headSha.slice(0, 12) : "no-head";
  const name = `${safeTimestamp(endedAt)}-${receipt.profile}-${head}-${receipt.runId}.json`;
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  const versionedPath = path.join(receiptRoot, name);
  const latestPath = path.join(receiptRoot, "latest.json");
  writeAtomic(versionedPath, payload);
  writeAtomic(latestPath, payload);
  return Object.freeze({ versionedPath, latestPath });
}

function readLatestReceipt(root = REPOSITORY_ROOT) {
  const file = path.join(root, RECEIPT_RELATIVE_ROOT, "latest.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function cacheEnabled(environment = process.env) {
  return environment.EVAVO_ART_LOCAL_GATE_CACHE === "1";
}

function cacheEligible(plan){
  return plan.profile !== "release" && plan.requestedProfile !== "push" && plan.requestedProfile !== "prepush";
}
