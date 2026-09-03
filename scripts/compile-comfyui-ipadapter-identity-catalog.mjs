#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import { compileComfyUIWorkflowCatalog, validateComfyUIWorkflowCatalog } from '../packages/providers/dist/index.js';
import { buildIpAdapterIdentityProfile } from './compile-comfyui-ipadapter-identity-profile.mjs';

const DRAFT_SCHEMA = 'evavo.comfyui-workflow-catalog-draft.v1';
const MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_IP_FILE = 'ip-adapter-plus_sdxl_vit-h.safetensors';
const DEFAULT_CLIP_FILE = 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors';

function fail(message) { throw new Error(message); }
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
function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || values.has(key)) fail('arguments must be unique --name value pairs');
    values.set(key, value);
  }
  const allowed = new Set([
    '--input', '--output', '--ip-adapter-sha256', '--clip-vision-sha256', '--custom-node-sha256', '--custom-node-version',
    '--ip-adapter-file', '--clip-vision-file', '--default-weight',
  ]);
  for (const key of values.keys()) if (!allowed.has(key)) fail(`unsupported argument ${key}`);
  for (const key of ['--input', '--output', '--ip-adapter-sha256', '--clip-vision-sha256', '--custom-node-sha256', '--custom-node-version']) {
    if (!values.get(key)) fail(`${key} is required`);
  }
  const defaultWeight = values.has('--default-weight') ? Number(values.get('--default-weight')) : 0.8;
  if (!Number.isFinite(defaultWeight) || defaultWeight < 0 || defaultWeight > 2) fail('--default-weight must be between 0 and 2');
  return Object.freeze({
    input: path.resolve(values.get('--input')),
    output: path.resolve(values.get('--output')),
    ipAdapterSha256: values.get('--ip-adapter-sha256'),
    clipVisionSha256: values.get('--clip-vision-sha256'),
    customNodeSha256: values.get('--custom-node-sha256'),
    customNodeVersion: values.get('--custom-node-version'),
    ipAdapterFile: values.get('--ip-adapter-file') ?? DEFAULT_IP_FILE,
    clipVisionFile: values.get('--clip-vision-file') ?? DEFAULT_CLIP_FILE,
    defaultWeight,
  });
}

export function compileIpAdapterIdentityCatalog(input, options) {
  const catalog = validateComfyUIWorkflowCatalog(input);
  const sourceProfiles = catalog.profiles.filter((profile) =>
    profile.operations.includes('generate') &&
    !profile.profileId.includes('-reference-') &&
    !profile.profileId.includes('-identity-ipadapter') &&
    profile.bindings.referenceImages.length === 0 &&
    profile.workflow &&
    Object.values(profile.workflow).some((node) => node?.class_type === 'CheckpointLoaderSimple') &&
    Object.values(profile.workflow).some((node) => node?.class_type === 'KSampler' || node?.class_type === 'KSamplerAdvanced')
  );
  if (!sourceProfiles.length) fail('catalog contains no eligible reviewed generate profiles for IP-Adapter identity variants');
  const existing = new Set(catalog.profiles.map((profile) => profile.profileId));
  const additions = [];
  for (const base of sourceProfiles) {
    const profileId = `${base.profileId}-identity-ipadapter`;
    if (existing.has(profileId)) continue;
    const built = buildIpAdapterIdentityProfile(base, {
      profileId,
      ipAdapterFile: options.ipAdapterFile ?? DEFAULT_IP_FILE,
      clipVisionFile: options.clipVisionFile ?? DEFAULT_CLIP_FILE,
      ipAdapterSha256: options.ipAdapterSha256,
      clipVisionSha256: options.clipVisionSha256,
      customNodeVersion: options.customNodeVersion,
      customNodeSha256: options.customNodeSha256,
      defaultWeight: options.defaultWeight ?? 0.8,
      customNodeFolder: 'ComfyUI_IPAdapter_plus',
      ipAdapterModelId: 'ip-adapter-plus-sdxl-vit-h',
      clipVisionModelId: 'clip-vision-vit-h',
      customNodeRuntimeId: 'comfyui-ipadapter-plus',
    });
    additions.push(built.profile);
  }
  if (!additions.length) fail('catalog already contains all eligible IP-Adapter identity variants');
  const draft = {
    schemaVersion: DRAFT_SCHEMA,
    catalogId: catalog.catalogId,
    catalogVersion: `${catalog.catalogVersion}-identity-ipadapter-v1`,
    profiles: [
      ...catalog.profiles.map(draftProfile),
      ...additions,
    ],
  };
  const compiled = compileComfyUIWorkflowCatalog(draft);
  return Object.freeze({
    catalog: compiled,
    additions: Object.freeze(compiled.profiles.filter((profile) => additions.some((item) => item.profileId === profile.profileId))),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.input === args.output) fail('input and output paths must differ');
  const bytes = await readFile(args.input);
  if (!bytes.length || bytes.length > MAX_BYTES) fail(`input catalog must contain 1 to ${MAX_BYTES} bytes`);
  const parsed = JSON.parse(bytes.toString('utf8'));
  const result = compileIpAdapterIdentityCatalog(parsed, args);
  await writeFile(args.output, `${JSON.stringify(result.catalog, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    schema: 'evavo.comfyui-ipadapter-identity-catalog-compile.v1',
    ok: true,
    catalogId: result.catalog.catalogId,
    catalogVersion: result.catalog.catalogVersion,
    catalogSha256: result.catalog.catalogSha256,
    profileCount: result.catalog.profiles.length,
    identityProfiles: result.additions.map((profile) => ({
      adapterId: `comfyui:${profile.profileId}`,
      profileSha256: profile.profileSha256,
      workflowSha256: profile.workflowSha256,
      referenceRoles: profile.bindings.referenceImages.map((entry) => entry.role),
      customNodeFolders: profile.runtimePolicy?.customNodeFolders ?? [],
      capabilities: profile.capabilities,
      maximumReferenceImages: profile.limits.maximumReferenceImages,
    })),
  })}\n`);
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ schema: 'evavo.comfyui-ipadapter-identity-catalog-compile.v1', ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 2;
});
