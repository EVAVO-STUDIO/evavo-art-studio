#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PACK_SCHEMA = 'evavo.local-generation-reference-pack.v1';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const REFERENCE_ROLES = new Set([
  'canonical-identity', 'direction-master', 'previous-key-pose', 'next-key-pose',
  'base-image', 'mask', 'pose-control', 'edge-control', 'depth-control',
  'palette-reference', 'line-reference', 'material-reference', 'layer-context',
]);

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function safeId(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) fail(`${label} must be a safe identifier`);
  return value;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function safeVersion(value) {
  const result = String(value).replace(/[^A-Za-z0-9._:-]+/gu, '-').replace(/^-+|-+$/gu, '');
  if (!result) fail('version normalized to an empty identifier');
  return result;
}
function uniqueBy(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = item[key];
    if (seen.has(value)) fail(`${label} contains duplicate ${key} ${value}`);
    seen.add(value);
  }
}
function inventory(value, label, runtime = false) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 64) fail(`${label} must contain at most 64 entries`);
  const result = value.map((raw, index) => {
    const item = object(raw, `${label}[${index}]`);
    const id = safeId(item.id, `${label}[${index}].id`);
    const discriminator = runtime ? safeId(item.version, `${label}[${index}].version`) : safeId(item.kind, `${label}[${index}].kind`);
    if (typeof item.sha256 !== 'string' || !SHA256.test(item.sha256)) fail(`${label}[${index}].sha256 must be lowercase SHA-256`);
    return runtime ? { id, version: discriminator, sha256: item.sha256 } : { id, kind: discriminator, sha256: item.sha256 };
  });
  uniqueBy(result, 'id', label);
  return result;
}
function validatePack(raw) {
  const pack = object(raw, 'reference pack');
  if (pack.schema !== PACK_SCHEMA) fail(`reference pack must use ${PACK_SCHEMA}`);
  const packId = safeId(pack.packId, 'packId');
  const version = safeId(pack.version, 'version');
  const profileSuffix = safeId(pack.profileSuffix, 'profileSuffix');
  if (!Array.isArray(pack.capabilities) || !pack.capabilities.length || pack.capabilities.length > 64) fail('capabilities must contain 1 to 64 entries');
  const capabilities = pack.capabilities.map((value, index) => safeId(value, `capabilities[${index}]`));
  if (new Set(capabilities).size !== capabilities.length) fail('capabilities contains duplicates');
  if (!capabilities.includes('reference-images')) fail('reference pack capabilities must include reference-images');
  if (!Number.isInteger(pack.maximumReferenceImages) || pack.maximumReferenceImages < 1 || pack.maximumReferenceImages > 16) fail('maximumReferenceImages must be 1 to 16');
  const workflow = object(pack.workflow, 'workflow');
  const addNodes = object(workflow.addNodes ?? {}, 'workflow.addNodes');
  const addNodeEntries = Object.entries(addNodes);
  if (addNodeEntries.length > 256) fail('workflow.addNodes may contain at most 256 nodes');
  for (const [nodeId, nodeRaw] of addNodeEntries) {
    safeId(nodeId, `workflow.addNodes node ${nodeId}`);
    const node = object(nodeRaw, `workflow.addNodes.${nodeId}`);
    safeId(node.class_type, `workflow.addNodes.${nodeId}.class_type`);
    object(node.inputs, `workflow.addNodes.${nodeId}.inputs`);
  }
  const setInputs = workflow.setInputs ?? [];
  if (!Array.isArray(setInputs) || setInputs.length > 512) fail('workflow.setInputs must contain at most 512 entries');
  for (let index = 0; index < setInputs.length; index += 1) {
    const patch = object(setInputs[index], `workflow.setInputs[${index}]`);
    safeId(patch.nodeId, `workflow.setInputs[${index}].nodeId`);
    safeId(patch.input, `workflow.setInputs[${index}].input`);
    if (!Object.hasOwn(patch, 'value')) fail(`workflow.setInputs[${index}].value is required`);
  }
  const referenceBindings = pack.referenceBindings;
  if (!Array.isArray(referenceBindings) || !referenceBindings.length || referenceBindings.length > 16) fail('referenceBindings must contain 1 to 16 entries');
  const bindings = referenceBindings.map((rawBinding, index) => {
    const binding = object(rawBinding, `referenceBindings[${index}]`);
    if (typeof binding.role !== 'string' || !REFERENCE_ROLES.has(binding.role)) fail(`referenceBindings[${index}].role is unsupported`);
    const result = { role: binding.role, nodeId: safeId(binding.nodeId, `referenceBindings[${index}].nodeId`), input: safeId(binding.input, `referenceBindings[${index}].input`) };
    if (binding.strength != null) {
      const strength = object(binding.strength, `referenceBindings[${index}].strength`);
      result.strength = { nodeId: safeId(strength.nodeId, `referenceBindings[${index}].strength.nodeId`), input: safeId(strength.input, `referenceBindings[${index}].strength.input`) };
    }
    return result;
  });
  uniqueBy(bindings, 'role', 'referenceBindings');
  if (pack.maximumReferenceImages < bindings.length) fail('maximumReferenceImages may not be smaller than the number of referenceBindings');
  const requiredNodeClasses = pack.requiredNodeClasses ?? [];
  if (!Array.isArray(requiredNodeClasses) || requiredNodeClasses.length > 128) fail('requiredNodeClasses must contain at most 128 entries');
  const classes = requiredNodeClasses.map((value, index) => safeId(value, `requiredNodeClasses[${index}]`));
  if (new Set(classes).size !== classes.length) fail('requiredNodeClasses contains duplicates');
  return {
    packId, version, profileSuffix, capabilities, maximumReferenceImages: pack.maximumReferenceImages,
    label: typeof pack.label === 'string' && pack.label.trim() ? pack.label.trim() : packId,
    description: typeof pack.description === 'string' && pack.description.trim() ? pack.description.trim() : `Reviewed reference pack ${packId}.`,
    addNodes, setInputs, referenceBindings: bindings, requiredNodeClasses: classes,
    modelInventory: inventory(pack.modelInventory, 'modelInventory', false),
    runtimeInventory: inventory(pack.runtimeInventory, 'runtimeInventory', true),
  };
}
function assertBinding(workflow, binding, label) {
  const node = workflow[binding.nodeId];
  if (!node || typeof node !== 'object') fail(`${label} references missing node ${binding.nodeId}`);
  if (!node.inputs || typeof node.inputs !== 'object' || !Object.hasOwn(node.inputs, binding.input)) fail(`${label} references missing input ${binding.nodeId}.${binding.input}`);
}
function mergeInventory(base, additions, label) {
  const result = clone(base ?? []);
  const byId = new Map(result.map((item) => [item.id, item]));
  for (const addition of additions) {
    const existing = byId.get(addition.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(addition)) fail(`${label} entry ${addition.id} conflicts with base profile inventory`);
    if (!existing) { result.push(clone(addition)); byId.set(addition.id, addition); }
  }
  return result;
}

