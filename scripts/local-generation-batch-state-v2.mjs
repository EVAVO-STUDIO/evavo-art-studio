#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const LOCAL_GENERATION_BATCH_STATE_SCHEMA = 'evavo.local-generation-batch-state.v2';
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function manifestFingerprint(manifest) {
  return sha256(Buffer.from(stableJson(manifest), 'utf8'));
}

export function planFingerprint(plan) {
  const durable = {
    campaignId: plan.campaignId,
    batchSize: plan.batchSize,
    mode: plan.mode,
    consistencyMode: plan.consistencyMode,
    qualityProfile: plan.qualityProfile,
    retryRules: plan.retryRules,
    outputRules: plan.outputRules,
    frames: plan.frames.map((frame) => ({
      id: frame.id,
      ordinal: frame.ordinal,
      seed: frame.seed,
      candidateCount: frame.candidateCount,
      promptSha256: frame.promptSha256,
      negativePromptSha256: frame.negativePromptSha256,
      continuityPhase: frame.continuityPhase,
      referenceInputs: frame.shot?.referenceInputs ?? [],
    })),
  };
  return sha256(Buffer.from(stableJson(durable), 'utf8'));
}

export function deterministicRunKey(manifest, plan) {
  return `${manifestFingerprint(manifest).slice(0, 16)}-${planFingerprint(plan).slice(0, 16)}`;
}

function validateCandidate(candidate, label) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) fail(`${label} must be an object`);
  if (typeof candidate.source !== 'string' || !candidate.source) fail(`${label}.source is required`);
  if (candidate.artifactId != null && !ARTIFACT_ID.test(candidate.artifactId)) fail(`${label}.artifactId is invalid`);
  if (!candidate.qa || typeof candidate.qa !== 'object') fail(`${label}.qa is required`);
  if (candidate.qa.sha256 != null && !SHA256.test(candidate.qa.sha256)) fail(`${label}.qa.sha256 is invalid`);
  return clone(candidate);
}

export function createBatchState({ manifest, plan, referencePlan, runId, startedAt }) {
  const manifestSha256 = manifestFingerprint(manifest);
  const planSha256 = planFingerprint(plan);
  return {
    schema: LOCAL_GENERATION_BATCH_STATE_SCHEMA,
    version: 1,
    campaignId: plan.campaignId,
    runId,
    startedAt,
    updatedAt: startedAt,
    manifestSha256,
    planSha256,
    referenceStages: clone(referencePlan.referenceGraph.stages),
    completedStageCount: 0,
    nextStageIndex: 0,
    attempts: [],
    frameResults: {},
    artifactResults: {},
    status: 'running',
    failure: null,
  };
}

export function validateBatchState(state, { manifest, plan, referencePlan } = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('batch state must be an object');
  if (state.schema !== LOCAL_GENERATION_BATCH_STATE_SCHEMA) fail(`batch state must use ${LOCAL_GENERATION_BATCH_STATE_SCHEMA}`);
  if (!Number.isInteger(state.version) || state.version !== 1) fail('unsupported batch state version');
  if (typeof state.campaignId !== 'string' || !state.campaignId) fail('batch state campaignId is required');
  if (typeof state.runId !== 'string' || !state.runId) fail('batch state runId is required');
  if (!SHA256.test(state.manifestSha256 ?? '')) fail('batch state manifestSha256 is invalid');
  if (!SHA256.test(state.planSha256 ?? '')) fail('batch state planSha256 is invalid');
  if (!Array.isArray(state.referenceStages)) fail('batch state referenceStages must be an array');
  if (!Number.isInteger(state.completedStageCount) || state.completedStageCount < 0 || state.completedStageCount > state.referenceStages.length) fail('batch state completedStageCount is invalid');
  if (!Number.isInteger(state.nextStageIndex) || state.nextStageIndex !== state.completedStageCount) fail('batch state nextStageIndex must equal completedStageCount');
  if (!Array.isArray(state.attempts)) fail('batch state attempts must be an array');
  if (!state.frameResults || typeof state.frameResults !== 'object' || Array.isArray(state.frameResults)) fail('batch state frameResults must be an object');
  if (!state.artifactResults || typeof state.artifactResults !== 'object' || Array.isArray(state.artifactResults)) fail('batch state artifactResults must be an object');
  for (const [shotId, result] of Object.entries(state.frameResults)) {
    if (!result || typeof result !== 'object' || !Array.isArray(result.candidates)) fail(`batch state frameResults.${shotId} is invalid`);
    result.candidates.forEach((candidate, index) => validateCandidate(candidate, `batch state frameResults.${shotId}.candidates[${index}]`));
  }
  for (const [shotId, artifactIds] of Object.entries(state.artifactResults)) {
    if (!Array.isArray(artifactIds) || artifactIds.some((value) => !ARTIFACT_ID.test(value))) fail(`batch state artifactResults.${shotId} is invalid`);
  }
  if (manifest && state.manifestSha256 !== manifestFingerprint(manifest)) fail('batch state manifest fingerprint differs from requested manifest');
  if (plan && state.planSha256 !== planFingerprint(plan)) fail('batch state plan fingerprint differs from compiled plan');
  if (referencePlan && stableJson(state.referenceStages) !== stableJson(referencePlan.referenceGraph.stages)) fail('batch state reference stage graph differs from compiled plan');
  return state;
}

export function hydrateBatchState(state) {
  validateBatchState(state);
  return {
    frameResults: new Map(Object.entries(state.frameResults).map(([shotId, result]) => [shotId, clone(result)])),
    artifactResults: new Map(Object.entries(state.artifactResults).map(([shotId, artifactIds]) => [shotId, [...artifactIds]])),
    attempts: state.attempts.map((value) => clone(value)),
  };
}

export function checkpointBatchState(state, { frameResults, artifactResults, attempts, completedStageCount, status = 'running', failure = null }) {
  const next = clone(state);
  next.updatedAt = new Date().toISOString();
  next.completedStageCount = completedStageCount;
  next.nextStageIndex = completedStageCount;
  next.status = status;
  next.failure = failure == null ? null : clone(failure);
  next.attempts = attempts.map((value) => clone(value));
  next.frameResults = Object.fromEntries([...frameResults.entries()].map(([shotId, result]) => [shotId, clone(result)]));
  next.artifactResults = Object.fromEntries([...artifactResults.entries()].map(([shotId, ids]) => [shotId, [...ids]]));
  validateBatchState(next);
  return next;
}

export async function readBatchState(file, expectations = {}) {
  let raw;
  try { raw = await readFile(path.resolve(file), 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  let state;
  try { state = JSON.parse(raw); } catch (error) { fail(`batch state is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  return validateBatchState(state, expectations);
}

export async function writeBatchStateAtomic(file, state) {
  validateBatchState(state);
  const target = path.resolve(file);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const bytes = `${JSON.stringify(state, null, 2)}\n`;
  await writeFile(temp, bytes, { encoding: 'utf8', flag: 'wx' });
  await rename(temp, target);
  const written = await stat(target);
  if (!written.isFile() || written.size !== Buffer.byteLength(bytes, 'utf8')) fail('batch state atomic write verification failed');
  return target;
}
