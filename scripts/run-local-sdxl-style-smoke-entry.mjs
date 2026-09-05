#!/usr/bin/env node
import { readFile, stat, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULT_KIND = 'evavo.art-studio-local-sdxl-style-smoke.v1';
const LOCAL_COMPUTE_RESULT_KIND = 'evavo-local-image-style-smoke-v1';
const DEFAULT_TIMEOUT_MS = 70 * 60 * 1000;

function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const result = { skipQueueRepair: false, localComputeRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--skip-queue-repair') { result.skipQueueRepair = true; continue; }
    if (argument === '--local-compute-root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail('--local-compute-root requires a value');
      if (result.localComputeRoot) fail('--local-compute-root may only be supplied once');
      result.localComputeRoot = value;
      index += 1;
      continue;
    }
    fail(`unsupported argument ${argument}`);
  }
  return Object.freeze(result);
}
function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const separator = trimmed.indexOf('=');
  if (separator <= 0) return null;
  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  return [key, value];
}
async function envLocalValue(key) {
  try {
    const source = await readFile(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of source.split(/\r?\n/u)) {
      const parsed = parseEnvLine(line);
      if (parsed?.[0] === key) return parsed[1];
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return null;
}
async function regularFile(file, label) {
  const details = await lstat(file).catch(() => null);
  if (!details?.isFile() || details.isSymbolicLink()) fail(`${label} is missing or not a regular file`);
  return file;
}
async function regularDirectory(directory, label) {
  const details = await lstat(directory).catch(() => null);
  if (!details?.isDirectory() || details.isSymbolicLink()) fail(`${label} is missing or not a regular directory`);
  return directory;
}
async function resolveLocalComputeRoot(explicit) {
  const configured = explicit?.trim() || process.env.EVAVO_LOCAL_COMPUTE_ROOT?.trim() || await envLocalValue('EVAVO_LOCAL_COMPUTE_ROOT');
  const candidate = configured ? path.resolve(configured) : path.resolve(ROOT, '..', 'evavo-local-compute');
  await regularDirectory(candidate, 'EVAVO local-compute checkout');
  await regularDirectory(path.join(candidate, '.git'), 'EVAVO local-compute Git metadata');
  return candidate;
}
function powershellPath() {
  if (process.platform !== 'win32') fail('local SDXL style smoke requires the EVAVO Windows workstation');
  const systemRoot = process.env.SystemRoot?.trim() || 'C:\\Windows';
  return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}
function parseLastJsonLine(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/u).filter((line) => line.trim());
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch { /* continue */ }
  }
  return null;
}
export function validateLocalComputeSmokeReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail('local-compute smoke emitted no JSON receipt');
  if (receipt.kind !== LOCAL_COMPUTE_RESULT_KIND) fail(`unexpected local-compute receipt kind ${String(receipt.kind ?? '')}`);
  if (receipt.ok !== true) fail('local-compute image style smoke did not pass');
  if (receipt.hostedFallbackUsed !== false) fail('local-compute smoke did not prove hosted fallback was disabled');
  if (receipt.artifactProofVerified !== true) fail('local-compute smoke did not verify output artifact evidence');
  if (!Number.isInteger(receipt.stylesCompleted) || receipt.stylesCompleted < 3) fail('local-compute smoke did not complete all required style outputs');
  const generation = receipt.generation;
  if (!generation || generation.ok !== true || generation.hostedFallbackUsed !== false) fail('local-compute generation receipt is not a successful local-only result');
  if (!Array.isArray(generation.results) || generation.results.length < 3) fail('local-compute generation receipt has insufficient style results');
  const styles = generation.results.map((row) => {
    const filename = typeof row?.filename === 'string' ? row.filename : '';
    const sha256 = typeof row?.sha256 === 'string' ? row.sha256 : '';
    const bytes = Number(row?.bytes ?? 0);
    if (!filename.toLowerCase().endsWith('.png') || !/^[a-f0-9]{64}$/u.test(sha256) || !Number.isSafeInteger(bytes) || bytes <= 0) fail('local-compute generation artifact evidence is malformed');
    return Object.freeze({
      styleId: String(row.styleId ?? ''), filename, bytes, sha256,
      durationSeconds: Number.isFinite(Number(row.durationSeconds)) ? Number(row.durationSeconds) : null,
    });
  });
  return Object.freeze({ styles });
}
function runPowerShell(executable, args, cwd, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const limit = 1024 * 1024;
    const collect = (current, chunk) => (current + chunk.toString('utf8')).slice(-limit);
    child.stdout.on('data', (chunk) => { stdout = collect(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = collect(stderr, chunk); });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 10_000).unref();
    }, timeoutMs);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); resolve({ code, timedOut, stdout, stderr }); });
  });
}

export async function runLocalSdxlStyleSmokeEntry(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const localComputeRoot = await resolveLocalComputeRoot(args.localComputeRoot);
  const smokeScript = await regularFile(path.join(localComputeRoot, 'scripts', 'Run-EvavoLocalImageStyleSmoke.ps1'), 'Local Compute image smoke script');
  const powershell = await regularFile(powershellPath(), 'Windows PowerShell');
  const childArgs = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', smokeScript, '-RepositoryRoot', localComputeRoot, '-Json'];
  if (args.skipQueueRepair) childArgs.push('-SkipQueueRepair');
  const child = await runPowerShell(powershell, childArgs, localComputeRoot);
  if (child.timedOut) fail('local-compute image style smoke exceeded the bounded execution window');
  const receipt = parseLastJsonLine(child.stdout);
  if (child.code !== 0) fail(`local-compute image style smoke exited ${String(child.code)}`);
  const verified = validateLocalComputeSmokeReceipt(receipt);
  const result = Object.freeze({
    schemaVersion: 1,
    kind: RESULT_KIND,
    ok: true,
    localOnly: true,
    hostedFallbackUsed: false,
    queueRepairSkipped: args.skipQueueRepair,
    stylesCompleted: verified.styles.length,
    styles: verified.styles,
    localComputeReceiptKind: receipt.kind,
    artifactProofVerified: true,
    physicalReadinessVerified: receipt.postflight?.readyForGeneration === true && receipt.postflight?.modelSha256Verified === true,
    githubActionsRequired: false,
    vercelRequired: false,
    paidComputeRequired: false,
    physicalPathsReturned: false,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) runLocalSdxlStyleSmokeEntry().catch((error) => {
  process.stderr.write(`${JSON.stringify({ schemaVersion: 1, kind: RESULT_KIND, ok: false, error: error instanceof Error ? error.message : String(error), hostedFallbackUsed: false, physicalPathsReturned: false })}\n`);
  process.exitCode = 2;
});
