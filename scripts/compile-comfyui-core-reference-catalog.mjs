#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import {
  compileComfyUIWorkflowCatalog,
  validateComfyUIWorkflowCatalog,
} from '../packages/providers/dist/index.js';

const DRAFT_SCHEMA = 'evavo.comfyui-workflow-catalog-draft.v1';
const DEFAULT_ROLES = Object.freeze([
  'base-image',
  'direction-master',
  'previous-key-pose',
  'next-key-pose',
]);
const ROLE_CAPABILITY = Object.freeze({
  'base-image': null,
  'direction-master': 'direction-reference',
  'previous-key-pose': 'temporal-reference',
  'next-key-pose': 'temporal-reference',
});
const MAXIMUM_BYTES = 16 * 1024 * 1024;

function fail(message) { throw new Error(message); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function safeSuffix(role) { return role.replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, ''); }
function unique(values) { return [...new Set(values)].sort(); }

function parseArgs(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || result.has(key)) {
      fail('arguments must be unique --name value pairs');
    }
    result.set(key, value);
  }
  for (const key of result.keys()) {
    if (!['--input', '--output', '--roles'].includes(key)) fail(`unsupported argument ${key}`);
  }
  const input = result.get('--input');
  const output = result.get('--output');
  if (!input || !output) fail('usage: --input <compiled-catalog.json> --output <compiled-catalog.json> [--roles role,role]');
  const roles = (result.get('--roles') ?? DEFAULT_ROLES.join(','))
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (!roles.length || roles.some((role) => !(role in ROLE_CAPABILITY))) {
    fail(`roles must be selected from: ${Object.keys(ROLE_CAPABILITY).join(', ')}`);
  }
  return Object.freeze({ input: path.resolve(input), output: path.resolve(output), roles: unique(roles) });
}

function draftProfile(profile) {
  return {
    profileId: profile.profileId,
    label: profile.label,
    description: profile.description,
    version: profile.version,
    priority: profile.priority,
    operations: profile.operations,
    assetKinds: profile.assetKinds,
    continuityPhases: profile.continuityPhases,
    capabilities: profile.capabilities,
    modelId: profile.modelId,
    workflow: profile.workflow,
    bindings: profile.bindings,
    outputNodeIds: profile.outputNodeIds,
    modelInventory: profile.modelInventory,
    runtimeInventory: profile.runtimeInventory,
    limits: profile.limits,
    ...(profile.runtimePolicy === undefined ? {} : { runtimePolicy: profile.runtimePolicy }),
  };
}

function uniqueNode(flow, classType, profileId) {
  const matches = Object.entries(flow).filter(([, node]) => node?.class_type === classType);
  if (matches.length !== 1) fail(`${profileId} must contain exactly one ${classType} node; found ${matches.length}`);
  return matches[0];
}

function freshNodeIds(flow, count) {
  const used = new Set(Object.keys(flow));
  const numeric = [...used].map((value) => Number(value)).filter(Number.isSafeInteger);
  let cursor = numeric.length ? Math.max(...numeric) + 1 : 9000;
  const result = [];
  while (result.length < count) {
    const id = String(cursor++);
    if (!used.has(id)) { used.add(id); result.push(id); }
  }
  return result;
}

