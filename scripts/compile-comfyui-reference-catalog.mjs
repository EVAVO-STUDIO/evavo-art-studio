#!/usr/bin/env node
import { copyFile, mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || result.has(key)) fail('arguments must be unique --name value pairs');
    result.set(key, value);
  }
  for (const key of result.keys()) if (!['--input', '--pack', '--base-profile', '--output', '--replace-input'].includes(key)) fail(`unsupported argument ${key}`);
  for (const required of ['--input', '--pack', '--base-profile']) if (!result.has(required)) fail(`${required} is required`);
  return result;
}
async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env: process.env, stdio: 'inherit', shell: false, windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
  });
}
async function json(file, label) {
  try { return JSON.parse(await readFile(path.resolve(file), 'utf8')); }
  catch (error) { fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}
function validateRuntimePolicy(profile) {
  const policy = profile.runtimePolicy;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) fail(`compiled profile ${profile.profileId} has no reviewed runtimePolicy`);
  if (typeof policy.loadBuiltinExtras !== 'boolean') fail(`compiled profile ${profile.profileId} has invalid runtimePolicy.loadBuiltinExtras`);
  if (!Array.isArray(policy.customNodeFolders) || policy.customNodeFolders.length > 16) fail(`compiled profile ${profile.profileId} has invalid runtimePolicy.customNodeFolders`);
  if (policy.customNodeFolders.some((folder) => typeof folder !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(folder))) {
    fail(`compiled profile ${profile.profileId} has unsafe custom node folder policy`);
  }
  if (new Set(policy.customNodeFolders).size !== policy.customNodeFolders.length) fail(`compiled profile ${profile.profileId} has duplicate custom node folder policy`);
  return Object.freeze({ loadBuiltinExtras: policy.loadBuiltinExtras, customNodeFolders: Object.freeze([...policy.customNodeFolders]) });
}

export async function compileReferenceCatalog({ input, pack, baseProfile, output }) {
  const inputPath = path.resolve(input);
  const packPath = path.resolve(pack);
  const outputPath = path.resolve(output ?? `${inputPath}.reference.json`);
  const packDocument = await json(packPath, 'reference pack');
  if (packDocument?.schema !== 'evavo.local-generation-reference-pack.v1') fail('reference pack schema is invalid');
  const expectedProfileId = `${baseProfile}-${packDocument.profileSuffix}`;
  const work = path.join(path.dirname(outputPath), `.reference-catalog-${process.pid}-${Date.now()}`);
  await mkdir(work, { recursive: true });
  const draft = path.join(work, 'catalog.draft.json');
  const packed = path.join(work, 'catalog.reference.draft.json');
  const compiled = path.join(work, 'catalog.compiled.json');
  try {
    await run(process.execPath, [path.join(ROOT, 'scripts', 'decompile-comfyui-workflow-catalog.mjs'), '--input', inputPath, '--output', draft]);
    await run(process.execPath, [path.join(ROOT, 'scripts', 'compile-comfyui-reference-pack-draft.mjs'), '--input', draft, '--pack', packPath, '--base-profile', baseProfile, '--output', packed]);
    await run(process.execPath, [path.join(ROOT, 'scripts', 'compile-comfyui-workflow-catalog.mjs'), '--input', packed, '--output', compiled]);
    const catalog = await json(compiled, 'compiled reference catalog');
    if (catalog?.schemaVersion !== 'evavo.comfyui-workflow-catalog.v1' || !Array.isArray(catalog.profiles)) fail('compiled reference catalog is invalid');
    const profile = catalog.profiles.find((candidate) => candidate?.profileId === expectedProfileId);
    if (!profile) fail(`compiled reference catalog is missing ${expectedProfileId}`);
    if (!profile.capabilities?.includes('reference-images') || !profile.bindings?.referenceImages?.length) fail(`compiled profile ${expectedProfileId} is not reference-capable`);
    if (!Number.isInteger(profile.limits?.maximumReferenceImages) || profile.limits.maximumReferenceImages < profile.bindings.referenceImages.length) fail(`compiled profile ${expectedProfileId} has invalid reference limits`);
    const runtimePolicy = validateRuntimePolicy(profile);
    await copyFile(compiled, outputPath);
    return Object.freeze({
      output: outputPath,
      profileId: expectedProfileId,
      profileSha256: profile.profileSha256 ?? null,
      workflowSha256: profile.workflowSha256 ?? null,
      catalogSha256: catalog.catalogSha256 ?? null,
      referenceRoles: profile.bindings.referenceImages.map((binding) => binding.role),
      maximumReferenceImages: profile.limits.maximumReferenceImages,
      runtimePolicy,
      profileCount: catalog.profiles.length,
    });
  } finally {
    for (const file of [draft, packed, compiled]) await unlink(file).catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(args.get('--input'));
  const replace = args.get('--replace-input') === 'true';
  const explicitOutput = args.get('--output');
  if (replace && explicitOutput) fail('--replace-input=true cannot be combined with --output');
  const target = path.resolve(explicitOutput ?? (replace ? `${input}.reference.next` : `${input}.reference.json`));
  const result = await compileReferenceCatalog({ input, pack: args.get('--pack'), baseProfile: args.get('--base-profile'), output: target });
  let backup = null;
  let finalOutput = result.output;
  if (replace) {
    backup = `${input}.backup-${new Date().toISOString().replace(/[:.]/gu, '-')}`;
    await copyFile(input, backup);
    await rename(target, input);
    finalOutput = input;
  }
  process.stdout.write(`${JSON.stringify({ ok: true, ...result, output: finalOutput, backup })}\n`);
}
const direct = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (direct) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
