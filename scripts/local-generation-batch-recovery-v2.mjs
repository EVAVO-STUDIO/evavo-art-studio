#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  createBatchState,
  deterministicRunKey,
  hydrateBatchState,
  invalidateRecoveredExecutionFromStage,
  readBatchState,
} from './local-generation-batch-state-v2.mjs';

function fail(message) { throw new Error(message); }
function sha256Bytes(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export function recoveryStatePath(outputRoot, campaignId, manifest, plan) {
  if (typeof outputRoot !== 'string' || !outputRoot) fail('recovery outputRoot is required');
  if (typeof campaignId !== 'string' || !campaignId) fail('recovery campaignId is required');
  return path.join(path.resolve(outputRoot), campaignId, '.resume', deterministicRunKey(manifest, plan), 'state.json');
}

async function verifyRecoveredCandidate(candidate, label) {
  if (!candidate?.qa?.ok) return `${label} was not QA-accepted`;
  if (typeof candidate.source !== 'string' || !candidate.source) return `${label} has no source path`;
  let fileStat;
  try { fileStat = await stat(path.resolve(candidate.source)); }
  catch { return `${label} source file is missing`; }
  if (!fileStat.isFile()) return `${label} source is not a regular file`;
  let bytes;
  try { bytes = await readFile(path.resolve(candidate.source)); }
  catch { return `${label} source file cannot be read`; }
  if (typeof candidate.qa.sha256 !== 'string' || sha256Bytes(bytes) !== candidate.qa.sha256) {
    return `${label} source SHA-256 differs from its accepted QA record`;
  }
  return null;
}

export async function firstInvalidRecoveredStage(referencePlan, frameResults, completedStageCount) {
  if (!referencePlan?.referenceGraph || !Array.isArray(referencePlan.referenceGraph.stages)) fail('referencePlan must contain referenceGraph.stages');
  if (!(frameResults instanceof Map)) fail('frameResults must be a Map');
  if (!Number.isInteger(completedStageCount) || completedStageCount < 0 || completedStageCount > referencePlan.referenceGraph.stages.length) {
    fail('completedStageCount is outside the reference stage graph');
  }
  const byId = new Map(referencePlan.frames.map((frame) => [frame.id, frame]));
  for (let stageIndex = 0; stageIndex < completedStageCount; stageIndex += 1) {
    for (const shotId of referencePlan.referenceGraph.stages[stageIndex]) {
      const frame = byId.get(shotId);
      const result = frameResults.get(shotId);
      if (!frame || !result || !Array.isArray(result.candidates) || result.candidates.length < frame.candidateCount) {
        return Object.freeze({ stageIndex, shotId, reason: `recovered shot ${shotId} is missing accepted candidates` });
      }
      for (let candidateIndex = 0; candidateIndex < frame.candidateCount; candidateIndex += 1) {
        const reason = await verifyRecoveredCandidate(result.candidates[candidateIndex], `recovered shot ${shotId} candidate ${candidateIndex}`);
        if (reason) return Object.freeze({ stageIndex, shotId, reason });
      }
    }
  }
  return null;
}

export async function recoverBatchExecution({ statePath, manifest, plan, referencePlan, runId, startedAt }) {
  const existing = await readBatchState(statePath, { manifest, plan, referencePlan });
  if (!existing) {
    const state = createBatchState({ manifest, plan, referencePlan, runId, startedAt });
    return Object.freeze({
      state,
      frameResults: new Map(),
      artifactResults: new Map(),
      attempts: [],
      nextStageIndex: 0,
      recovered: false,
      invalidated: null,
    });
  }

  const hydrated = hydrateBatchState(existing);
  let nextStageIndex = existing.completedStageCount;
  let invalidated = null;
  const invalid = await firstInvalidRecoveredStage(referencePlan, hydrated.frameResults, existing.completedStageCount);
  if (invalid) {
    invalidated = invalidateRecoveredExecutionFromStage(
      referencePlan,
      hydrated.frameResults,
      hydrated.artifactResults,
      hydrated.attempts,
      invalid.stageIndex,
    );
    nextStageIndex = invalid.stageIndex;
  }
  return Object.freeze({
    state: existing,
    frameResults: hydrated.frameResults,
    artifactResults: hydrated.artifactResults,
    attempts: hydrated.attempts,
    nextStageIndex,
    recovered: true,
    invalidated: invalid ? Object.freeze({ ...invalid, ...invalidated }) : null,
  });
}
