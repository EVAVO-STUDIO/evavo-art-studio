#!/usr/bin/env node

export const REFERENCE_ROLES = Object.freeze([
  'canonical-identity', 'direction-master', 'previous-key-pose', 'next-key-pose',
  'base-image', 'mask', 'pose-control', 'edge-control', 'depth-control',
  'palette-reference', 'line-reference', 'material-reference', 'layer-context',
]);
export const REFERENCE_CAPABILITY_REQUIREMENTS = Object.freeze({
  'canonical-identity': 'identity-reference',
  'direction-master': 'direction-reference',
  'previous-key-pose': 'temporal-reference',
  'next-key-pose': 'temporal-reference',
  'base-image': null,
  mask: null,
  'pose-control': 'pose-control',
  'edge-control': 'edge-control',
  'depth-control': 'depth-control',
  'palette-reference': 'palette-reference',
  'line-reference': 'line-reference',
  'material-reference': 'material-reference',
  'layer-context': 'layer-context-reference',
});
const ROLES = new Set(REFERENCE_ROLES);
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function role(value, label) {
  if (typeof value !== 'string' || !ROLES.has(value)) fail(`${label} is unsupported`);
  return value;
}
function strength(value, label) {
  if (value == null) return 1;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2) fail(`${label} must be between 0 and 2`);
  return value;
}
function externalReference(raw, label) {
  const ref = object(raw, label);
  if (typeof ref.artifactId !== 'string' || !ARTIFACT_ID.test(ref.artifactId)) fail(`${label}.artifactId must use artifact_<sha256> format`);
  return Object.freeze({
    kind: 'artifact', artifactId: ref.artifactId, role: role(ref.role, `${label}.role`),
    strength: strength(ref.strength, `${label}.strength`), required: ref.required !== false,
    ...(typeof ref.note === 'string' && ref.note.trim() ? { note: ref.note.trim() } : {}),
  });
}
function shotReference(raw, label) {
  const ref = object(raw, label);
  if (typeof ref.sourceShotId !== 'string' || !ref.sourceShotId.trim()) fail(`${label}.sourceShotId is required`);
  const candidateIndex = ref.candidateIndex == null ? 0 : ref.candidateIndex;
  if (!Number.isInteger(candidateIndex) || candidateIndex < 0 || candidateIndex > 15) fail(`${label}.candidateIndex must be 0 to 15`);
  return Object.freeze({
    kind: 'shot', sourceShotId: ref.sourceShotId.trim(), candidateIndex,
    role: role(ref.role, `${label}.role`), strength: strength(ref.strength, `${label}.strength`),
    required: ref.required !== false,
    ...(typeof ref.note === 'string' && ref.note.trim() ? { note: ref.note.trim() } : {}),
  });
}

export function normalizeReferenceInputs(value, label = 'reference_inputs') {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 16) fail(`${label} must contain at most 16 entries`);
  const result = value.map((raw, index) => {
    const item = object(raw, `${label}[${index}]`);
    if ('artifactId' in item) return externalReference(item, `${label}[${index}]`);
    if ('sourceShotId' in item) return shotReference(item, `${label}[${index}]`);
    fail(`${label}[${index}] must contain artifactId or sourceShotId`);
  });
  const keys = new Set();
  for (const item of result) {
    const key = item.kind === 'artifact' ? `${item.role}:artifact:${item.artifactId}` : `${item.role}:shot:${item.sourceShotId}:${item.candidateIndex}`;
    if (keys.has(key)) fail(`${label} contains duplicate reference ${key}`);
    keys.add(key);
  }
  return Object.freeze(result);
}

export function requiredReferenceCapabilities(referenceInputs) {
  const references = normalizeReferenceInputs(referenceInputs);
  const required = new Set();
  if (references.length) required.add('reference-images');
  if (references.length > 1) required.add('multiple-reference-images');
  for (const reference of references) {
    if (!reference.required) continue;
    const capability = REFERENCE_CAPABILITY_REQUIREMENTS[reference.role];
    if (capability) required.add(capability);
  }
  if (references.some((reference) => reference.role === 'mask')) required.add('mask');
  return Object.freeze([...required].sort());
}

export function validateProviderReferenceInputs(referenceInputs, profile, options = {}) {
  const label = options.label ?? 'reference_inputs';
  const references = normalizeReferenceInputs(referenceInputs, label);
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) fail(`${label} requires a reviewed provider profile`);
  const maximumReferenceImages = profile.limits?.maximumReferenceImages;
  if (references.length && (!Number.isInteger(maximumReferenceImages) || maximumReferenceImages < references.length)) {
    fail(`${label} requests ${references.length} reference image(s), but reviewed profile ${profile.profileId ?? 'unknown'} allows ${String(maximumReferenceImages ?? 0)}`);
  }
  if (options.operation === 'generate' && references.some((reference) => reference.role === 'mask')) {
    fail(`${label} may not contain mask because local generation V1 only supports generate operations`);
  }
  const required = requiredReferenceCapabilities(references);
  const capabilities = new Set(Array.isArray(profile.capabilities) ? profile.capabilities : []);
  const missing = required.filter((capability) => !capabilities.has(capability));
  if (missing.length) fail(`${label} requires provider capabilities not advertised by ${profile.profileId ?? 'unknown'}: ${missing.join(', ')}`);

  const lockedSprite = ['sprite-frame', 'sprite-layer'].includes(options.assetKind) && !['independent', 'identity-master', 'direction-master'].includes(options.continuityPhase);
  if (lockedSprite && !references.some((reference) => reference.role === 'canonical-identity' && reference.required)) {
    fail(`${label} continuity-locked sprite work requires canonical-identity as a required reference`);
  }
  if (options.continuityPhase === 'in-between') {
    const previous = references.some((reference) => reference.role === 'previous-key-pose' && reference.required);
    const next = references.some((reference) => reference.role === 'next-key-pose' && reference.required);
    if (!previous || !next) fail(`${label} in-between work requires previous-key-pose and next-key-pose as required references`);
  }
  return Object.freeze({ references, requiredCapabilities: required });
}

