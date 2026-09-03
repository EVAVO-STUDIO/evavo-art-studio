#!/usr/bin/env node

import { compileReferenceProfileDraft } from './local-generation-reference-profile-v2.mjs';

function fail(message) { throw new Error(message); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function hash(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail(`${label} must be lowercase SHA-256`);
  return value;
}
function safeId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) fail(`${label} must be a safe identifier`);
  return value;
}
function exactlyOneNode(workflow, classType, label) {
  const matches = Object.entries(workflow).filter(([, node]) => node?.class_type === classType);
  if (matches.length !== 1) fail(`${label} must contain exactly one ${classType}; found ${matches.length}`);
  return matches[0];
}
function samplerNode(workflow, label) {
  const matches = Object.entries(workflow).filter(([, node]) => node?.class_type === 'KSampler' || node?.class_type === 'KSamplerAdvanced');
  if (matches.length !== 1) fail(`${label} must contain exactly one KSampler or KSamplerAdvanced; found ${matches.length}`);
  return matches[0];
}
function freshNodeIds(workflow, count) {
  const used = new Set(Object.keys(workflow));
  const numeric = [...used].map(Number).filter(Number.isSafeInteger);
  let cursor = numeric.length ? Math.max(...numeric) + 1 : 9000;
  const result = [];
  while (result.length < count) {
    const candidate = String(cursor++);
    if (!used.has(candidate)) { used.add(candidate); result.push(candidate); }
  }
  return result;
}

export function buildIpAdapterIdentityProfile(baseProfileRaw, optionsRaw) {
  const base = object(baseProfileRaw, 'base profile');
  const options = object(optionsRaw, 'IP-Adapter identity options');
  const workflow = clone(object(base.workflow, 'base profile workflow'));
  if (Array.isArray(base.bindings?.referenceImages) && base.bindings.referenceImages.length) {
    fail(`${base.profileId} already contains reference-image bindings`);
  }
  if (!Array.isArray(base.operations) || !base.operations.includes('generate')) fail(`${base.profileId} must support generate`);

  const [checkpointId] = exactlyOneNode(workflow, 'CheckpointLoaderSimple', base.profileId);
  const [samplerId, sampler] = samplerNode(workflow, base.profileId);
  if (!sampler.inputs || !Object.hasOwn(sampler.inputs, 'model')) fail(`${base.profileId} sampler is missing model input`);
  const originalModel = clone(sampler.inputs.model);
  if (!Array.isArray(originalModel) || originalModel.length !== 2 || originalModel[0] !== checkpointId || originalModel[1] !== 0) {
    fail(`${base.profileId} sampler model input must come directly from CheckpointLoaderSimple MODEL output`);
  }

  const ipAdapterFile = safeId(options.ipAdapterFile, 'ipAdapterFile');
  const clipVisionFile = safeId(options.clipVisionFile, 'clipVisionFile');
  const customNodeVersion = safeId(options.customNodeVersion, 'customNodeVersion');
  const customNodeFolder = options.customNodeFolder ?? 'ComfyUI_IPAdapter_plus';
  if (typeof customNodeFolder !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(customNodeFolder)) fail('customNodeFolder is invalid');
  const defaultWeight = options.defaultWeight ?? 0.8;
  if (typeof defaultWeight !== 'number' || !Number.isFinite(defaultWeight) || defaultWeight < 0 || defaultWeight > 2) fail('defaultWeight must be between 0 and 2');

  const [loadId, prepId, modelLoaderId, clipLoaderId, applyId] = freshNodeIds(workflow, 5);
  workflow[loadId] = {
    class_type: 'LoadImage',
    inputs: { image: 'evavo-canonical-identity-placeholder.png', upload: 'image' },
    _meta: { title: 'EVAVO canonical identity reference' },
  };
  workflow[prepId] = {
    class_type: 'PrepImageForClipVision',
    inputs: { image: [loadId, 0], interpolation: 'LANCZOS', crop_position: 'top', sharpening: 0.15 },
    _meta: { title: 'EVAVO identity CLIP preparation' },
  };
  workflow[modelLoaderId] = {
    class_type: 'IPAdapterModelLoader',
    inputs: { ipadapter_file: ipAdapterFile },
    _meta: { title: 'EVAVO SDXL IP-Adapter model' },
  };
  workflow[clipLoaderId] = {
    class_type: 'CLIPVisionLoader',
    inputs: { clip_name: clipVisionFile },
    _meta: { title: 'EVAVO ViT-H CLIP Vision' },
  };
  workflow[applyId] = {
    class_type: 'IPAdapterAdvanced',
    inputs: {
      model: originalModel,
      ipadapter: [modelLoaderId, 0],
      image: [prepId, 0],
      image_negative: null,
      attn_mask: null,
      clip_vision: [clipLoaderId, 0],
      weight: defaultWeight,
      weight_type: options.weightType ?? 'linear',
      combine_embeds: options.combineEmbeds ?? 'concat',
      start_at: options.startAt ?? 0,
      end_at: options.endAt ?? 1,
      embeds_scaling: options.embedsScaling ?? 'V only',
    },
    _meta: { title: 'EVAVO canonical identity conditioning' },
  };
  sampler.inputs.model = [applyId, 0];

  const baseBindings = clone(base.bindings ?? {});
  const spec = {
    baseProfileId: base.profileId,
    profileId: options.profileId ?? `${base.profileId}-identity-ipadapter`,
    label: options.label ?? `${base.label} — IP-Adapter identity`,
    description: options.description ?? `${base.description} Reviewed SDXL IP-Adapter Plus ViT-H canonical identity conditioning.`,
    version: options.version ?? `${base.version}-identity-ipadapter`,
    priority: options.priority ?? Number(base.priority ?? 0) + 100,
    workflow,
    bindings: baseBindings,
    referenceImages: [{
      role: 'canonical-identity',
      nodeId: loadId,
      input: 'image',
      strength: { nodeId: applyId, input: 'weight' },
    }],
    runtimePolicy: {
      loadBuiltinExtras: false,
      customNodeFolders: [customNodeFolder],
    },
    modelInventoryAdditions: [
      { id: options.ipAdapterModelId ?? 'ip-adapter-plus-sdxl-vit-h', kind: 'ipadapter', sha256: hash(options.ipAdapterSha256, 'ipAdapterSha256') },
      { id: options.clipVisionModelId ?? 'clip-vision-vit-h', kind: 'clip-vision', sha256: hash(options.clipVisionSha256, 'clipVisionSha256') },
    ],
    runtimeInventoryAdditions: [
      { id: options.customNodeRuntimeId ?? 'comfyui-ipadapter-plus', version: customNodeVersion, sha256: hash(options.customNodeSha256, 'customNodeSha256') },
    ],
    maximumReferenceImages: 1,
  };
  const compiled = compileReferenceProfileDraft(base, spec);
  return Object.freeze({
    ...compiled,
    nodeIds: Object.freeze({ loadId, prepId, modelLoaderId, clipLoaderId, applyId, samplerId }),
    pinnedAssets: Object.freeze({
      ipAdapterFile,
      clipVisionFile,
      ipAdapterSha256: options.ipAdapterSha256,
      clipVisionSha256: options.clipVisionSha256,
      customNodeVersion,
      customNodeSha256: options.customNodeSha256,
    }),
  });
}
