#!/usr/bin/env node

import { createHash } from 'node:crypto';

import { REFERENCE_CAPABILITY_REQUIREMENTS, REFERENCE_ROLES } from './local-generation-reference-graph-v2.mjs';

const ROLE_SET = new Set(REFERENCE_ROLES);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function id(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) fail(`${label} must be a safe identifier`);
  return value;
}
function string(value, label, max = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > max) fail(`${label} is invalid`);
  return value;
}
function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be an integer between ${min} and ${max}`);
  return value;
}
function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} must be lowercase SHA-256`);
  return value;
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function binding(raw, workflow, label) {
  const value = object(raw, label);
  const nodeId = id(value.nodeId, `${label}.nodeId`);
  const input = id(value.input, `${label}.input`);
  const node = workflow[nodeId];
  if (!node || typeof node !== 'object' || Array.isArray(node)) fail(`${label} references missing workflow node ${nodeId}`);
  if (!node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs) || !(input in node.inputs)) fail(`${label} references missing workflow input ${nodeId}.${input}`);
  return Object.freeze({ nodeId, input });
}
function modelInventory(value, label) {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 128) fail(`${label} must contain at most 128 entries`);
  const seen = new Set();
  return Object.freeze(value.map((raw, index) => {
    const entry = object(raw, `${label}[${index}]`);
    const result = Object.freeze({
      id: id(entry.id, `${label}[${index}].id`),
      kind: id(entry.kind, `${label}[${index}].kind`),
      sha256: digest(entry.sha256, `${label}[${index}].sha256`),
    });
    const key = `${result.kind}:${result.id}`;
    if (seen.has(key)) fail(`${label} contains duplicate ${key}`);
    seen.add(key);
    return result;
  }));
}
function runtimeInventory(value, label) {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 128) fail(`${label} must contain at most 128 entries`);
  const seen = new Set();
  return Object.freeze(value.map((raw, index) => {
    const entry = object(raw, `${label}[${index}]`);
    const result = Object.freeze({
      id: id(entry.id, `${label}[${index}].id`),
      version: id(entry.version, `${label}[${index}].version`),
      sha256: digest(entry.sha256, `${label}[${index}].sha256`),
    });
    if (seen.has(result.id)) fail(`${label} contains duplicate ${result.id}`);
    seen.add(result.id);
    return result;
  }));
}
function ensureUniqueModelInventory(entries) {
  const seen = new Set();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) fail(`combined model inventory contains duplicate ${key}`);
    seen.add(key);
  }
  return entries;
}
function ensureUniqueRuntimeInventory(entries) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.id)) fail(`combined runtime inventory contains duplicate ${entry.id}`);
    seen.add(entry.id);
  }
  return entries;
}

