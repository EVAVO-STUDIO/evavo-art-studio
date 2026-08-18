#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const ENGINE = 'scripts/mobile-identity-provider-runtime.mjs';
const MAX_JSON_BYTES = 1024 * 1024;
const PHASES = Object.freeze({
  prepare: Object.freeze({
    options: Object.freeze(['--provider-request', '--work-order', '--output']),
    paths: Object.freeze(['--provider-request', '--output']),
    roots: Object.freeze([]),
  }),
  select: Object.freeze({
    options: Object.freeze(['--runtime-batch', '--work-order', '--selected-at', '--selected-by', '--reason', '--output']),
    paths: Object.freeze(['--runtime-batch', '--output']),
    roots: Object.freeze([]),
  }),
  admit: Object.freeze({
    options: Object.freeze(['--runtime-batch', '--selection', '--runtime-root', '--actor', '--admitted-at', '--receipt']),
    paths: Object.freeze(['--runtime-batch', '--selection', '--receipt']),
    roots: Object.freeze(['--runtime-root']),
  }),
  authorize: Object.freeze({
    options: Object.freeze(['--runtime-batch', '--selection', '--admission', '--runtime-root', '--artifact-root', '--authorized-at', '--expires-at', '--authorized-by', '--reason', '--allowed-adapters', '--output']),
    paths: Object.freeze(['--runtime-batch', '--selection', '--admission', '--output']),
    roots: Object.freeze(['--runtime-root', '--artifact-root']),
  }),
  execute: Object.freeze({
    options: Object.freeze(['--runtime-batch', '--selection', '--admission', '--authorization', '--worker-id', '--receipt']),
    paths: Object.freeze(['--runtime-batch', '--selection', '--admission', '--authorization', '--receipt']),
    roots: Object.freeze([]),
  }),
});

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function safeText(value, label, maximum = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\0\r\n]/u.test(value)) fail(`${label} is invalid`);
  return value.trim();
}
function safeRelative(value, label) {
  const text = safeText(value, label).replaceAll('\\', '/');
  if (text.startsWith('/') || /^[A-Za-z]:\//u.test(text) || text.split('/').some((part) => !part || part === '.' || part === '..' || part === '.git')) fail(`${label} must be repository-relative`);
  return text;
}
function readJson(relative, label) {
  const path = resolve(safeRelative(relative, label));
  const state = lstatSync(path);
  if (!state.isFile() || state.isSymbolicLink() || state.size <= 0 || state.size > MAX_JSON_BYTES) fail(`${label} must be a regular JSON file <= 1 MiB`);
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { fail(`${label} is not valid JSON`); }
}
function exactAdapters(value, label) {
  const values = safeText(value, label, 2048).split(',');
  if (!values.length || values.some((entry) => !entry || entry.trim() !== entry)) fail(`${label} must be a comma-separated exact adapter list`);
  const seen = new Set();
  for (const id of values) {
    if (!/^[a-z0-9][a-z0-9._:-]*$/u.test(id) || ['gpt-image', 'openai-image', 'comfyui'].includes(id)) fail(`${label} contains a generic or invalid adapter id`);
    if (seen.has(id)) fail(`${label} contains a duplicate adapter id`);
    seen.add(id);
  }
  return Object.freeze([...seen]);
}
function validateProviderRequestDocument(wrapper) {
  if (!wrapper || typeof wrapper !== 'object' || Array.isArray(wrapper) || wrapper.schema !== 'evavo.mobile-identity-provider-request.v1' || wrapper.status !== 'provider-request-ready') fail('provider request document is not provider-request-ready');
  const request = wrapper.providerRequest;
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('provider request payload is missing');
  const digest = sha256(request);
  if (!/^[a-f0-9]{64}$/u.test(wrapper.providerRequestSha256 ?? '') || wrapper.providerRequestSha256 !== digest) fail('providerRequestSha256 mismatch');
  if (request.assetKind !== 'ui' || request.continuityPhase !== 'identity-master' || request.operation !== 'generate') fail('provider request is not a mobile identity-master generation request');
  const allowed = Array.isArray(request.selection?.allowedAdapterIds) ? request.selection.allowedAdapterIds : [];
  if (!allowed.length) fail('provider request has no exact allowed adapters');
  for (const id of allowed) exactAdapters(String(id), 'provider request adapter');
  if (!allowed.includes(request.selection?.preferredAdapterId)) fail('provider preferred adapter is not allowed');
  if (request.metadata?.creativeMasterType !== 'raster-provider-generation' || request.metadata?.releaseEligible !== false || request.metadata?.approvalRequired !== true) fail('provider request raster approval boundary is invalid');
  return Object.freeze({ wrapper, request, digest, allowedAdapterIds: Object.freeze([...allowed]) });
}
function parse(argv) {
  const command = safeText(argv[0], 'command', 32);
  const phase = PHASES[command];
  if (!phase) fail('command must be prepare, select, admit, authorize or execute');
  const tail = argv.slice(1);
  if (tail.length !== phase.options.length * 2) fail(`${command} must provide exactly its reviewed option set`);
  const values = new Map();
  for (let index = 0; index < tail.length; index += 2) {
    const name = tail[index];
    const value = tail[index + 1];
    if (!phase.options.includes(name)) fail(`${command} contains unsupported option ${name}`);
    if (values.has(name)) fail(`${command} duplicates option ${name}`);
    values.set(name, safeText(value, `${command} ${name}`, 32768));
  }
  for (const name of phase.options) if (!values.has(name)) fail(`${command} is missing ${name}`);
  for (const name of phase.paths) values.set(name, safeRelative(values.get(name), `${command} ${name}`));
  for (const name of phase.roots) values.set(name, resolve(safeRelative(values.get(name), `${command} ${name}`)));
  return Object.freeze({ command, phase, values });
}
function validatePhaseBinding(parsed) {
  if (parsed.command === 'prepare') {
    validateProviderRequestDocument(readJson(parsed.values.get('--provider-request'), 'provider request'));
    return;
  }
  if (parsed.command !== 'authorize') return;
  const batch = readJson(parsed.values.get('--runtime-batch'), 'runtime batch');
  if (batch.schema !== 'evavo.mobile-identity-provider-runtime-batch.v1' || batch.status !== 'ready' || !batch.contract?.request) fail('authorize requires a ready mobile identity runtime batch');
  const admitted = Array.isArray(batch.contract.request.selection?.allowedAdapterIds)
    ? batch.contract.request.selection.allowedAdapterIds
    : [];
  if (!admitted.length) fail('runtime batch request has no admitted provider adapters');
  const requested = exactAdapters(parsed.values.get('--allowed-adapters'), '--allowed-adapters');
  if (requested.some((id) => !admitted.includes(id))) fail('authorization requests an adapter outside the provider request allowlist');
}
function engineArguments(parsed) {
  const result = [ENGINE, parsed.command];
  for (const name of parsed.phase.options) result.push(name, parsed.values.get(name));
  return result;
}
export function validateMobileIdentityProviderRuntimeEntry(argv) {
  const parsed = parse(argv);
  validatePhaseBinding(parsed);
  return Object.freeze({
    command: parsed.command,
    engine: ENGINE,
    argv: Object.freeze(['node', ...engineArguments(parsed)]),
    providerRequestHashVerified: parsed.command === 'prepare',
    adapterSubsetVerified: parsed.command === 'authorize',
    repositoryRelativePlanPaths: true,
    runtimeRootsNormalizedBeforeEngine: parsed.phase.roots.length > 0,
    publicationAuthority: false,
    forcePush: false,
  });
}
function main(argv = process.argv.slice(2)) {
  const parsed = parse(argv);
  validatePhaseBinding(parsed);
  const child = spawnSync(process.execPath, engineArguments(parsed), {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: 'inherit',
  });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exitCode = child.status ?? 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; }
}