function bindingValue(profile, name, fallback) {
  const binding = profile.bindings?.[name];
  if (!binding) return fallback;
  const value = profile.workflow?.[binding.nodeId]?.inputs?.[binding.input];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeReferenceProfile(base, role) {
  if (!base.operations.includes('generate')) fail(`${base.profileId} does not support generate`);
  if (base.bindings?.referenceImages?.length) fail(`${base.profileId} already contains reference-image bindings`);
  if (!(role in ROLE_CAPABILITY)) fail(`${role} is not an honest core img2img reference role`);

  const next = clone(draftProfile(base));
  const [checkpointId] = uniqueNode(next.workflow, 'CheckpointLoaderSimple', base.profileId);
  const [samplerId, sampler] = (() => {
    const standard = Object.entries(next.workflow).filter(([, node]) => node?.class_type === 'KSampler');
    const advanced = Object.entries(next.workflow).filter(([, node]) => node?.class_type === 'KSamplerAdvanced');
    const matches = [...standard, ...advanced];
    if (matches.length !== 1) fail(`${base.profileId} must contain exactly one KSampler or KSamplerAdvanced node; found ${matches.length}`);
    return matches[0];
  })();
  if (!Object.hasOwn(sampler.inputs, 'latent_image')) fail(`${base.profileId} sampler is missing latent_image`);

  const [loadId, scaleId, encodeId] = freshNodeIds(next.workflow, 3);
  const width = bindingValue(base, 'width', 1024);
  const height = bindingValue(base, 'height', 1024);

  next.workflow[loadId] = {
    class_type: 'LoadImage',
    inputs: { image: 'evavo-reference-placeholder.png', upload: 'image' },
    _meta: { title: `EVAVO ${role} reference` },
  };
  next.workflow[scaleId] = {
    class_type: 'ImageScale',
    inputs: {
      image: [loadId, 0],
      upscale_method: 'lanczos',
      width,
      height,
      crop: 'disabled',
    },
    _meta: { title: 'EVAVO reference target size' },
  };
  next.workflow[encodeId] = {
    class_type: 'VAEEncode',
    inputs: { pixels: [scaleId, 0], vae: [checkpointId, 2] },
    _meta: { title: 'EVAVO reference latent' },
  };
  next.workflow[samplerId].inputs.latent_image = [encodeId, 0];

  next.bindings.width = { nodeId: scaleId, input: 'width' };
  next.bindings.height = { nodeId: scaleId, input: 'height' };
  delete next.bindings.candidateCount;
  next.bindings.referenceImages = [{ role, nodeId: loadId, input: 'image' }];

  const roleCapability = ROLE_CAPABILITY[role];
  next.capabilities = unique([
    ...next.capabilities.filter((capability) => capability !== 'candidate-count' && capability !== 'multiple-reference-images'),
    'reference-images',
    ...(roleCapability ? [roleCapability] : []),
  ]);
  next.limits = { ...next.limits, maximumCandidates: 1, maximumReferenceImages: 1 };
  next.profileId = `${base.profileId}-reference-${safeSuffix(role)}`;
  next.label = `${base.label} — core ${role} reference`;
  next.description = `${base.description} Core-only single-image img2img latent conditioning for ${role}; whole-image latent guidance only. It is not IP-Adapter identity conditioning, ControlNet pose/edge/depth conditioning, or feature isolation.`;
  next.version = `${base.version}-reference-${safeSuffix(role)}`;
  next.priority = base.priority - 10;
  return next;
}

export function compileCoreReferenceCatalog(input, options = {}) {
  const catalog = validateComfyUIWorkflowCatalog(input);
  const roles = unique(options.roles ?? DEFAULT_ROLES);
  if (!roles.length || roles.some((role) => !(role in ROLE_CAPABILITY))) fail('unsupported reference role');

  const existingIds = new Set(catalog.profiles.map((profile) => profile.profileId));
  const sourceProfiles = catalog.profiles.filter((profile) =>
    profile.operations.includes('generate') &&
    !profile.bindings.referenceImages.length &&
    !profile.profileId.includes('-reference-')
  );
  if (!sourceProfiles.length) fail('compiled catalog contains no eligible generate profiles');

  const additions = [];
  for (const base of sourceProfiles) {
    for (const role of roles) {
      const candidate = makeReferenceProfile(base, role);
      if (!existingIds.has(candidate.profileId)) additions.push(candidate);
    }
  }
  if (!additions.length) fail('no new reference profiles were produced');

  const draft = {
    schemaVersion: DRAFT_SCHEMA,
    catalogId: catalog.catalogId,
    catalogVersion: `${catalog.catalogVersion}-core-reference-v2`,
    profiles: [
      ...catalog.profiles.map(draftProfile),
      ...additions,
    ],
  };
  return compileComfyUIWorkflowCatalog(draft);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.input === args.output) fail('input and output paths must differ');
  const bytes = await readFile(args.input);
  if (!bytes.length || bytes.length > MAXIMUM_BYTES) fail(`input catalog must contain 1 to ${MAXIMUM_BYTES} bytes`);
  const parsed = JSON.parse(bytes.toString('utf8'));
  const compiled = compileCoreReferenceCatalog(parsed, { roles: args.roles });
  await writeFile(args.output, `${JSON.stringify(compiled, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    schema: 'evavo.comfyui-core-reference-catalog-compile.v2',
    ok: true,
    catalogId: compiled.catalogId,
    catalogVersion: compiled.catalogVersion,
    catalogSha256: compiled.catalogSha256,
    profileCount: compiled.profiles.length,
    semanticBoundary: 'core img2img only; canonical identity is reserved for reviewed identity conditioning',
    referenceProfiles: compiled.profiles
      .filter((profile) => profile.profileId.includes('-reference-'))
      .map((profile) => ({
        adapterId: `comfyui:${profile.profileId}`,
        profileSha256: profile.profileSha256,
        workflowSha256: profile.workflowSha256,
        capabilities: profile.capabilities,
        maximumCandidates: profile.limits.maximumCandidates,
        maximumReferenceImages: profile.limits.maximumReferenceImages,
        referenceRoles: profile.bindings.referenceImages.map((entry) => entry.role),
      })),
  })}\n`);
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ schema: 'evavo.comfyui-core-reference-catalog-compile.v2', ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 2;
});