export function buildReferenceGraph(frames) {
  const frameById = new Map(frames.map((frame) => [frame.id, frame]));
  if (frameById.size !== frames.length) fail('reference graph requires unique frame IDs');
  const dependencies = new Map();
  for (const frame of frames) {
    const refs = normalizeReferenceInputs(frame.shot?.referenceInputs ?? frame.referenceInputs, `shot ${frame.id} reference_inputs`);
    const deps = new Set();
    for (const ref of refs) {
      if (ref.kind !== 'shot') continue;
      if (!frameById.has(ref.sourceShotId)) fail(`shot ${frame.id} references missing source shot ${ref.sourceShotId}`);
      if (ref.sourceShotId === frame.id) fail(`shot ${frame.id} may not reference itself`);
      deps.add(ref.sourceShotId);
    }
    dependencies.set(frame.id, Object.freeze([...deps]));
  }
  const indegree = new Map(frames.map((frame) => [frame.id, dependencies.get(frame.id).length]));
  const dependents = new Map(frames.map((frame) => [frame.id, []]));
  for (const [id, deps] of dependencies) for (const dep of deps) dependents.get(dep).push(id);
  let ready = frames.filter((frame) => indegree.get(frame.id) === 0).map((frame) => frame.id);
  const stages = [];
  let visited = 0;
  while (ready.length) {
    const stage = [...ready];
    stages.push(Object.freeze(stage));
    ready = [];
    for (const source of stage) {
      visited += 1;
      for (const target of dependents.get(source)) {
        const next = indegree.get(target) - 1;
        indegree.set(target, next);
        if (next === 0) ready.push(target);
      }
    }
  }
  if (visited !== frames.length) {
    const cyclic = frames.filter((frame) => indegree.get(frame.id) > 0).map((frame) => frame.id);
    fail(`reference graph contains a cycle involving: ${cyclic.join(', ')}`);
  }
  return Object.freeze({ dependencies, stages: Object.freeze(stages), hasDependencies: stages.length > 1 || [...dependencies.values()].some((deps) => deps.length > 0) });
}

export function resolveProviderReferences(frame, artifactResults) {
  const refs = normalizeReferenceInputs(frame.shot?.referenceInputs ?? frame.referenceInputs, `shot ${frame.id} reference_inputs`);
  return Object.freeze(refs.map((ref) => {
    if (ref.kind === 'artifact') {
      return Object.freeze({ artifactId: ref.artifactId, role: ref.role, strength: ref.strength, required: ref.required, ...(ref.note ? { note: ref.note } : {}) });
    }
    const candidates = artifactResults.get(ref.sourceShotId) ?? [];
    const artifactId = candidates[ref.candidateIndex];
    if (!artifactId) {
      if (ref.required) fail(`required reference ${ref.sourceShotId}[${ref.candidateIndex}] for shot ${frame.id} is unavailable`);
      return null;
    }
    return Object.freeze({ artifactId, role: ref.role, strength: ref.strength, required: ref.required, ...(ref.note ? { note: ref.note } : {}) });
  }).filter(Boolean));
}

export function automaticAnchorReferences(plan) {
  if (!['sequential-anchor', 'sprite'].includes(plan.mode) || plan.frames.length < 2) return plan.frames;
  const anchor = plan.frames[0];
  return Object.freeze(plan.frames.map((frame, index) => {
    if (index === 0 || frame.shot?.referenceInputs?.length) return frame;
    const referenceInputs = plan.mode === 'sprite'
      ? Object.freeze([
          Object.freeze({ kind: 'shot', sourceShotId: anchor.id, candidateIndex: 0, role: 'canonical-identity', strength: 1, required: true, note: 'automatic v2 sprite identity anchor dependency' }),
          Object.freeze({ kind: 'shot', sourceShotId: anchor.id, candidateIndex: 0, role: 'direction-master', strength: 1, required: true, note: 'automatic v2 sprite direction anchor dependency' }),
        ])
      : Object.freeze([
          Object.freeze({ kind: 'shot', sourceShotId: anchor.id, candidateIndex: 0, role: 'canonical-identity', strength: 1, required: true, note: 'automatic v2 anchor dependency' }),
        ]);
    return Object.freeze({
      ...frame,
      shot: Object.freeze({ ...frame.shot, referenceInputs }),
    });
  }));
}
