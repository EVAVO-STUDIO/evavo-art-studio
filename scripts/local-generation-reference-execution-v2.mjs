#!/usr/bin/env node

import {
  automaticAnchorReferences,
  buildReferenceGraph,
  resolveProviderReferences,
} from './local-generation-reference-graph-v2.mjs';

function fail(message) { throw new Error(message); }

export function prepareReferenceExecutionPlan(plan) {
  if (!plan || !Array.isArray(plan.frames)) fail('reference execution requires a compiled batch plan');
  const frames = automaticAnchorReferences(plan);
  const graph = buildReferenceGraph(frames);
  return Object.freeze({
    ...plan,
    frames,
    referenceGraph: graph,
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

export function recordAcceptedArtifactResults(stageFrames, frameResults, artifactResults) {
  if (!(frameResults instanceof Map) || !(artifactResults instanceof Map)) fail('reference result stores must be Maps');
  for (const frame of stageFrames) {
    const result = frameResults.get(frame.id);
    if (!result) fail(`accepted reference stage shot ${frame.id} has no frame result`);
    const artifactIds = (result.candidates ?? [])
      .filter((candidate) => candidate?.qa?.ok && typeof candidate.artifactId === 'string' && candidate.artifactId)
      .map((candidate) => candidate.artifactId);
    if (artifactIds.length < frame.candidateCount) {
      fail(`accepted reference stage shot ${frame.id} has ${artifactIds.length}/${frame.candidateCount} usable provider artifact IDs`);
    }
    artifactResults.set(frame.id, Object.freeze(artifactIds));
  }
  return artifactResults;
}
