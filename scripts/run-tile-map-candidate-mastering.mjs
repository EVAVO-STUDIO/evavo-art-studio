#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import { decodeSpriteFrame } from '../packages/quality/dist/index.js';
import {
  LocalRuntimeRepository,
  RuntimeWorker,
} from '../packages/runtime/dist/index.js';
import {
  candidateMasteringWorkerCapabilities,
  createCandidateMasteringHandlers,
} from '../apps/worker/dist/mastering-handlers.js';

export const TILE_MAP_MASTERING_CAPABILITY =
  'tile-map.mastering-authorized';
export const TILE_MAP_MASTERING_RECEIPT_SCHEMA =
  'evavo.tile-map-candidate-mastering-receipt.v1';

const ALLOWED_CHROMA_MATTES = new Set(['#ff00ff', '#00ff00', '#00ffff']);
const MAXIMUM_ASPECT_RATIO_DRIFT = 0.02;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
};
const hashObject = (value) => sha256(Buffer.from(canonical(value), 'utf8'));
const withoutSeal = (value, hashName) => {
  const { [hashName]: _hash, runId: _runId, ...body } = value;
  return body;
};
const readJson = async (file, label) => {
  const resolved = path.resolve(file);
  const bytes = await readFile(resolved);
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return { path: resolved, bytes, value };
};
const parseArguments = (argv) => {
  const supported = new Set([
    '--provider-batch',
    '--execution-receipt',
    '--receipt',
    '--worker-id',
    '--concurrency',
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !name?.startsWith('--') ||
      !value ||
      value.startsWith('--') ||
      values.has(name) ||
      !supported.has(name)
    ) {
      throw new Error('arguments must be unique supported --name value pairs');
    }
    values.set(name, value);
  }
  return values;
};
const required = (values, name) => {
  const value = values.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
};
const safeHash = (value, label) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be SHA-256`);
  }
  return value;
};
const safeId = (value, label) => {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
  ) {
    throw new Error(`${label} must use 1 to 128 safe id characters`);
  }
  return value;
};
const integer = (value, fallback, minimum, maximum, label) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
};

function verifyProviderBatch(batch) {
  if (
    batch.schema_version !== 1 ||
    batch.status !== 'ready-for-provider-runtime'
  ) {
    throw new Error(
      'provider batch must be schema v1 and ready-for-provider-runtime',
    );
  }
  const fingerprint = safeHash(
    batch.provider_batch_fingerprint,
    'provider_batch_fingerprint',
  );
  if (hashObject(withoutSeal(batch, 'provider_batch_fingerprint')) !== fingerprint) {
    throw new Error('provider batch self fingerprint mismatch');
  }
  if (
    !Array.isArray(batch.jobs) ||
    batch.jobs.length < 1 ||
    batch.jobs.length > 100
  ) {
    throw new Error('provider batch jobs must contain 1 to 100 entries');
  }
  return fingerprint;
}

function verifyExecutionReceipt(receipt) {
  if (
    receipt.schema !== 'evavo.tile-map-provider-execution-receipt.v1' ||
    receipt.status !== 'succeeded'
  ) {
    throw new Error(
      'execution receipt must be a successful Tile Map provider receipt',
    );
  }
  const digest = hashObject(withoutSeal(receipt, 'executionSha256'));
  if (
    receipt.executionSha256 !== digest ||
    receipt.runId !== digest.slice(0, 20)
  ) {
    throw new Error('provider execution receipt self hash mismatch');
  }
  return digest;
}

function verifyAuthorization(authorization) {
  if (
    authorization.schema !==
      'evavo.tile-map-provider-execution-authorization.v1' ||
    authorization.status !== 'authorized'
  ) {
    throw new Error('provider authorization schema/status is invalid');
  }
  const digest = hashObject(
    withoutSeal(authorization, 'authorizationSha256'),
  );
  if (
    authorization.authorizationSha256 !== digest ||
    authorization.runId !== digest.slice(0, 20)
  ) {
    throw new Error('provider authorization self hash mismatch');
  }
  return digest;
}

function masteringContract(value, candidateId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${candidateId} mastering contract must be an object`);
  }
  const width = integer(
    value.target_width,
    undefined,
    1,
    8192,
    `${candidateId}.target_width`,
  );
  const height = integer(
    value.target_height,
    undefined,
    1,
    8192,
    `${candidateId}.target_height`,
  );
  if (!width || !height) {
    throw new Error(`${candidateId} mastering target dimensions are required`);
  }
  if (value.source_canvas_policy !== 'provider-adapter-derived') {
    throw new Error(`${candidateId} mastering source canvas policy is invalid`);
  }
  if (
    value.background_mode !== 'chroma-key' &&
    value.background_mode !== 'opaque-preserve'
  ) {
    throw new Error(`${candidateId} mastering background mode is invalid`);
  }
  const matte = value.matte_colour;
  const matteSelection = value.matte_selection;
  if (
    value.background_mode === 'chroma-key' &&
    (!ALLOWED_CHROMA_MATTES.has(matte) ||
      matteSelection !== 'semantic-contrast-v1')
  ) {
    throw new Error(
      `${candidateId} chroma-key mastering must use an audited semantic-contrast matte`,
    );
  }
  if (
    value.background_mode === 'opaque-preserve' &&
    (matte !== null || matteSelection !== null)
  ) {
    throw new Error(
      `${candidateId} opaque mastering must not declare a matte policy`,
    );
  }
  if (
    value.resampling !== 'lanczos3' ||
    value.delivery_profile_id !== 'godot-sprite-lossless' ||
    typeof value.require_meaningful_alpha !== 'boolean' ||
    value.require_fake_transparency_rejection !== true ||
    value.approval_authority !== false
  ) {
    throw new Error(`${candidateId} mastering policy is invalid`);
  }
  return {
    targetWidth: width,
    targetHeight: height,
    backgroundMode: value.background_mode,
    ...(matte === null ? {} : { matteColour: matte }),
    matteSelection,
    resampling: value.resampling,
    deliveryProfileId: value.delivery_profile_id,
    requireMeaningfulAlpha: value.require_meaningful_alpha,
    requireFakeTransparencyRejection:
      value.require_fake_transparency_rejection,
  };
}