export function compileReferenceProfileDraft(baseProfileRaw, specificationRaw) {
  const base = object(baseProfileRaw, 'baseProfile');
  const spec = object(specificationRaw, 'referenceProfile');
  const workflow = object(spec.workflow, 'referenceProfile.workflow');
  const profileId = id(spec.profileId, 'referenceProfile.profileId');
  const referenceImagesRaw = spec.referenceImages;
  if (!Array.isArray(referenceImagesRaw) || referenceImagesRaw.length < 1 || referenceImagesRaw.length > 16) {
    fail('referenceProfile.referenceImages must contain 1 to 16 bindings');
  }
  const roles = new Set();
  const referenceImages = Object.freeze(referenceImagesRaw.map((raw, index) => {
    const entry = object(raw, `referenceProfile.referenceImages[${index}]`);
    if (typeof entry.role !== 'string' || !ROLE_SET.has(entry.role)) fail(`referenceProfile.referenceImages[${index}].role is unsupported`);
    if (roles.has(entry.role)) fail(`referenceProfile.referenceImages contains duplicate role ${entry.role}`);
    roles.add(entry.role);
    const image = binding(entry, workflow, `referenceProfile.referenceImages[${index}]`);
    return Object.freeze({
      role: entry.role,
      ...image,
      ...(entry.strength === undefined ? {} : { strength: binding(entry.strength, workflow, `referenceProfile.referenceImages[${index}].strength`) }),
    });
  }));

  const capabilities = new Set(Array.isArray(base.capabilities) ? base.capabilities : []);
  capabilities.add('reference-images');
  if (referenceImages.length > 1) capabilities.add('multiple-reference-images');
  for (const role of roles) {
    const required = REFERENCE_CAPABILITY_REQUIREMENTS[role];
    if (required) capabilities.add(required);
    if (role === 'mask') capabilities.add('mask');
  }
  for (const capability of spec.additionalCapabilities ?? []) capabilities.add(id(capability, 'referenceProfile.additionalCapabilities[]'));

  const runtimePolicyRaw = object(spec.runtimePolicy, 'referenceProfile.runtimePolicy');
  const loadBuiltinExtras = runtimePolicyRaw.loadBuiltinExtras ?? false;
  if (typeof loadBuiltinExtras !== 'boolean') fail('referenceProfile.runtimePolicy.loadBuiltinExtras must be boolean');
  const folders = runtimePolicyRaw.customNodeFolders ?? [];
  if (!Array.isArray(folders) || folders.length < 1 || folders.length > 64) fail('referenceProfile.runtimePolicy.customNodeFolders must contain 1 to 64 folders');
  const customNodeFolders = folders.map((value, index) => {
    if (typeof value !== 'string' || !SAFE_FOLDER.test(value)) fail(`referenceProfile.runtimePolicy.customNodeFolders[${index}] is invalid`);
    return value;
  });
  if (new Set(customNodeFolders).size !== customNodeFolders.length) fail('referenceProfile.runtimePolicy.customNodeFolders contains duplicates');

  const baseBindings = object(base.bindings ?? {}, 'baseProfile.bindings');
  const bindings = {
    ...baseBindings,
    ...(spec.bindings ?? {}),
    referenceImages,
  };
  for (const [name, value] of Object.entries(bindings)) {
    if (name === 'referenceImages' || value === undefined) continue;
    binding(value, workflow, `referenceProfile.bindings.${name}`);
  }

  const models = ensureUniqueModelInventory([
    ...modelInventory(base.modelInventory ?? [], 'baseProfile.modelInventory'),
    ...modelInventory(spec.modelInventoryAdditions ?? [], 'referenceProfile.modelInventoryAdditions'),
  ]);
  const runtimes = ensureUniqueRuntimeInventory([
    ...runtimeInventory(base.runtimeInventory ?? [], 'baseProfile.runtimeInventory'),
    ...runtimeInventory(spec.runtimeInventoryAdditions ?? [], 'referenceProfile.runtimeInventoryAdditions'),
  ]);

  const maximumReferenceImages = integer(spec.maximumReferenceImages ?? referenceImages.length, 'referenceProfile.maximumReferenceImages', referenceImages.length, 128);
  const result = {
    profileId,
    label: string(spec.label ?? `${base.label ?? base.profileId} reference-conditioned`, 'referenceProfile.label', 256),
    description: string(spec.description ?? `Reviewed reference-conditioned variant of ${base.profileId}.`, 'referenceProfile.description'),
    version: id(spec.version ?? `${base.version ?? '1.0.0'}-reference`, 'referenceProfile.version'),
    priority: integer(spec.priority ?? Number(base.priority ?? 0) + 100, 'referenceProfile.priority', -10000, 10000),
    operations: spec.operations ?? base.operations,
    assetKinds: spec.assetKinds ?? base.assetKinds,
    continuityPhases: spec.continuityPhases ?? base.continuityPhases,
    capabilities: [...capabilities].sort(),
    modelId: id(spec.modelId ?? base.modelId, 'referenceProfile.modelId'),
    workflow,
    bindings,
    outputNodeIds: spec.outputNodeIds ?? base.outputNodeIds,
    modelInventory: models,
    runtimeInventory: runtimes,
    limits: {
      ...(base.limits ?? {}),
      ...(spec.limits ?? {}),
      maximumReferenceImages,
    },
    runtimePolicy: {
      loadBuiltinExtras,
      customNodeFolders: [...customNodeFolders].sort(),
    },
  };
  return Object.freeze({
    profile: result,
    specificationSha256: sha256(Buffer.from(canonical(spec), 'utf8')),
    workflowSha256: sha256(Buffer.from(canonical(workflow), 'utf8')),
    referenceRoles: Object.freeze([...roles].sort()),
    customNodeFolders: Object.freeze([...customNodeFolders].sort()),
  });
}

export function appendReferenceProfilesToDraft(catalogDraftRaw, specificationsRaw) {
  const draft = object(catalogDraftRaw, 'catalogDraft');
  if (!Array.isArray(draft.profiles) || !draft.profiles.length) fail('catalogDraft.profiles must contain at least one profile');
  if (!Array.isArray(specificationsRaw) || !specificationsRaw.length || specificationsRaw.length > 64) fail('reference profile specifications must contain 1 to 64 entries');
  const byId = new Map(draft.profiles.map((profile) => [profile?.profileId, profile]));
  const additions = specificationsRaw.map((raw, index) => {
    const spec = object(raw, `referenceProfiles[${index}]`);
    const baseProfileId = id(spec.baseProfileId, `referenceProfiles[${index}].baseProfileId`);
    const base = byId.get(baseProfileId);
    if (!base) fail(`referenceProfiles[${index}] base profile ${baseProfileId} is missing`);
    const compiled = compileReferenceProfileDraft(base, spec);
    if (byId.has(compiled.profile.profileId)) fail(`reference profile ${compiled.profile.profileId} already exists`);
    byId.set(compiled.profile.profileId, compiled.profile);
    return compiled;
  });
  return Object.freeze({
    draft: Object.freeze({ ...draft, profiles: Object.freeze([...draft.profiles, ...additions.map((entry) => entry.profile)]) }),
    additions: Object.freeze(additions),
  });
}
