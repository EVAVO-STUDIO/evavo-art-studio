#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  LOCAL_GENERATION_BATCH_SCHEMA,
  chunkFrames,
  compileBatchPlan,
  compileLegacyManifest,
  imageMetadata,
  validateLocalGenerationBatch,
} from './local-generation-batch-v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_RUNNER = path.join(ROOT, 'scripts', 'run-local-generation-campaign.mjs');

function fail(message) { throw new Error(message); }
function sha256Bytes(value) { return createHash('sha256').update(value).digest('hex'); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 80) || 'shot'; }
function parseArgs(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null || value.startsWith('--') || result.has(key)) fail('arguments must be unique --name value pairs');
    result.set(key, value);
  }
  for (const key of result.keys()) if (!['--manifest', '--output-root', '--actor'].includes(key)) fail(`unsupported argument ${key}`);
  return result;
}
function defaultOutputRoot() {
  const local = process.env.LOCALAPPDATA?.trim();
  return local ? path.join(local, 'EVAVO', 'ArtStudio', 'batches') : path.join(ROOT, '.art-studio', 'batches');
}
async function readJson(file, label) {
  let value;
  try { value = JSON.parse(await readFile(path.resolve(file), 'utf8')); } catch (error) { fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  return value;
}
async function writeJson(file, value, exclusive = false) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', ...(exclusive ? { flag: 'wx' } : {}) });
}
async function runCaptured(command, args, { cwd = ROOT, env = process.env, timeoutMs = 2_100_000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-16 * 1024 * 1024); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4 * 1024 * 1024); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); });
  });
}
function receiptFromStdout(stdout) {
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const value = JSON.parse(line);
      if (value?.schema === 'evavo.local-generation-campaign-receipt.v1') return value;
    } catch { /* ignore other output */ }
  }
  return null;
}
function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { format: 'jpeg', height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    if (offset + 4 > bytes.length) break;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}
function webpDimensions(bytes) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { format: 'webp', width, height };
  }
  return { format: 'webp', width: null, height: null };
}
function imageInfo(bytes) { return pngDimensions(bytes) ?? jpegDimensions(bytes) ?? webpDimensions(bytes); }

async function qaCandidate(file, expected, outputRules) {
  let fileStat;
  try { fileStat = await stat(file); } catch { return { ok: false, codes: ['missing-file'], bytes: 0, sha256: null, dimensions: null }; }
  if (!fileStat.isFile()) return { ok: false, codes: ['not-file'], bytes: fileStat.size, sha256: null, dimensions: null };
  const bytes = await readFile(file);
  const codes = [];
  if (outputRules.requireNonZeroBytes && bytes.length < 1) codes.push('zero-bytes');
  const info = imageInfo(bytes);
  if (!info) codes.push('invalid-image-signature');
  if (outputRules.requireDimensions && info && (info.width == null || info.height == null)) codes.push('dimensions-unavailable');
  if (outputRules.requireDimensions && info?.width != null && (info.width !== expected.width || info.height !== expected.height)) codes.push('dimension-mismatch');
  return { ok: codes.length === 0, codes, bytes: bytes.length, sha256: sha256Bytes(bytes), dimensions: info };
}

function framesNeedingRetry(plan, frameResults) {
  const retry = [];
  const seenHashes = new Map();
  for (const frame of plan.frames) {
    const result = frameResults.get(frame.id);
    const expectedCandidates = frame.candidateCount;
    const reasons = [];
    if (!result || result.candidates.length < expectedCandidates) reasons.push('missing-candidates');
    for (const candidate of result?.candidates ?? []) {
      if (!candidate.qa.ok) reasons.push(...candidate.qa.codes);
      if (plan.outputRules.requireUniqueHashes && candidate.qa.sha256) {
        const prior = seenHashes.get(candidate.qa.sha256);
        if (prior && prior !== frame.id) reasons.push('duplicate-hash');
        else seenHashes.set(candidate.qa.sha256, frame.id);
      }
    }
    const uniqueReasons = [...new Set(reasons)];
    const allowed = uniqueReasons.some((reason) =>
      (reason === 'missing-candidates' && plan.retryRules.retryMissing) ||
      (['missing-file', 'not-file', 'zero-bytes', 'invalid-image-signature', 'dimensions-unavailable'].includes(reason) && plan.retryRules.retryInvalidFile) ||
      (reason === 'dimension-mismatch' && plan.retryRules.retryDimensionMismatch) ||
      (reason === 'duplicate-hash' && plan.retryRules.retryDuplicate));
    if (uniqueReasons.length && allowed) retry.push({ frame, reasons: uniqueReasons });
  }
  return retry;
}

