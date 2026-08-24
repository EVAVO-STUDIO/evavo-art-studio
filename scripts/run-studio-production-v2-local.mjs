#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = resolve(ROOT, "studio.production.v2.json");
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 180_000;
const SHELL_CONTROL = /[\0\r\n;&|`$<>]/u;
const SAFE_COMMANDS = new Set(["node", "python", "python3"]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const withinRoot = (candidate) => {
  const rel = relative(ROOT, resolve(candidate));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
};

function readManifest() {
  const bytes = readFileSync(MANIFEST_PATH);
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest?.schema !== "evavo_studio_production_manifest_v2") throw new Error("studio.production.v2.json has the wrong schema");
  for (const key of ["automaticCreativeApproval", "automaticReleaseApproval", "automaticPublication", "automaticDeployment"]) {
    if (manifest.authority?.[key] !== false) throw new Error(`manifest authority must keep ${key}=false`);
  }
  if (manifest.automation?.networkRequiredDuringValidation !== false || manifest.automation?.sourceMutationDuringValidation !== false) throw new Error("local validation must be networkless and source-preserving");
  return { manifest, manifestSha256: digest(bytes) };
}

function normalizeCommand(tokens, label) {
  if (!Array.isArray(tokens) || tokens.length < 2 || tokens.length > 64) throw new Error(`${label} must be a bounded argv array`);
  const values = tokens.map((token, index) => {
    if (typeof token !== "string" || !token || token.length > 1024 || SHELL_CONTROL.test(token)) throw new Error(`${label}[${index}] is unsafe`);
    return token;
  });
  if (!SAFE_COMMANDS.has(values[0])) throw new Error(`${label} executable is not admitted: ${values[0]}`);
  if (values[0] === "python") values[0] = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  return values;
}

function gitStatus() {
  if (!existsSync(resolve(ROOT, ".git"))) return { available: false, porcelain: "" };
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8", shell: false, timeout: 30_000, maxBuffer: MAX_OUTPUT_BYTES });
  if (result.status !== 0) throw new Error(`git status failed: ${result.stderr || result.error}`);
  return { available: true, porcelain: result.stdout };
}

function runCommand(argv, label, environment) {
  const startedAt = new Date();
  const start = Date.now();
  const result = spawnSync(argv[0], argv.slice(1), { cwd: ROOT, env: environment, encoding: "utf8", shell: false, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const receipt = { label, argv, startedAt: startedAt.toISOString(), durationMs: Date.now() - start, exitCode: result.status, signal: result.signal || null, stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr), stdoutSha256: digest(stdout), stderrSha256: digest(stderr) };
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (result.error || result.status !== 0) throw Object.assign(new Error(`${label} failed: ${result.error?.message || `exit ${result.status}`}`), { receipt });
  return receipt;
}

function compileCommands(manifest, temporary) {
  const nodeFiles = [];
  const pythonFiles = [];
  for (const contract of manifest.contracts || []) {
    const candidate = resolve(ROOT, contract.path);
    if (!withinRoot(candidate)) throw new Error(`contract path escapes repository: ${contract.path}`);
    if (contract.path.endsWith(".mjs") || contract.path.endsWith(".js")) nodeFiles.push(contract.path);
    if (contract.path.endsWith(".py")) pythonFiles.push(contract.path);
  }
  const commands = nodeFiles.map((path) => ({ label: `syntax:${path}`, argv: ["node", "--check", path] }));
  if (pythonFiles.length) commands.push({ label: "python-contract-compile", argv: [process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), "-B", "-m", "py_compile", ...pythonFiles], environment: { PYTHONPYCACHEPREFIX: temporary } });
  return commands;
}

function parseArguments() {
  const args = process.argv.slice(2);
  let receiptPath = null;
  let planOnly = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--plan") planOnly = true;
    else if (args[index] === "--receipt") {
      receiptPath = args[++index];
      if (!receiptPath) throw new Error("--receipt requires a path");
    } else throw new Error(`unknown argument: ${args[index]}`);
  }
  if (receiptPath && withinRoot(receiptPath)) throw new Error("receipt path must be outside the repository source tree");
  return { receiptPath, planOnly };
}

function writeReceipt(path, receipt) {
  const destination = resolve(path);
  const temporary = `${destination}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, destination);
}

const { receiptPath, planOnly } = parseArguments();
const { manifest, manifestSha256 } = readManifest();
const temporary = mkdtempSync(resolve(tmpdir(), "evavo-studio-production-v2-"));
const environment = { ...process.env, CI: "true", NO_COLOR: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", PYTHONUTF8: "1", PYTHONPYCACHEPREFIX: temporary, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1", TOKENIZERS_PARALLELISM: "false" };
const commands = [
  { label: "manifest-validator", argv: normalizeCommand(manifest.entrypoints.validate, "entrypoints.validate") },
  { label: "focused-suite", argv: normalizeCommand(manifest.entrypoints.focused, "entrypoints.focused") },
  ...compileCommands(manifest, temporary),
];
const baseReceipt = { schema: "evavo_studio_production_local_receipt_v1", studioId: manifest.studioId, repository: manifest.repository, manifestSha256, plannedAt: new Date().toISOString(), planOnly, commands: commands.map(({ label, argv }) => ({ label, argv })), authority: { automaticCreativeApproval: false, automaticReleaseApproval: false, publicationAuthority: false, deploymentAuthority: false } };

try {
  if (planOnly) {
    const receipt = { ...baseReceipt, status: "planned", receiptSha256: digest(JSON.stringify(baseReceipt)) };
    if (receiptPath) writeReceipt(receiptPath, receipt);
    console.log(JSON.stringify(receipt, null, 2));
    process.exit(0);
  }
  const before = gitStatus();
  if (before.available && before.porcelain) throw new Error("repository must be clean before local validation");
  const commandReceipts = commands.map((command) => runCommand(command.argv, command.label, { ...environment, ...(command.environment || {}) }));
  const after = gitStatus();
  if (after.available && after.porcelain) throw new Error("local validation mutated repository source");
  const body = { ...baseReceipt, status: "passed", completedAt: new Date().toISOString(), sourceCleanBefore: !before.porcelain, sourceCleanAfter: !after.porcelain, gitStatusAvailable: before.available && after.available, commandReceipts };
  const receipt = { ...body, receiptSha256: digest(JSON.stringify(body)) };
  if (receiptPath) writeReceipt(receiptPath, receipt);
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  const body = { ...baseReceipt, status: "failed", completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error), failedCommandReceipt: error?.receipt || null };
  const receipt = { ...body, receiptSha256: digest(JSON.stringify(body)) };
  if (receiptPath) writeReceipt(receiptPath, receipt);
  console.error(JSON.stringify(receipt, null, 2));
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
