#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 'evavo.local-generation-ipadapter-runtime.v1';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ZERO_SHA = /^0{64}$/u;
const ROLE_CAPABILITY = Object.freeze({
  'canonical-identity': 'identity-reference',
  'direction-master': 'direction-reference',
  'palette-reference': 'palette-reference',
  'material-reference': 'material-reference',
  'layer-context': 'layer-context-reference',
});

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function safeId(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) fail(`${label} must be a safe identifier`);
  return value;
}
function reviewedSha(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value) || ZERO_SHA.test(value)) fail(`${label} must be a non-placeholder lowercase SHA-256`);
  return value;
}
function reviewedModel(raw, label) {
  const model = object(raw, label);
  const id = safeId(model.id, `${label}.id`);
  if (typeof model.fileName !== 'string' || !model.fileName.trim() || model.fileName.trim() !== model.fileName || model.fileName.length > 512 || /[\\/]/u.test(model.fileName)) {
    fail(`${label}.fileName must be one reviewed model file name without path separators`);
  }
  return Object.freeze({ id, fileName: model.fileName, sha256: reviewedSha(model.sha256, `${label}.sha256`) });
}
function number(value, fallback, min, max, label) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > max) fail(`${label} must be between ${min} and ${max}`);
  return result;
}
function runtimeDocument(raw) {
  const source = object(raw, 'IP-Adapter runtime');
  if (source.schema !== SCHEMA) fail(`IP-Adapter runtime must use ${SCHEMA}`);
  const runtimeId = safeId(source.runtimeId, 'runtimeId');
  const version = safeId(source.version, 'version');
  if (typeof source.customNodeFolder !== 'string' || !SAFE_FOLDER.test(source.customNodeFolder)) fail('customNodeFolder is invalid');
  const runtimeSha256 = reviewedSha(source.runtimeSha256, 'runtimeSha256');
  const roles = source.roles;
  if (!Array.isArray(roles) || roles.length < 1 || roles.length > 8) fail('roles must contain 1 to 8 entries');
  if (new Set(roles).size !== roles.length) fail('roles contains duplicates');
  for (const role of roles) if (!Object.hasOwn(ROLE_CAPABILITY, role)) fail(`role ${String(role)} is unsupported by the IP-Adapter pack compiler`);
  const combineEmbeds = source.combineEmbeds ?? 'concat';
  if (!['concat', 'add', 'subtract', 'average', 'norm average'].includes(combineEmbeds)) fail('combineEmbeds is unsupported');
  return Object.freeze({
    runtimeId,
    version,
    customNodeFolder: source.customNodeFolder,
    runtimeSha256,
    ipAdapterModel: reviewedModel(source.ipAdapterModel, 'ipAdapterModel'),
    clipVisionModel: reviewedModel(source.clipVisionModel, 'clipVisionModel'),
    roles: Object.freeze([...roles]),
    weight: number(source.weight, 0.8, -1, 5, 'weight'),
    weightType: typeof source.weightType === 'string' && source.weightType.trim() ? source.weightType.trim() : 'linear',
    combineEmbeds,
    startAt: number(source.startAt, 0, 0, 1, 'startAt'),
    endAt: number(source.endAt, 1, 0, 1, 'endAt'),
    embedsScaling: typeof source.embedsScaling === 'string' && source.embedsScaling.trim() ? source.embedsScaling.trim() : 'V only',
    baseModelNodeId: safeId(source.baseModelNodeId ?? '1', 'baseModelNodeId'),
    samplerNodeId: safeId(source.samplerNodeId ?? '4', 'samplerNodeId'),
  });
}

export function compileIpAdapterReferencePacks(raw) {
  const runtime = runtimeDocument(raw);
  if (runtime.startAt > runtime.endAt) fail('startAt may not be greater than endAt');
  return Object.freeze(runtime.roles.map((role) => Object.freeze({
    schema: 'evavo.local-generation-reference-pack.v1',
    packId: `${runtime.runtimeId}-${role}`,
    version: runtime.version,
    profileSuffix: `reference-${role}`,
    label: `IP-Adapter ${role}`,
    description: `Reviewed IP-Adapter conditioning pack for ${role}.`,
    capabilities: Object.freeze(['reference-images', ROLE_CAPABILITY[role]]),
    maximumReferenceImages: 1,
    requiredNodeClasses: Object.freeze(['LoadImage', 'IPAdapterModelLoader', 'CLIPVisionLoader', 'IPAdapterAdvanced']),
    runtimePolicy: Object.freeze({
      loadBuiltinExtras: true,
      customNodeFolders: Object.freeze([runtime.customNodeFolder]),
    }),
    workflow: Object.freeze({
      addNodes: Object.freeze({
        '900': Object.freeze({ class_type: 'IPAdapterModelLoader', inputs: Object.freeze({ ipadapter_file: runtime.ipAdapterModel.fileName }) }),
        '901': Object.freeze({ class_type: 'CLIPVisionLoader', inputs: Object.freeze({ clip_name: runtime.clipVisionModel.fileName }) }),
        '902': Object.freeze({ class_type: 'LoadImage', inputs: Object.freeze({ image: 'evavo-reference.png' }) }),
        '903': Object.freeze({
          class_type: 'IPAdapterAdvanced',
          inputs: Object.freeze({
            model: Object.freeze([runtime.baseModelNodeId, 0]),
            ipadapter: Object.freeze(['900', 0]),
            image: Object.freeze(['902', 0]),
            image_negative: null,
            attn_mask: null,
            clip_vision: Object.freeze(['901', 0]),
            weight: runtime.weight,
            weight_type: runtime.weightType,
            combine_embeds: runtime.combineEmbeds,
            start_at: runtime.startAt,
            end_at: runtime.endAt,
            embeds_scaling: runtime.embedsScaling,
          }),
        }),
      }),
      setInputs: Object.freeze([
        Object.freeze({ nodeId: runtime.samplerNodeId, input: 'model', value: Object.freeze(['903', 0]) }),
      ]),
    }),
    referenceBindings: Object.freeze([
      Object.freeze({
        role,
        nodeId: '902',
        input: 'image',
        strength: Object.freeze({ nodeId: '903', input: 'weight' }),
      }),
    ]),
    modelInventory: Object.freeze([
      Object.freeze({ id: runtime.ipAdapterModel.id, kind: 'ipadapter', sha256: runtime.ipAdapterModel.sha256 }),
      Object.freeze({ id: runtime.clipVisionModel.id, kind: 'clip-vision', sha256: runtime.clipVisionModel.sha256 }),
    ]),
    runtimeInventory: Object.freeze([
      Object.freeze({ id: runtime.runtimeId, version: runtime.version, sha256: runtime.runtimeSha256 }),
    ]),
  })));
}

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
  for (const key of result.keys()) if (!['--input', '--output-dir'].includes(key)) fail(`unsupported argument ${key}`);
  return result;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.get('--input'); const outputDir = args.get('--output-dir');
  if (!input || !outputDir) fail('--input and --output-dir are required');
  const packs = compileIpAdapterReferencePacks(await json(input, 'IP-Adapter runtime'));
  const root = path.resolve(outputDir);
  await mkdir(root, { recursive: true });
  const outputs = [];
  for (const pack of packs) {
    const file = path.join(root, `${pack.packId}.json`);
    await writeFile(file, `${JSON.stringify(pack, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    outputs.push(file);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, schema: 'evavo.ipadapter-reference-pack-compile-receipt.v1', outputs })}\n`);
}
const direct = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (direct) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