export function compileReferencePackedDraft(draftRaw, packRaw, baseProfileId = null) {
  const draft = object(draftRaw, 'ComfyUI catalog draft');
  if (!Array.isArray(draft.profiles) || !draft.profiles.length) fail('ComfyUI catalog draft must contain profiles');
  const pack = validatePack(packRaw);
  const base = baseProfileId ? draft.profiles.find((profile) => profile?.profileId === baseProfileId) : draft.profiles[0];
  if (!base) fail(`base profile ${baseProfileId} was not found`);
  const next = clone(base);
  next.profileId = `${base.profileId}-${pack.profileSuffix}`;
  next.label = `${base.label} · ${pack.label}`;
  next.description = `${base.description} ${pack.description}`;
  next.version = safeVersion(`${base.version}-reference.${pack.version}`);
  next.priority = Number(base.priority ?? 0) + 20;
  next.workflow = clone(base.workflow ?? {});
  for (const [nodeId, node] of Object.entries(pack.addNodes)) {
    if (Object.hasOwn(next.workflow, nodeId)) fail(`reference pack may not overwrite existing workflow node ${nodeId}`);
    next.workflow[nodeId] = clone(node);
  }
  for (const patch of pack.setInputs) {
    const node = next.workflow[patch.nodeId];
    if (!node || typeof node !== 'object' || !node.inputs || typeof node.inputs !== 'object') fail(`workflow.setInputs references missing node ${patch.nodeId}`);
    if (!Object.hasOwn(node.inputs, patch.input)) fail(`workflow.setInputs references missing input ${patch.nodeId}.${patch.input}`);
    node.inputs[patch.input] = clone(patch.value);
  }
  const classTypes = new Set(Object.values(next.workflow).map((node) => node?.class_type).filter(Boolean));
  for (const requiredClass of pack.requiredNodeClasses) if (!classTypes.has(requiredClass)) fail(`reference pack required node class ${requiredClass} is absent from compiled workflow`);
  next.bindings = clone(base.bindings ?? {});
  next.bindings.referenceImages = clone(pack.referenceBindings);
  for (let index = 0; index < next.bindings.referenceImages.length; index += 1) {
    const binding = next.bindings.referenceImages[index];
    assertBinding(next.workflow, binding, `referenceBindings[${index}]`);
    if (binding.strength) assertBinding(next.workflow, binding.strength, `referenceBindings[${index}].strength`);
  }
  next.capabilities = [...new Set([...(base.capabilities ?? []), ...pack.capabilities])];
  next.modelInventory = mergeInventory(base.modelInventory, pack.modelInventory, 'modelInventory');
  next.runtimeInventory = mergeInventory(base.runtimeInventory, pack.runtimeInventory, 'runtimeInventory');
  next.limits = { ...(base.limits ?? {}), maximumReferenceImages: pack.maximumReferenceImages };
  delete next.profileSha256;
  delete next.workflowSha256;
  delete next.nodeInventory;
  delete next.nodeInventorySha256;
  delete next.modelInventorySha256;
  delete next.runtimeInventorySha256;

  return {
    ...clone(draft),
    catalogVersion: safeVersion(`${draft.catalogVersion ?? '1'}-reference-${pack.packId}`),
    profiles: [...draft.profiles.filter((profile) => profile.profileId !== next.profileId), next],
  };
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
  for (const key of result.keys()) if (!['--input', '--pack', '--output', '--base-profile'].includes(key)) fail(`unsupported argument ${key}`);
  return result;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.get('--input'); const packPath = args.get('--pack'); const output = args.get('--output');
  if (!input || !packPath || !output) fail('--input, --pack and --output are required');
  const result = compileReferencePackedDraft(await json(input, 'ComfyUI catalog draft'), await json(packPath, 'reference pack'), args.get('--base-profile') ?? null);
  await writeFile(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8' });
  process.stdout.write(`${JSON.stringify({ ok: true, output: path.resolve(output), generatedProfileIds: result.profiles.map((profile) => profile.profileId) })}\n`);
}
const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
