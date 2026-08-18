#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, openSync, closeSync, fsyncSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const OPTIONS = Object.freeze([
  '--adapter',
  '--expected-adapter-file-sha256',
  '--slot-id',
  '--runtime-root',
  '--artifact-root',
  '--worker-id',
  '--output',
]);

function fail(message) { throw new Error(message); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function safeText(value, label, maximum = 32768) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\0\r\n]/u.test(value)) fail(`${label} is invalid`);
  return value.trim();
}
function safeRelative(value, label) {
  const text = safeText(value, label).replaceAll('\\', '/');
  if (text.startsWith('/') || /^[A-Za-z]:\//u.test(text) || text.split('/').some((part) => !part || part === '.' || part === '..' || part === '.git')) fail(`${label} must be repository-relative`);
  return text;
}

export function parseTopHatPoseSlotProviderExecutionArguments(argv) {
  if (argv.length !== OPTIONS.length * 2) fail(`expected exactly ${OPTIONS.length} supported --name value pairs`);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!OPTIONS.includes(name) || values.has(name) || !value || value.startsWith('--')) fail('arguments must be unique supported --name value pairs');
    values.set(name, safeText(value, name));
  }
  for (const name of OPTIONS) if (!values.has(name)) fail(`missing ${name}`);
  const expectedSha = values.get('--expected-adapter-file-sha256');
  if (!/^[a-f0-9]{64}$/u.test(expectedSha)) fail('--expected-adapter-file-sha256 must be a lowercase SHA-256');
  if (!/^[a-z0-9][a-z0-9._:-]*$/u.test(values.get('--slot-id'))) fail('--slot-id is invalid');
  if (!/^[a-z0-9][a-z0-9._:-]*$/u.test(values.get('--worker-id'))) fail('--worker-id is invalid');
  return Object.freeze({
    adapter: safeRelative(values.get('--adapter'), '--adapter'),
    expectedAdapterFileSha256: expectedSha,
    slotId: values.get('--slot-id'),
    runtimeRoot: safeRelative(values.get('--runtime-root'), '--runtime-root'),
    artifactRoot: safeRelative(values.get('--artifact-root'), '--artifact-root'),
    workerId: values.get('--worker-id'),
    output: safeRelative(values.get('--output'), '--output'),
  });
}

function readBoundAdapter(relative, expectedSha256) {
  const target = resolve(relative);
  const state = lstatSync(target);
  if (!state.isFile() || state.isSymbolicLink() || state.size <= 0 || state.size > MAX_JSON_BYTES) fail('--adapter must be a regular JSON file <= 4 MiB');
  const bytes = readFileSync(target);
  if (sha256(bytes) !== expectedSha256) fail('adapter file SHA-256 mismatch');
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { fail('--adapter is not valid JSON'); }
  return Object.freeze({ value, fileSha256: expectedSha256 });
}

function pnpmExecutable() { return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'; }
function runBuild(args, label) {
  const result = spawnSync(pnpmExecutable(), args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) fail(`${label} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed with exit code ${result.status}`);
}

function writeCreateOnlyJson(relative, value) {
  const target = resolve(relative);
  const descriptor = openSync(target, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const readback = readFileSync(target);
  const parsed = JSON.parse(readback.toString('utf8'));
  if (JSON.stringify(parsed) !== JSON.stringify(value)) fail('execution receipt readback mismatch');
  return Object.freeze({ path: relative, fileSha256: sha256(readback), bytes: readback.length });
}

export async function runTopHatPoseSlotProviderExecution(argv = process.argv.slice(2)) {
  const options = parseTopHatPoseSlotProviderExecutionArguments(argv);
  const adapterRecord = readBoundAdapter(options.adapter, options.expectedAdapterFileSha256);
  runBuild(['run', 'build:domain'], 'Art Studio domain build');
  runBuild(['--filter', '@evavo/art-studio-worker', 'build'], 'Art Studio worker build');
  const { executeTopHatPoseSlotProvider } = await import('./project-art/top-hat-pose-slot-provider-execution.mjs');
  const receipt = await executeTopHatPoseSlotProvider({
    adapter: adapterRecord.value,
    slotId: options.slotId,
    runtimeRoot: resolve(options.runtimeRoot),
    artifactRoot: resolve(options.artifactRoot),
    workerId: options.workerId,
    compiledAt: new Date().toISOString(),
    environment: process.env,
  });
  const output = writeCreateOnlyJson(options.output, receipt);
  return Object.freeze({
    status: receipt.status,
    slotId: receipt.slotId,
    executionSha256: receipt.executionSha256,
    output,
    providerCallCount: receipt.effects.providerCallCount,
    candidateMaterializedToScratchPath: false,
    candidateApproved: false,
    poseSlotFilled: false,
    runtimeActivated: false,
  });
}

const directlyInvoked = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (directlyInvoked) {
  try {
    const result = await runTopHatPoseSlotProviderExecution();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'candidate-generated-review-required') process.exitCode = 3;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 2;
  }
}
