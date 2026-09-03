#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const REGISTRY_SCHEMA = 'evavo.comfyui-runtime-profile-registry.v1';
const PACK_SCHEMA = 'evavo.local-generation-reference-pack.v1';
const SAFE_FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
function fail(message) { throw new Error(message); }
async function json(file, label) {
  try { return JSON.parse(await readFile(path.resolve(file), 'utf8')); }
  catch (error) { fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}
function parseArgs(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null || value.startsWith('--') || result.has(key)) fail('arguments must be unique --name value pairs');
    result.set(key, value);
  }
  for (const key of result.keys()) if (!['--catalog', '--pack', '--base-profile', '--output'].includes(key)) fail(`unsupported argument ${key}`);
  for (const required of ['--catalog', '--pack', '--base-profile', '--output']) if (!result.has(required)) fail(`${required} is required`);
  return result;
}
function validateFolders(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 16) fail('runtimePolicy.customNodeFolders must contain at most 16 entries');
  const folders = value.map((folder, index) => {
    if (typeof folder !== 'string' || !SAFE_FOLDER.test(folder)) fail(`runtimePolicy.customNodeFolders[${index}] is not a safe folder name`);
    return folder;
  });
  if (new Set(folders).size !== folders.length) fail('runtimePolicy.customNodeFolders contains duplicates');
  return folders;
}
function registryDocument(value) {
  if (value?.schema !== REGISTRY_SCHEMA || !value.profiles || typeof value.profiles !== 'object' || Array.isArray(value.profiles)) fail(`runtime registry must use ${REGISTRY_SCHEMA}`);
  return value;
}
async function readExisting(output) {
  try { return registryDocument(await json(output, 'existing runtime registry')); }
  catch (error) {
    if (error instanceof Error && /ENOENT/u.test(error.message)) return { schema: REGISTRY_SCHEMA, profiles: {} };
    try { await readFile(output); } catch (readError) { if (readError?.code === 'ENOENT') return { schema: REGISTRY_SCHEMA, profiles: {} }; }
    throw error;
  }
}

export function runtimeRegistryEntry(catalog, pack, baseProfile) {
  if (pack?.schema !== PACK_SCHEMA) fail(`reference pack must use ${PACK_SCHEMA}`);
  if (typeof pack.profileSuffix !== 'string' || !pack.profileSuffix) fail('reference pack profileSuffix is required');
  if (typeof pack.packId !== 'string' || !pack.packId || typeof pack.version !== 'string' || !pack.version) fail('reference pack identity/version are required');
  const profileId = `${baseProfile}-${pack.profileSuffix}`;
  const profile = catalog?.profiles?.find((candidate) => candidate?.profileId === profileId);
  if (!profile) fail(`compiled catalog does not contain ${profileId}`);
  for (const [value, label] of [[profile.profileSha256, 'profileSha256'], [profile.runtimeInventorySha256, 'runtimeInventorySha256']]) {
    if (typeof value !== 'string' || !SHA256.test(value)) fail(`${profileId} ${label} is missing or invalid`);
  }
  const customNodeFolders = validateFolders(pack.runtimePolicy?.customNodeFolders);
  return Object.freeze({
    profileId,
    profileSha256: profile.profileSha256,
    runtimeInventorySha256: profile.runtimeInventorySha256,
    packId: pack.packId,
    packVersion: pack.version,
    customNodeFolders,
    disableAllCustomNodes: true,
    disableApiNodes: true,
    skipBuiltinExtras: true,
  });
}

export async function compileRuntimeRegistry({ catalogPath, packPath, baseProfile, output }) {
  const [catalog, pack] = await Promise.all([json(catalogPath, 'compiled catalog'), json(packPath, 'reference pack')]);
  const entry = runtimeRegistryEntry(catalog, pack, baseProfile);
  const outputPath = path.resolve(output);
  const existing = await readExisting(outputPath);
  const document = {
    schema: REGISTRY_SCHEMA,
    profiles: { ...existing.profiles, [entry.profileId]: entry },
  };
  const directory = path.dirname(outputPath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await rename(temporary, outputPath);
  return Object.freeze({ output: outputPath, entry, profileCount: Object.keys(document.profiles).length });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await compileRuntimeRegistry({
    catalogPath: args.get('--catalog'),
    packPath: args.get('--pack'),
    baseProfile: args.get('--base-profile'),
    output: args.get('--output'),
  });
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}
const direct = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (direct) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