async function providerCandidateFor(job, planned, artifacts) {
  const rows = (job.outputArtifacts ?? []).filter(
    (entry) => entry.artifactRole === 'provider-candidate',
  );
  if (rows.length !== 1) {
    throw new Error(
      `provider execution ${job.candidateId} must expose exactly one provider-candidate artifact`,
    );
  }
  const evidence = rows[0];
  const verification = await artifacts.verify(evidence.artifactId);
  const descriptor = await artifacts.get(evidence.artifactId);
  if (
    !descriptor ||
    !verification.descriptorValid ||
    !verification.contentValid ||
    descriptor.contentHash !== evidence.contentHash ||
    descriptor.storageClass !== 'intermediate' ||
    descriptor.labels.artifactRole !== 'provider-candidate' ||
    descriptor.labels.approvalState !== 'unapproved' ||
    descriptor.labels.providerRequestId !== planned.candidate_id ||
    descriptor.metadata?.finalDeliverable !== false ||
    descriptor.metadata?.requestSha256 !== planned.request_sha256
  ) {
    throw new Error(
      `provider candidate artifact failed immutable/request/unapproved verification: ${job.candidateId}`,
    );
  }
  return descriptor;
}

async function sourceGeometry(artifacts, descriptor, policy, candidateId) {
  const sourceBytes = await artifacts.read(descriptor.artifactId);
  const decoded = await decodeSpriteFrame(sourceBytes, {
    maximumInputBytes: 128 * 1024 * 1024,
    maximumPixels: 64 * 1024 * 1024,
  });
  const sourceAspectRatio = decoded.width / decoded.height;
  const targetAspectRatio = policy.targetWidth / policy.targetHeight;
  const aspectRatioDrift =
    Math.abs(sourceAspectRatio - targetAspectRatio) / targetAspectRatio;
  if (
    !Number.isFinite(aspectRatioDrift) ||
    aspectRatioDrift > MAXIMUM_ASPECT_RATIO_DRIFT
  ) {
    throw new Error(
      `${candidateId} provider source aspect ratio ${decoded.width}x${decoded.height} would distort target ${policy.targetWidth}x${policy.targetHeight}`,
    );
  }
  return {
    sourceWidth: decoded.width,
    sourceHeight: decoded.height,
    sourceAspectRatio,
    targetAspectRatio,
    aspectRatioDrift,
    maximumAspectRatioDrift: MAXIMUM_ASPECT_RATIO_DRIFT,
  };
}