async function runLegacyAttempt({ plan, frames, attempt, actor, stagingRoot }) {
  const attemptRoot = path.join(stagingRoot, `attempt-${String(attempt).padStart(2, '0')}`);
  await mkdir(attemptRoot, { recursive: true });
  const manifests = [];
  const receipts = [];
  const chunks = chunkFrames(frames);
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    const manifest = compileLegacyManifest(plan, chunk, attempt);
    const chunkCampaignId = `${plan.campaignId}-a${attempt}-c${String(chunkIndex + 1).padStart(2, '0')}`;
    manifest.campaignId = chunkCampaignId;
    const manifestPath = path.join(attemptRoot, `chunk-${String(chunkIndex + 1).padStart(3, '0')}.json`);
    await writeJson(manifestPath, manifest);
    manifests.push(manifestPath);
    const childOutputRoot = path.join(attemptRoot, 'legacy-runs');
    const execution = await runCaptured(process.execPath, [LEGACY_RUNNER, '--manifest', manifestPath, '--output-root', childOutputRoot, '--actor', actor]);
    const receipt = receiptFromStdout(execution.stdout);
    if (!receipt) fail(`legacy chunk ${chunkIndex + 1} returned no campaign receipt; exit=${execution.code}; stderr=${execution.stderr.slice(-6000)}`);
    receipts.push(receipt);
  }
  return { attempt, manifests, receipts };
}

async function collectAttempt(plan, attemptResult, frameResults) {
  const routesByShot = new Map();
  const candidatesByShot = new Map();
  for (const receipt of attemptResult.receipts) {
    for (const route of receipt.provider?.routes ?? []) routesByShot.set(route.sceneId, route);
    for (const candidate of receipt.candidates ?? []) {
      const list = candidatesByShot.get(candidate.sceneId) ?? [];
      list.push({ ...candidate, sourceOutputs: receipt.paths?.outputs });
      candidatesByShot.set(candidate.sceneId, list);
    }
  }
  for (const frame of plan.frames) {
    if (!candidatesByShot.has(frame.id)) continue;
    const expected = {
      width: frame.shot.target?.width ?? plan.quality.width,
      height: frame.shot.target?.height ?? plan.quality.height,
    };
    const evaluated = [];
    for (const candidate of candidatesByShot.get(frame.id)) {
      const source = path.resolve(candidate.sourceOutputs, candidate.fileName);
      const qa = await qaCandidate(source, expected, plan.outputRules);
      evaluated.push({ ...candidate, source, qa, route: routesByShot.get(frame.id) ?? null });
    }
    frameResults.set(frame.id, { attempt: attemptResult.attempt, candidates: evaluated, route: routesByShot.get(frame.id) ?? null });
  }
}

async function materializeAccepted(plan, frameResults, finalRoot) {
  const outputsDir = path.join(finalRoot, 'outputs');
  const metadataDir = path.join(finalRoot, 'metadata');
  await mkdir(outputsDir, { recursive: true }); await mkdir(metadataDir, { recursive: true });
  const result = [];
  const globalHashes = new Set();
  for (const frame of plan.frames) {
    const frameResult = frameResults.get(frame.id);
    if (!frameResult) fail(`shot ${frame.id} has no accepted result`);
    let ordinal = 0;
    for (const candidate of frameResult.candidates) {
      ordinal += 1;
      if (!candidate.qa.ok) fail(`shot ${frame.id} candidate ${ordinal} failed QA: ${candidate.qa.codes.join(',')}`);
      if (plan.outputRules.requireUniqueHashes && globalHashes.has(candidate.qa.sha256)) fail(`duplicate accepted image hash ${candidate.qa.sha256}`);
      globalHashes.add(candidate.qa.sha256);
      const extension = path.extname(candidate.fileName).toLowerCase() || '.png';
      const fileName = `${String(frame.ordinal).padStart(4, '0')}-${slug(frame.id)}-candidate-${String(ordinal).padStart(2, '0')}${extension}`;
      const target = path.join(outputsDir, fileName);
      await copyFile(candidate.source, target, fsConstants.COPYFILE_EXCL);
      const metadata = imageMetadata(plan, frame, {
        attempt: frameResult.attempt,
        route: frameResult.route,
        candidate: { artifactId: candidate.artifactId, contentHash: candidate.contentHash, sourceFileName: candidate.fileName, outputFileName: fileName },
        qa: candidate.qa,
      });
      const metadataPath = path.join(metadataDir, `${fileName}.json`);
      if (plan.outputRules.writeImageMetadata) await writeJson(metadataPath, metadata, true);
      result.push({ shotId: frame.id, fileName, path: target, metadataPath: plan.outputRules.writeImageMetadata ? metadataPath : null, sha256: candidate.qa.sha256, bytes: candidate.qa.bytes, dimensions: candidate.qa.dimensions, attempt: frameResult.attempt });
    }
  }
  return result;
}

