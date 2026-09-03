#!/usr/bin/env node

import {
  automaticAnchorReferences,
  buildReferenceGraph,
  normalizeReferenceInputs,
  resolveProviderReferences,
} from './local-generation-reference-graph-v2.mjs';

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;

function fail(message) { throw new Error(message); }

function hydrateAuthoredReferenceInputs(plan) {
  const sourceShots = Array.isArray(plan?.source?.shots) ? plan.source.shots : [];
  const sourceById = new Map(sourceShots.map((shot, index) => [shot?.id ?? `shot-${String(index + 1).padStart(3, '0')}`, shot]));
  return Object.freeze(plan.frames.map((frame) => {
    const source = sourceById.get(frame.id) ?? {};
    const referenceInputs = normalizeReferenceInputs(
      source.reference_inputs ?? source.referenceInputs ?? frame.shot?.referenceInputs,
      `shot ${frame.id} reference_inputs`,
    );
    return Object.freeze({
      ...frame,
      shot: Object.freeze({ ...frame.shot, referenceInputs }),
    });
  }));
}

export function referenceAdapterId(baseAdapterId, references) {
  if (!references?.length) return baseAdapterId ?? null;
  if (references.length !== 1) {
    fail('automatic quality-matched reference routing currently supports exactly one resolved reference per scene');
  }
  if (typeof baseAdapterId !== 'string' || !baseAdapterId.startsWith('comfyui:')) {
    fail('automatic reference routing requires a comfyui: base adapter ID');
  }
  if (baseAdapterId.includes('-reference-')) return baseAdapterId;
  const role = references[0]?.role;
  if (typeof role !== 'string' || !role) fail('resolved reference is missing its role');
  return `${baseAdapterId}-reference-${role}`;
}

export function prepareReferenceExecutionPlan(plan) {
  if (!plan || !Array.isArray(plan.frames)) fail('reference execution requires a compiled batch plan');
  const hydrated = hydrateAuthoredReferenceInputs(plan);
  const frames = automaticAnchorReferences({ ...plan, frames: hydrated });
  const graph = buildReferenceGraph(frames);
  const referenceInputCount = frames.reduce((sum, frame) => sum + (frame.shot?.referenceInputs?.length ?? 0), 0);
  return Object.freeze({
    ...plan,
    frames,
    referenceGraph: graph,
    referenceInputCount,
  });
}

export function framesForReferenceStage(executionPlan, stageIds, artifactResults) {
  if (!Array.isArray(stageIds) || !stageIds.length) fail('reference stage must contain at least one shot ID');
  if (!(artifactResults instanceof Map)) fail('artifactResults must be a Map');
  const byId = new Map(executionPlan.frames.map((frame) => [frame.id, frame]));
  return Object.freeze(stageIds.map((shotId) => {
    const frame = byId.get(shotId);
    if (!frame) fail(`reference stage contains unknown shot ${shotId}`);
    const providerReferences = resolveProviderReferences(frame, artifactResults);
    return Object.freeze({ ...frame, providerReferences });
  }));
}

export function attachProviderReferencesToLegacyManifest(manifest, stageFrames) {
  if (!manifest || !Array.isArray(manifest.scenes)) fail('legacy manifest must contain scenes');
  const framesByShotId = new Map(stageFrames.map((frame) => [frame.id, frame]));
  const baseAdapterId = manifest.provider?.adapterId ?? null;
  return {
    ...manifest,
    scenes: manifest.scenes.map((scene) => {
      const frame = framesByShotId.get(scene.id);
      const references = frame?.providerReferences ?? [];
      if (!references.length) return scene;
      const adapterId = referenceAdapterId(scene.adapterId ?? baseAdapterId, references);
      return { ...scene, adapterId, references };
    }),
  };
}

export function recordAcceptedArtifactResults(stageFrames, frameResults, artifactResults) {
  if (!(frameResults instanceof Map) || !(artifactResults instanceof Map)) fail('reference result stores must be Maps');
  for (const frame of stageFrames) {
    const result = frameResults.get(frame.id);
    if (!result) fail(`accepted reference stage shot ${frame.id} has no frame result`);
    const artifactIds = (result.candidates ?? []).map((candidate, index) => {
      if (!candidate?.qa?.ok) fail(`accepted reference stage shot ${frame.id} candidate ${index} did not pass QA`);
      if (typeof candidate.artifactId !== 'string' || !ARTIFACT_ID.test(candidate.artifactId)) {
        fail(`accepted reference stage shot ${frame.id} candidate ${index} has no valid provider artifact ID`);
      }
      return candidate.artifactId;
    });
    if (artifactIds.length < frame.candidateCount) {
      fail(`accepted reference stage shot ${frame.id} has ${artifactIds.length}/${frame.candidateCount} usable provider artifact IDs`);
    }
    artifactResults.set(frame.id, Object.freeze(artifactIds));
  }
  return artifactResults;
}
