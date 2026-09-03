#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile, copyFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUALITY_PROFILES = [
  'portrait_high_quality',
  'sprite_sheet_clean',
  'concept_art_painterly',
  'comic_inked',
  'cinematic_stills',
  'product_mockups',
];

function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const result = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]; const value = argv[i + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || result.has(key)) fail('arguments must be unique --name value pairs');
    result.set(key, value);
  }
  for (const key of result.keys()) if (!['--input', '--output', '--profiles', '--base-profile', '--replace-input'].includes(key)) fail(`unsupported argument ${key}`);
  if (!result.has('--input')) fail('--input is required');
  return result;
}
async function run(command, args, cwd = ROOT) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: 'inherit', shell: false, windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
  });
}
function nodeExecutable() { return process.execPath; }

export async function compileQualityCatalog(options) {
  const input = path.resolve(options.input);
  const output = path.resolve(options.output ?? `${input}.quality-v2.json`);
  const profileConfig = path.resolve(options.profiles ?? path.join(ROOT, 'config', 'local-generation-quality-profiles.v2.json'));
  const work = path.join(path.dirname(output), `.quality-catalog-${process.pid}-${Date.now()}`);
  await mkdir(work, { recursive: true });
  const draft = path.join(work, 'catalog.draft.json');
  const profiled = path.join(work, 'catalog.profiled.draft.json');
  const compiled = path.join(work, 'catalog.compiled.json');
  try {
    await run(nodeExecutable(), [path.join(ROOT, 'scripts', 'decompile-comfyui-workflow-catalog.mjs'), '--input', input, '--output', draft]);
    const profileArgs = [path.join(ROOT, 'scripts', 'compile-comfyui-quality-profile-draft.mjs'), '--input', draft, '--output', profiled, '--profiles', profileConfig];
    if (options.baseProfile) profileArgs.push('--base-profile', options.baseProfile);
    await run(nodeExecutable(), profileArgs);
    await run(nodeExecutable(), [path.join(ROOT, 'scripts', 'compile-comfyui-workflow-catalog.mjs'), '--input', profiled, '--output', compiled]);
    const document = JSON.parse(await readFile(compiled, 'utf8'));
    if (document?.schemaVersion !== 'evavo.comfyui-workflow-catalog.v1' || !Array.isArray(document.profiles)) fail('compiled quality catalog is invalid');
    const ids = new Set(document.profiles.map((profile) => profile.profileId));
    const baseProfile = options.baseProfile ?? document.profiles.find((profile) => !QUALITY_PROFILES.some((name) => profile.profileId.endsWith(`-${name}`)))?.profileId;
    if (!baseProfile) fail('unable to determine base profile');
    const required = QUALITY_PROFILES.map((name) => `${baseProfile}-${name}`);
    const missing = required.filter((id) => !ids.has(id));
    if (missing.length) fail(`quality catalog missing profiles: ${missing.join(', ')}`);
    await copyFile(compiled, output);
    return { output, baseProfile, qualityProfiles: required, profileCount: document.profiles.length, catalogSha256: document.catalogSha256 ?? null };
  } finally {
    for (const file of [draft, profiled, compiled]) await unlink(file).catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(args.get('--input'));
  const replace = args.get('--replace-input') === 'true';
  const explicitOutput = args.get('--output');
  if (replace && explicitOutput) fail('--replace-input=true cannot be combined with --output');
  const target = path.resolve(explicitOutput ?? (replace ? `${input}.next` : `${input}.quality-v2.json`));
  const result = await compileQualityCatalog({ input, output: target, profiles: args.get('--profiles') ?? undefined, baseProfile: args.get('--base-profile') ?? undefined });
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

const invoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (invoked) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
