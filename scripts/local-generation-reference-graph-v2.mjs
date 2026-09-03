#!/usr/bin/env node

export const REFERENCE_ROLES = Object.freeze([
  'canonical-identity', 'direction-master', 'previous-key-pose', 'next-key-pose',
  'base-image', 'mask', 'pose-control', 'edge-control', 'depth-control',
  'palette-reference', 'line-reference', 'material-reference', 'layer-context',
]);
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
  const roleName = plan.mode === 'sprite' ? 'direction-master' : 'canonical-identity';
  return Object.freeze(plan.frames.map((frame, index) => {
    if (index === 0 || frame.shot?.referenceInputs?.length) return frame;
    return Object.freeze({
      ...frame,
      shot: Object.freeze({
        ...frame.shot,
        referenceInputs: Object.freeze([{ kind: 'shot', sourceShotId: anchor.id, candidateIndex: 0, role: roleName, strength: 1, required: true, note: 'automatic v2 anchor dependency' }]),
      }),
    });
  }));
}
