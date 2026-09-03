#!/usr/bin/env node

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function adapterProfileId(adapterId) {
  if (typeof adapterId !== 'string' || !adapterId.startsWith('comfyui:')) fail(`invalid reviewed adapter ID ${String(adapterId)}`);
  return adapterId.slice('comfyui:'.length);
}
function profileRuntimePolicy(profile) {
  const referenceCapable = Array.isArray(profile.capabilities) && profile.capabilities.includes('reference-images');
  const raw = profile.runtimePolicy;
  if (referenceCapable && (!raw || typeof raw !== 'object' || Array.isArray(raw))) {
    fail(`reference-capable profile ${profile.profileId} must declare runtimePolicy`);
  }
  const loadBuiltinExtras = raw?.loadBuiltinExtras ?? false;
  if (typeof loadBuiltinExtras !== 'boolean') fail(`profile ${profile.profileId} runtimePolicy.loadBuiltinExtras must be boolean`);
  const customNodeFolders = raw?.customNodeFolders ?? [];
  if (!Array.isArray(customNodeFolders) || customNodeFolders.some((value) => typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value))) {
    fail(`profile ${profile.profileId} runtimePolicy.customNodeFolders is invalid`);
  }
  if (new Set(customNodeFolders).size !== customNodeFolders.length) fail(`profile ${profile.profileId} runtimePolicy.customNodeFolders contains duplicates`);
  return Object.freeze({ referenceCapable, loadBuiltinExtras, customNodeFolders: Object.freeze([...customNodeFolders]) });
}
function requiredNodeClasses(profile) {
  const entries = Array.isArray(profile.nodeInventory)
    ? profile.nodeInventory.map((entry) => entry?.classType)
    : Object.values(profile.workflow ?? {}).map((node) => node?.class_type);
  return entries.filter((value) => typeof value === 'string' && value.length > 0);
}

export function deriveManagedRuntimePolicy(providerSelectionRaw, catalogRaw) {
  const providerSelection = object(providerSelectionRaw, 'provider selection');
  const catalog = object(catalogRaw, 'ComfyUI catalog');
  if (!Array.isArray(catalog.profiles) || !catalog.profiles.length) fail('ComfyUI catalog has no profiles');

  const adapterIds = new Set();
  adapterIds.add(providerSelection.adapterId);
  for (const adapterId of providerSelection.referenceAdapterIds ?? []) adapterIds.add(adapterId);
  if ([...adapterIds].some((value) => typeof value !== 'string')) fail('provider selection contains an invalid adapter ID');

  const byId = new Map(catalog.profiles.map((profile) => [profile?.profileId, profile]));
  const profiles = [...adapterIds].map((adapterId) => {
    const profileId = adapterProfileId(adapterId);
    const profile = byId.get(profileId);
    if (!profile) fail(`selected reviewed profile ${profileId} is missing from the physical catalog`);
    return profile;
  });

  const customNodeFolders = new Set();
  const nodes = new Set();
  let loadBuiltinExtras = false;
  let referenceCapable = false;
  const profilePolicies = [];
  for (const profile of profiles) {
    const policy = profileRuntimePolicy(profile);
    loadBuiltinExtras ||= policy.loadBuiltinExtras;
    referenceCapable ||= policy.referenceCapable;
    for (const folder of policy.customNodeFolders) customNodeFolders.add(folder);
    for (const classType of requiredNodeClasses(profile)) nodes.add(classType);
    profilePolicies.push(Object.freeze({
      profileId: profile.profileId,
      profileSha256: profile.profileSha256 ?? null,
      referenceCapable: policy.referenceCapable,
      loadBuiltinExtras: policy.loadBuiltinExtras,
      customNodeFolders: policy.customNodeFolders,
    }));
  }

  const mode = referenceCapable ? 'reviewed-reference' : 'true-core';
  if (mode === 'true-core' && (loadBuiltinExtras || customNodeFolders.size > 0)) {
    fail('non-reference true-core selection may not request extra/custom-node runtime policy');
  }

  return Object.freeze({
    schema: 'evavo.managed-comfyui-runtime-policy.v2',
    mode,
    selectedAdapterIds: Object.freeze([...adapterIds].sort()),
    selectedProfileIds: Object.freeze(profiles.map((profile) => profile.profileId).sort()),
    loadBuiltinExtras,
    customNodeFolders: Object.freeze([...customNodeFolders].sort()),
    requiredNodeClasses: Object.freeze([...nodes].sort()),
    profilePolicies: Object.freeze(profilePolicies),
  });
}