export async function runLocalGenerationBatch(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifestPath = path.resolve(args.get('--manifest') ?? path.join(ROOT, 'examples', 'local-generation-batch.template.json'));
  const sourceManifest = await readJson(manifestPath, 'batch manifest');
  if (sourceManifest.schema !== LOCAL_GENERATION_BATCH_SCHEMA) fail(`batch manifest must use ${LOCAL_GENERATION_BATCH_SCHEMA}`);
  const validated = validateLocalGenerationBatch(sourceManifest);
  const plan = compileBatchPlan(sourceManifest);
  const actor = args.get('--actor') ?? process.env.EVAVO_ART_ACTOR ?? 'local-generation-batch-v2';
  const startedAt = new Date().toISOString();
  const runId = `${startedAt.replace(/[:.]/gu, '-')}-${sha256Bytes(Buffer.from(JSON.stringify(sourceManifest))).slice(0, 12)}`;
  const finalRoot = path.resolve(args.get('--output-root') ?? defaultOutputRoot(), plan.campaignId, runId);
  const stagingRoot = path.join(finalRoot, 'staging');
  await mkdir(stagingRoot, { recursive: true });
  await writeJson(path.join(finalRoot, 'manifest.input.json'), sourceManifest, true);
  await writeJson(path.join(finalRoot, 'plan.json'), {
    schema: 'evavo.local-generation-batch-plan.v2', campaignId: plan.campaignId, batchSize: plan.batchSize,
    generationMode: plan.mode, consistencyMode: plan.consistencyMode, qualityProfile: plan.qualityProfile,
    frames: plan.frames.map((frame) => ({ ordinal: frame.ordinal, id: frame.id, prompt: frame.prompt, seed: frame.seed, candidateCount: frame.candidateCount, continuityPhase: frame.continuityPhase, quality: frame.quality, references: frame.references })),
  }, true);

  const frameResults = new Map();
  const attempts = [];
  let pending = [...plan.frames];
  for (let attempt = 1; attempt <= plan.retryRules.maxShotAttempts && pending.length; attempt += 1) {
    const attemptResult = await runLegacyAttempt({ plan, frames: pending, attempt, actor, stagingRoot });
    attempts.push(attemptResult);
    await collectAttempt(plan, attemptResult, frameResults);
    const retry = framesNeedingRetry(plan, frameResults);
    const retryIds = new Set(retry.map((item) => item.frame.id));
    pending = plan.frames.filter((frame) => retryIds.has(frame.id));
    await writeJson(path.join(finalRoot, `qa-attempt-${String(attempt).padStart(2, '0')}.json`), {
      schema: 'evavo.local-generation-batch-qa-attempt.v2', attempt,
      retry: retry.map((item) => ({ shotId: item.frame.id, reasons: item.reasons })),
      completedShotIds: plan.frames.filter((frame) => frameResults.has(frame.id) && !retryIds.has(frame.id)).map((frame) => frame.id),
    });
  }

  const remaining = framesNeedingRetry(plan, frameResults);
  const missing = plan.frames.filter((frame) => !frameResults.has(frame.id)).map((frame) => frame.id);
  let outputs = [];
  let status = 'succeeded';
  let failure = null;
  if (remaining.length || missing.length) {
    status = 'failed';
    failure = { remaining: remaining.map((item) => ({ shotId: item.frame.id, reasons: item.reasons })), missing };
  } else {
    outputs = await materializeAccepted(plan, frameResults, finalRoot);
    const expectedImages = plan.frames.reduce((sum, frame) => sum + frame.candidateCount, 0);
    if (plan.outputRules.exactCount && outputs.length !== expectedImages) {
      status = 'failed'; failure = { expectedImages, actualImages: outputs.length, reason: 'exact-output-count-mismatch' };
    }
  }

  const receipt = {
    schema: 'evavo.local-generation-batch-receipt.v2', status, campaignId: plan.campaignId, runId,
    startedAt, completedAt: new Date().toISOString(), batchSize: plan.batchSize,
    expectedImages: plan.frames.reduce((sum, frame) => sum + frame.candidateCount, 0), actualImages: outputs.length,
    generationMode: plan.mode, consistencyMode: plan.consistencyMode, qualityProfile: plan.qualityProfile,
    retryRules: plan.retryRules, outputRules: plan.outputRules,
    attempts: attempts.map((attempt) => ({ attempt: attempt.attempt, chunks: attempt.receipts.length, childCampaignIds: attempt.receipts.map((receipt) => receipt.campaignId), childRunIds: attempt.receipts.map((receipt) => receipt.runId) })),
    outputs,
    failure,
    localOnly: true,
    hostedFallback: false,
    authority: { candidateApproval: false, candidatePromotion: false, publication: false, targetRepositoryMutation: false },
    paths: { runRoot: finalRoot, outputs: path.join(finalRoot, 'outputs'), metadata: path.join(finalRoot, 'metadata'), staging: stagingRoot },
  };
  await writeJson(path.join(finalRoot, 'receipt.json'), receipt, true);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (status !== 'succeeded') process.exitCode = 2;
  return receipt;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (invoked) runLocalGenerationBatch().catch((error) => {
  process.stderr.write(`${JSON.stringify({ schema: 'evavo.local-generation-batch-receipt.v2', status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 2;
});
