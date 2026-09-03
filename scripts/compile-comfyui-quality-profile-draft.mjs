#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const QUALITY_SCHEMA = 'evavo.local-generation-quality-profiles.v2';

function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]; const value = argv[i + 1];
    if (!key?.startsWith('--') || value == null || value.startsWith('--') || map.has(key)) fail('arguments must be unique --name value pairs');
    map.set(key, value);
  }
  for (const key of map.keys()) if (!['--input', '--output', '--profiles', '--base-profile'].includes(key)) fail(`unsupported argument ${key}`);
  return map;
}
async function json(file, label) {
  try { return JSON.parse(await readFile(path.resolve(file), 'utf8')); }
  catch (error) { fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function samplingNodes(workflow) {
  return Object.entries(workflow ?? {}).filter(([, node]) => node?.class_type === 'KSampler' || node?.class_type === 'KSamplerAdvanced');
}
function applySampling(profile, qualityName, quality) {
  const next = clone(profile);
  const nodes = samplingNodes(next.workflow);
  if (!nodes.length) fail(`base profile ${profile.profileId} contains no KSampler/KSamplerAdvanced node`);
  for (const [, node] of nodes) {
    node.inputs ??= {};
    node.inputs.steps = quality.steps;
    node.inputs.cfg = quality.cfg;
    node.inputs.sampler_name = quality.sampler;
    node.inputs.scheduler = quality.scheduler;
    node.inputs.denoise = quality.denoise;
  }
  next.profileId = `${profile.profileId}-${qualityName}`;
  next.label = `${profile.label} · ${qualityName}`;
  next.description = `${profile.description} Quality profile ${qualityName}: steps=${quality.steps}, cfg=${quality.cfg}, sampler=${quality.sampler}, scheduler=${quality.scheduler}, denoise=${quality.denoise}.`;
  next.version = `${profile.version}+quality.${qualityName}`;
  next.priority = Number(profile.priority ?? 0) + 10;
  delete next.profileSha256;
  delete next.workflowSha256;
  delete next.nodeInventory;
  delete next.nodeInventorySha256;
  delete next.modelInventorySha256;
  delete next.runtimeInventorySha256;
  return next;
}

export function compileQualityProfiledDraft(draft, qualityDocument, baseProfileId = null) {
  if (qualityDocument?.schema !== QUALITY_SCHEMA || !qualityDocument.profiles || typeof qualityDocument.profiles !== 'object') fail(`quality profile document must use ${QUALITY_SCHEMA}`);
  if (!Array.isArray(draft?.profiles) || !draft.profiles.length) fail('ComfyUI draft must contain profiles');
  const base = baseProfileId ? draft.profiles.find((profile) => profile.profileId === baseProfileId) : draft.profiles[0];
  if (!base) fail(`base profile ${baseProfileId} was not found`);
  const generated = Object.entries(qualityDocument.profiles).map(([name, quality]) => applySampling(base, name, quality));
  return {
    ...clone(draft),
    catalogVersion: `${draft.catalogVersion ?? '1'}+quality-v2`,
    profiles: [...draft.profiles.filter((profile) => !generated.some((candidate) => candidate.profileId === profile.profileId)), ...generated],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.get('--input'); const output = args.get('--output');
  if (!input || !output) fail('--input and --output are required');
  const profilesPath = args.get('--profiles') ?? path.resolve('config/local-generation-quality-profiles.v2.json');
  const profileDocument = await json(profilesPath, 'quality profiles');
  const result = compileQualityProfiledDraft(await json(input, 'ComfyUI catalog draft'), profileDocument, args.get('--base-profile') ?? null);
  await writeFile(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8' });
  process.stdout.write(`${JSON.stringify({ ok: true, output: path.resolve(output), generatedProfiles: Object.keys(profileDocument.profiles) })}\n`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (invoked) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