async function descriptorByRole(artifacts, ids, role) {
  const matches = [];
  for (const id of ids) {
    const descriptor = await artifacts.get(id);
    if (descriptor?.labels.artifactRole === role) matches.push(descriptor);
  }
  if (matches.length !== 1) {
    throw new Error(`mastering output must contain exactly one ${role} artifact`);
  }
  return matches[0];
}

export async function runTileMapCandidateMastering(
  argv = process.argv.slice(2),
) {
  const values = parseArguments(argv);
  const providerBatchRecord = await readJson(
    required(values, '--provider-batch'),
    'Tile Map provider runtime batch',
  );
  const executionRecord = await readJson(
    required(values, '--execution-receipt'),
    'Tile Map provider execution receipt',
  );
  const receiptPath = path.resolve(required(values, '--receipt'));
  if (await lstat(receiptPath).catch(() => null)) {
    throw new Error(`mastering receipt already exists: ${receiptPath}`);
  }

  const batch = providerBatchRecord.value;
  const providerBatchFingerprint = verifyProviderBatch(batch);
  const execution = executionRecord.value;
  const executionSha256 = verifyExecutionReceipt(execution);
  if (
    execution.sourceMapFingerprint !== batch.source_map_fingerprint ||
    execution.counts?.succeededRuntimeJobs !== batch.jobs.length ||
    execution.counts?.failedRuntimeJobs !== 0
  ) {
    throw new Error(
      'provider execution source map/counts differ from provider batch',
    );
  }

  const authorizationRecord = await readJson(
    execution.sourceAuthorization.path,
    'Tile Map provider authorization',
  );
  const authorizationSha256 = verifyAuthorization(authorizationRecord.value);
  if (
    sha256(authorizationRecord.bytes) !==
      execution.sourceAuthorization.fileSha256 ||
    authorizationSha256 !==
      execution.sourceAuthorization.documentSha256 ||
    authorizationRecord.value.runId !== execution.sourceAuthorization.runId ||
    authorizationRecord.value.sourceProviderBatch.documentSha256 !==
      providerBatchFingerprint ||
    authorizationRecord.value.sourceProviderBatch.fileSha256 !==
      sha256(providerBatchRecord.bytes) ||
    path.resolve(authorizationRecord.value.sourceProviderBatch.path) !==
      providerBatchRecord.path ||
    authorizationRecord.value.sourceMapFingerprint !==
      batch.source_map_fingerprint
  ) {
    throw new Error('provider authorization/execution source binding is invalid');
  }

  const runtime = new LocalRuntimeRepository({
    root: authorizationRecord.value.runtime.root,
  });
  const artifacts = new LocalArtifactStore({
    root: authorizationRecord.value.artifacts.root,
  });
  const completedByCandidate = new Map();
  for (const row of execution.jobs ?? []) {
    if (!row || typeof row !== 'object' || typeof row.candidateId !== 'string') {
      throw new Error('provider execution receipt contains malformed job rows');
    }
    if (completedByCandidate.has(row.candidateId)) {
      throw new Error(
        `duplicate provider execution candidate ${row.candidateId}`,
      );
    }
    completedByCandidate.set(row.candidateId, row);
  }
  if (completedByCandidate.size !== batch.jobs.length) {
    throw new Error(
      'provider execution and provider batch candidate counts differ',
    );
  }

  const queue = `tile-map-mastering-${executionSha256.slice(0, 20)}`;
  const submissions = [];
  const lineage = [];
  for (const [index, planned] of batch.jobs.entries()) {
    const candidateId = safeId(
      planned.candidate_id,
      `jobs[${index}].candidate_id`,
    );
    const completed = completedByCandidate.get(candidateId);
    if (
      !completed ||
      completed.state !== 'succeeded' ||
      completed.providerRequestSha256 !== planned.request_sha256 ||
      completed.taskId !== planned.task_id ||
      completed.visualFamily !== planned.visual_family
    ) {
      throw new Error(
        `provider execution identity did not match provider batch: ${candidateId}`,
      );
    }
    const source = await providerCandidateFor(completed, planned, artifacts);
    const policy = masteringContract(planned.mastering, candidateId);
    const geometry = await sourceGeometry(
      artifacts,
      source,
      policy,
      candidateId,
    );
    const requiredCapabilities = [
      'media.raster',
      'quality.sprite-frame',
      'evidence.bundle',
      TILE_MAP_MASTERING_CAPABILITY,
      ...(policy.backgroundMode === 'chroma-key'
        ? ['media.background-recovery', 'media.chroma-extract']
        : []),
    ];
    submissions.push({
      queue,
      kind: 'art.candidate.master-alpha',
      idempotencyKey:
        `tile-map-master:${candidateId}:` + executionSha256.slice(0, 16),
      payload: {
        candidateArtifactId: source.artifactId,
        targetWidth: policy.targetWidth,
        targetHeight: policy.targetHeight,
        backgroundMode: policy.backgroundMode,
        ...(policy.matteColour ? { matteColour: policy.matteColour } : {}),
        resampling: policy.resampling,
        deliveryProfileId: policy.deliveryProfileId,
        requireMeaningfulAlpha: policy.requireMeaningfulAlpha,
        requireFakeTransparencyRejection:
          policy.requireFakeTransparencyRejection,
        frameId: candidateId,
        quality: {
          expectedWidth: policy.targetWidth,
          expectedHeight: policy.targetHeight,
          expectedFormat: 'png',
          // Terrain/network art often must touch declared tile edges. Seam and
          // topology QA own those boundaries; generic sprite padding must not.
          safePadding: 0,
          maximumHaloFraction: 0.1,
        },
      },
      inputArtifacts: [source.artifactId],
      requiredCapabilities: [...new Set(requiredCapabilities)].sort(),
      maximumAttempts: 1,
      leaseDurationMs: 60_000,
      timeoutMs: 300_000,
      labels: {
        governanceDomain: 'tile-map-mastering',
        candidateId,
        sourceMapFingerprint: batch.source_map_fingerprint,
        providerExecutionSha256: executionSha256,
      },
    });
    lineage.push({
      candidateId,
      taskId: planned.task_id,
      visualFamily: planned.visual_family,
      outputPath: planned.output_path,
      providerRequestSha256: planned.request_sha256,
      sourceCandidateArtifactId: source.artifactId,
      policy,
      sourceGeometry: geometry,
    });
  }

  const submitted = await runtime.submitBatch(
    submissions,
    'tile-map-mastering',
  );
  if (submitted.length !== lineage.length) {
    throw new Error('mastering runtime submission count mismatch');
  }
  const workerId = safeId(
    values.get('--worker-id') ??
      `tile-map-mastering:${executionSha256.slice(0, 20)}`,
    '--worker-id',
  );
  const concurrency = integer(
    values.get('--concurrency'),
    1,
    1,
    Math.min(16, submitted.length),
    '--concurrency',
  );
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: workerId,
      queues: [queue],
      capabilities: [
        ...candidateMasteringWorkerCapabilities(),
        TILE_MAP_MASTERING_CAPABILITY,
      ].sort(),
    },
    handlers: createCandidateMasteringHandlers(),
    concurrency,
  });
  const runResult = await worker.runUntilIdle();

  const jobs = [];
  let succeeded = 0;
  let failed = 0;
  for (const [index, record] of submitted.entries()) {
    const current = await runtime.get(record.id);
    if (!current || current.specHash !== record.specHash) {
      throw new Error(
        `mastering runtime job disappeared or drifted: ${record.id}`,
      );
    }
    const source = lineage[index];
    if (current.state !== 'succeeded') {
      failed += 1;
      jobs.push({
        ...source,
        masteringJobId: current.id,
        masteringSpecSha256: current.specHash,
        state: current.state,
        attempts: current.attempts.length,
        failure: current.failure ?? null,
      });
      continue;
    }
    const mastered = await descriptorByRole(
      artifacts,
      current.outputArtifacts,
      'provider-candidate-alpha-master',
    );
    const evidence = await descriptorByRole(
      artifacts,
      current.outputArtifacts,
      'candidate-finalization-evidence',
    );
    const [masteredVerification, evidenceVerification] = await Promise.all([
      artifacts.verify(mastered.artifactId),
      artifacts.verify(evidence.artifactId),
    ]);
    if (
      !masteredVerification.descriptorValid ||
      !masteredVerification.contentValid ||
      !evidenceVerification.descriptorValid ||
      !evidenceVerification.contentValid ||
      mastered.mediaType !== 'image/png' ||
      mastered.storageClass !== 'intermediate' ||
      mastered.labels.approvalState !== 'unapproved' ||
      mastered.labels.qualityState !== 'passed' ||
      mastered.labels.finalizationReady !== 'true' ||
      mastered.labels.sourceCandidateArtifactId !==
        source.sourceCandidateArtifactId
    ) {
      throw new Error(
        `mastered candidate failed immutable quality boundary: ${source.candidateId}`,
      );
    }
    const proof = JSON.parse(
      (await artifacts.read(evidence.artifactId)).toString('utf8'),
    );
    if (
      proof.sourceCandidate?.artifactId !== source.sourceCandidateArtifactId ||
      proof.masteredCandidate?.artifactId !== mastered.artifactId ||
      proof.promotionEligible !== true ||
      proof.approvalState !== 'unapproved' ||
      proof.blockingProof?.qualityPassed !== true ||
      proof.blockingProof?.meaningfulAlphaPassed !== true ||
      proof.blockingProof?.fakeTransparencyPassed !== true ||
      proof.geometry?.sourceWidth !== source.sourceGeometry.sourceWidth ||
      proof.geometry?.sourceHeight !== source.sourceGeometry.sourceHeight ||
      proof.geometry?.targetWidth !== source.policy.targetWidth ||
      proof.geometry?.targetHeight !== source.policy.targetHeight
    ) {
      throw new Error(
        `mastering evidence contract failed: ${source.candidateId}`,
      );
    }
    succeeded += 1;
    jobs.push({
      ...source,
      masteringJobId: current.id,
      masteringSpecSha256: current.specHash,
      state: current.state,
      attempts: current.attempts.length,
      masteredArtifactId: mastered.artifactId,
      masteredContentHash: mastered.contentHash,
      masteredContentSha256: mastered.contentSha256,
      evidenceArtifactId: evidence.artifactId,
      evidenceContentHash: evidence.contentHash,
      evidenceContentSha256: evidence.contentSha256,
      qualityPassed: true,
      approvalState: 'unapproved',
    });
  }

  const receiptBase = {
    schema: TILE_MAP_MASTERING_RECEIPT_SCHEMA,
    status: failed === 0 ? 'succeeded' : 'failed',
    completedAt: new Date().toISOString(),
    workerId,
    sourceProviderBatch: {
      path: providerBatchRecord.path,
      fileSha256: sha256(providerBatchRecord.bytes),
      documentSha256: providerBatchFingerprint,
    },
    sourceProviderExecution: {
      path: executionRecord.path,
      fileSha256: sha256(executionRecord.bytes),
      documentSha256: executionSha256,
    },
    sourceMapFingerprint: batch.source_map_fingerprint,
    runtime: {
      root: authorizationRecord.value.runtime.root,
      rootSha256: authorizationRecord.value.runtime.rootSha256,
      queue,
    },
    artifacts: {
      root: authorizationRecord.value.artifacts.root,
      rootSha256: authorizationRecord.value.artifacts.rootSha256,
    },
    runResult,
    counts: {
      providerCandidates: batch.jobs.length,
      masteringJobs: submitted.length,
      succeeded,
      failed,
    },
    jobs,
    authority: {
      deterministicMastering: true,
      aspectRatioPreservation: true,
      maximumAspectRatioDrift: MAXIMUM_ASPECT_RATIO_DRIFT,
      candidateArtifactCreation: true,
      evidenceArtifactCreation: true,
      providerExecution: false,
      candidateApproval: false,
      candidatePromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  };
  const masteringSha256 = hashObject(receiptBase);
  const receipt = {
    ...receiptBase,
    masteringSha256,
    runId: masteringSha256.slice(0, 20),
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: 'wx',
  });
  if (failed !== 0) {
    const error = new Error(
      'one or more Tile Map candidate mastering jobs failed',
    );
    error.masteringReceipt = receiptPath;
    throw error;
  }
  return {
    status: receipt.status,
    receipt: receiptPath,
    runId: receipt.runId,
    masteringSha256,
    counts: receipt.counts,
  };
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  runTileMapCandidateMastering()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          ...(error?.masteringReceipt
            ? { masteringReceipt: error.masteringReceipt }
            : {}),
        })}\n`,
      );
      process.exitCode = 2;
    });
}
