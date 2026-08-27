#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ZERO_SHA = /^0{40}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const MODES = new Set(["quick", "changed", "prepush", "full"]);
const REF = /^(?:refs\/[^\s\0]+|HEAD|\(delete\))$/u;

function command(label, executable, ...args) {
  return Object.freeze({ label, executable, args: Object.freeze(args) });
}

const LOCAL_CONTRACT_COMMANDS = Object.freeze([
  command(
    "Validate local-first gate and workflow context contracts",
    process.execPath,
    "--test",
    "scripts/test-local-quality-gate.mjs",
    "scripts/test-github-workflow-contexts.mjs",
  ),
  command(
    "Validate GitHub workflow expression contexts locally",
    process.execPath,
    "scripts/check-github-workflow-contexts.mjs",
  ),
]);

const QUICK_COMMANDS = Object.freeze([
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
  command("Type-check quality package", "pnpm", "--filter", "@evavo/art-quality", "typecheck"),
  command("Test quality package", "pnpm", "--filter", "@evavo/art-quality", "test"),
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

function uniqueCommands(commands) {
  const seen = new Set();
  return commands.filter((entry) => {
    const key = JSON.stringify([entry.executable, entry.args]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normaliseRepositoryPath(value) {
  if (typeof value !== "string" || value.includes("\0")) throw new TypeError("repository path must be a safe string");
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

function packageName(workspacePath, root = REPOSITORY_ROOT) {
  const manifest = path.join(root, workspacePath, "package.json");
  if (!fs.existsSync(manifest)) return undefined;
  const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
  return typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : undefined;
}

function workspaceCommands(workspacePath, root = REPOSITORY_ROOT) {
  const manifestPath = path.join(root, workspacePath, "package.json");
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const name = packageName(workspacePath, root);
  if (!name) throw new Error(`${workspacePath}/package.json requires a package name`);
  const scripts = manifest.scripts && typeof manifest.scripts === "object" ? manifest.scripts : {};
  return ["build", "typecheck", "test"]
    .filter((script) => typeof scripts[script] === "string")
    .map((script) => command(`${script} ${name}`, "pnpm", "--filter", name, "run", script));
}

function changedPythonCommands(files, root = REPOSITORY_ROOT) {
  const pythonFiles = files.filter((file) => file.endsWith(".py"));
  const commands = [];
  if (pythonFiles.length) {
    commands.push(command("Compile changed Python sources", "python", "-m", "py_compile", ...pythonFiles));
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
    if (directory === "tools") {
      candidates.add(`scripts/test-${base.replaceAll("_", "-")}.mjs`);
    }
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
  return files.some((file) =>
    /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.base\.json|\.nvmrc|\.gitattributes|\.gitignore)$/u.test(file) ||
    /^(?:contracts|schemas|requirements)\//u.test(file) ||
    /^evavo\.(?:capabilities|reliability|tasks)\.json$/u.test(file) ||
    /^scripts\/(?:check|test)-repository-toolchain\.mjs$/u.test(file),
  );
}

export function planForChanges(inputFiles, options = {}) {
  const root = options.root ?? REPOSITORY_ROOT;
  const files = [...new Set(inputFiles.map(normaliseRepositoryPath))].sort();
  if (requiresFullValidation(files)) {
    return Object.freeze({ mode: "full", reason: "cross-cutting repository contract changed", files, commands: FULL_COMMANDS });
  }
  const commands = [...LOCAL_CONTRACT_COMMANDS];
  const workspaces = new Set();
  for (const file of files) {
    const match = /^(packages|apps)\/([^/]+)\//u.exec(file);
    if (match) workspaces.add(`${match[1]}/${match[2]}`);
  }
  for (const workspace of [...workspaces].sort()) commands.push(...workspaceCommands(workspace, root));
  commands.push(...changedPythonCommands(files, root));
  commands.push(...changedNodeCommands(files, root));
  if (commands.length === LOCAL_CONTRACT_COMMANDS.length) commands.push(command("Check repository diff formatting", "git", "diff", "--check"));
  return Object.freeze({
    mode: "changed",
    reason: files.length ? "targeted checks selected from changed paths" : "no changed paths resolved; local contracts only",
    files,
    commands: Object.freeze(uniqueCommands(commands)),
  });
}

export function parsePrePushUpdates(input) {
  if (typeof input !== "string") throw new TypeError("pre-push input must be a string");
  return input.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    const fields = line.trim().split(/\s+/u);
    if (fields.length !== 4) throw new Error(`pre-push line ${index + 1} must contain four fields`);
    const [localRef, localSha, remoteRef, remoteSha] = fields;
    if (!REF.test(localRef) || !REF.test(remoteRef)) throw new Error(`pre-push line ${index + 1} contains an invalid ref`);
    if (!SHA.test(localSha) || !SHA.test(remoteSha)) throw new Error(`pre-push line ${index + 1} contains an invalid SHA`);
    return Object.freeze({ localRef, localSha, remoteRef, remoteSha });
  });
}

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.root ?? REPOSITORY_ROOT,
    encoding: "utf8",
    shell: false,
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    if (options.optional) return undefined;
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || "").trim()}`);
  }
  return (result.stdout || "").trim();
}

function baseForNewRef(localSha, root) {
  const mergeBase = runGit(["merge-base", localSha, "refs/remotes/origin/main"], { root, optional: true });
  if (mergeBase && SHA.test(mergeBase)) return mergeBase;
  const roots = runGit(["rev-list", "--max-parents=0", localSha], { root });
  const first = roots.split(/\r?\n/u).find((entry) => SHA.test(entry));
  if (!first) throw new Error(`could not determine a base commit for ${localSha}`);
  return first;
}

function filesForUpdates(updates, root = REPOSITORY_ROOT) {
  const files = new Set();
  for (const update of updates) {
    if (ZERO_SHA.test(update.localSha)) continue;
    const base = ZERO_SHA.test(update.remoteSha) ? baseForNewRef(update.localSha, root) : update.remoteSha;
    const output = runGit(["diff", "--name-only", "--diff-filter=ACMRD", `${base}..${update.localSha}`], { root });
    for (const file of output.split(/\r?\n/u).filter(Boolean)) files.add(normaliseRepositoryPath(file));
  }
  return [...files].sort();
}

function changedFilesFromWorkingTree(root = REPOSITORY_ROOT) {
  const files = new Set();
  const upstream = runGit(["rev-parse", "--verify", "@{upstream}"], { root, optional: true });
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
    for (const file of output.split(/\r?\n/u).filter(Boolean)) files.add(normaliseRepositoryPath(file));
  }
  return [...files].sort();
}

export function buildPlan(mode, options = {}) {
  if (!MODES.has(mode)) throw new Error(`mode must be one of ${[...MODES].join(", ")}`);
  if (mode === "quick") return Object.freeze({ mode, reason: "bounded local smoke and contract validation", files: [], commands: QUICK_COMMANDS });
  if (mode === "full") return Object.freeze({ mode, reason: "complete local validation requested", files: [], commands: FULL_COMMANDS });
  if (mode === "changed") return planForChanges(options.files ?? changedFilesFromWorkingTree(options.root), options);
  const updates = options.updates ?? [];
  if (updates.some((entry) => entry.remoteRef === "refs/heads/main")) {
    return Object.freeze({ mode: "full", reason: "push updates main; complete local validation is authoritative", files: [], commands: FULL_COMMANDS });
  }
  return planForChanges(filesForUpdates(updates, options.root), options);
}

function executePlan(plan, root = REPOSITORY_ROOT) {
  const pycache = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-art-studio-pycache-"));
  try {
    for (const entry of plan.commands) {
      process.stdout.write(`\n[art-studio local gate] ${entry.label}\n`);
      const result = spawnSync(entry.executable, entry.args, {
        cwd: root,
        env: { ...process.env, PYTHONPYCACHEPREFIX: pycache, PYTHONDONTWRITEBYTECODE: "1" },
        shell: false,
        stdio: "inherit",
      });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  } finally {
    fs.rmSync(pycache, { recursive: true, force: true });
  }
}

function serialisable(plan) {
  return {
    schema: "evavo.art-studio.local-quality-plan.v1",
    mode: plan.mode,
    reason: plan.reason,
    files: plan.files,
    commands: plan.commands.map((entry) => ({ label: entry.label, command: [entry.executable, ...entry.args] })),
    cloudRequired: false,
    githubActionsRequired: false,
    vercelRequired: false,
  };
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.find((entry) => !entry.startsWith("--")) ?? "changed";
  const planOnly = args.includes("--plan");
  let updates = [];
  if (mode === "prepush" && !process.stdin.isTTY) updates = parsePrePushUpdates(fs.readFileSync(0, "utf8"));
  const plan = buildPlan(mode, { updates, root: REPOSITORY_ROOT });
  process.stdout.write(`${JSON.stringify(serialisable(plan), null, 2)}\n`);
  if (!planOnly) executePlan(plan);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
