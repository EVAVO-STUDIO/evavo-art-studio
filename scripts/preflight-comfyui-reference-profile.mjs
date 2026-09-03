#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const INVENTORY_SCHEMA = 'evavo.local-generation-physical-model-inventory.v1';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const SHA256 = /^[a-f0-9]{64}$/u;

function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null || value.startsWith('--') || args.has(key)) fail('arguments must be unique --name value pairs');
    args.set(key, value);
  }
  for (const key of args.keys()) if (!['--catalog', '--profile', '--base-url', '--model-inventory'].includes(key)) fail(`unsupported argument ${key}`);
  return args;
}
async function json(file, label) {
  try { return JSON.parse(await readFile(path.resolve(file), 'utf8')); }
  catch (error) { fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}
function loopbackUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || url.username || url.password || url.search || url.hash) fail('base URL must be loopback HTTP without credentials/query/fragment');
  return url.toString().replace(/\/$/u, '');
}
async function sha256File(file) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  return hash.digest('hex');
}
async function fetchJson(url, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 32 * 1024 * 1024) fail(`${url} response is too large`);
    return JSON.parse(text);
  } finally { clearTimeout(timer); }
}
function assertReferenceProfile(profile) {
  const bindings = profile.bindings?.referenceImages;
  if (!Array.isArray(bindings) || !bindings.length) fail(`profile ${profile.profileId} has no reference image bindings`);
  const capabilities = new Set(profile.capabilities ?? []);
  if (!capabilities.has('reference-images')) fail(`profile ${profile.profileId} does not advertise reference-images`);
  const maximum = profile.limits?.maximumReferenceImages;
  if (!Number.isInteger(maximum) || maximum < bindings.length || maximum > 16) fail(`profile ${profile.profileId} has invalid maximumReferenceImages`);
  const roles = bindings.map((binding) => binding.role);
  if (new Set(roles).size !== roles.length) fail(`profile ${profile.profileId} has duplicate reference binding roles`);
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    const node = profile.workflow?.[binding.nodeId];
    if (!node?.inputs || !Object.hasOwn(node.inputs, binding.input)) fail(`reference binding ${index} targets missing workflow input ${binding.nodeId}.${binding.input}`);
    if (binding.strength) {
      const strengthNode = profile.workflow?.[binding.strength.nodeId];
      if (!strengthNode?.inputs || !Object.hasOwn(strengthNode.inputs, binding.strength.input)) fail(`reference binding ${index} strength targets missing workflow input ${binding.strength.nodeId}.${binding.strength.input}`);
    }
  }
}
async function verifyModels(profile, inventoryPath) {
  if (!inventoryPath) return { performed: false, verified: [], missing: (profile.modelInventory ?? []).map((item) => item.id) };
  const inventory = await json(inventoryPath, 'physical model inventory');
  if (inventory?.schema !== INVENTORY_SCHEMA || !Array.isArray(inventory.entries)) fail(`physical model inventory must use ${INVENTORY_SCHEMA}`);
  const byId = new Map(inventory.entries.map((entry) => [entry?.id, entry]));
  const verified = [];
  for (const expected of profile.modelInventory ?? []) {
    if (typeof expected?.id !== 'string' || typeof expected.sha256 !== 'string' || !SHA256.test(expected.sha256)) fail(`profile model inventory contains invalid entry ${String(expected?.id)}`);
    const physical = byId.get(expected.id);
    if (!physical || typeof physical.path !== 'string' || typeof physical.sha256 !== 'string' || physical.sha256 !== expected.sha256) fail(`physical inventory does not bind ${expected.id} to the reviewed SHA-256`);
    const candidate = path.resolve(physical.path);
    const info = await lstat(candidate);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1) fail(`physical model ${expected.id} must be a non-empty regular non-symlink file`);
    const canonical = await realpath(candidate);
    const actual = await sha256File(canonical);
    if (actual !== expected.sha256) fail(`physical model ${expected.id} SHA-256 mismatch`);
    verified.push({ id: expected.id, path: canonical, sha256: actual, bytes: info.size });
  }
  return { performed: true, verified, missing: [] };
}

export async function preflightReferenceProfile({ catalog, profileId, baseUrl, modelInventoryPath = null }) {
  if (!catalog || !Array.isArray(catalog.profiles)) fail('catalog must contain profiles');
  const profile = catalog.profiles.find((candidate) => candidate?.profileId === profileId);
  if (!profile) fail(`profile ${profileId} not found in catalog`);
  assertReferenceProfile(profile);
  const endpoint = loopbackUrl(baseUrl);
  const objectInfo = await fetchJson(`${endpoint}/object_info`);
  const runtimeClasses = new Set(Object.keys(objectInfo ?? {}));
  const requiredClasses = [...new Set((profile.nodeInventory ?? Object.entries(profile.workflow ?? {}).map(([nodeId, node]) => ({ nodeId, classType: node?.class_type }))).map((entry) => entry.classType).filter(Boolean))].sort();
  const missingClasses = requiredClasses.filter((classType) => !runtimeClasses.has(classType));
  if (missingClasses.length) fail(`live ComfyUI is missing required node classes for ${profileId}: ${missingClasses.join(', ')}`);
  const models = await verifyModels(profile, modelInventoryPath);
  return Object.freeze({
    schema: 'evavo.comfyui-reference-profile-preflight.v1',
    ok: true,
    profileId,
    profileSha256: profile.profileSha256 ?? null,
    workflowSha256: profile.workflowSha256 ?? null,
    baseUrl: endpoint,
    referenceRoles: profile.bindings.referenceImages.map((binding) => binding.role),
    maximumReferenceImages: profile.limits.maximumReferenceImages,
    runtimeNodeClassCount: runtimeClasses.size,
    requiredNodeClasses: requiredClasses,
    models,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalogPath = args.get('--catalog'); const profileId = args.get('--profile'); const baseUrl = args.get('--base-url');
  if (!catalogPath || !profileId || !baseUrl) fail('--catalog, --profile and --base-url are required');
  const result = await preflightReferenceProfile({
    catalog: await json(catalogPath, 'ComfyUI catalog'),
    profileId,
    baseUrl,
    modelInventoryPath: args.get('--model-inventory') ?? null,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const direct = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (direct) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
