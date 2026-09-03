#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const COMPILED_SCHEMA = 'evavo.comfyui-workflow-catalog.v1';
const DRAFT_SCHEMA = 'evavo.comfyui-workflow-catalog-draft.v1';
const COMPUTED_PROFILE_KEYS = new Set([
  'profileSha256',
  'workflowSha256',
  'nodeInventory',
  'nodeInventorySha256',
  'modelInventorySha256',
  'runtimeInventorySha256',
]);

function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || result.has(key)) fail('arguments must be unique --name value pairs');
    result.set(key, value);
  }
  for (const key of result.keys()) if (!['--input', '--output'].includes(key)) fail(`unsupported argument ${key}`);
  if (!result.has('--input') || !result.has('--output')) fail('--input and --output are required');
  return result;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function decompileComfyUICatalog(compiled) {
  if (!compiled || typeof compiled !== 'object' || Array.isArray(compiled)) fail('compiled catalog must be an object');
  if (compiled.schemaVersion !== COMPILED_SCHEMA) fail(`compiled catalog schema must be ${COMPILED_SCHEMA}`);
  if (!Array.isArray(compiled.profiles) || compiled.profiles.length < 1) fail('compiled catalog must contain profiles');
  const profiles = compiled.profiles.map((profile, index) => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) fail(`profiles[${index}] must be an object`);
    const next = clone(profile);
    for (const key of COMPUTED_PROFILE_KEYS) delete next[key];
    return next;
  });
  return {
    schemaVersion: DRAFT_SCHEMA,
    catalogId: compiled.catalogId,
    catalogVersion: `${compiled.catalogVersion}+decompiled`,
    profiles,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(args.get('--input'));
  const output = path.resolve(args.get('--output'));
  if (input === output) fail('input and output must differ');
  const compiled = JSON.parse(await readFile(input, 'utf8'));
  const draft = decompileComfyUICatalog(compiled);
  await writeFile(output, `${JSON.stringify(draft, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ ok: true, input, output, profileCount: draft.profiles.length })}\n`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (invoked) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
