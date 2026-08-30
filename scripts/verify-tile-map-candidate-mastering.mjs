#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import { LocalRuntimeRepository } from '../packages/runtime/dist/index.js';
import {
  TILE_MAP_MASTERING_CAPABILITY,
  TILE_MAP_MASTERING_RECEIPT_SCHEMA,
} from './run-tile-map-candidate-mastering.mjs';

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
const withoutSeal = (value, hashField) => {
  const { [hashField]: _hash, runId: _runId, ...body } = value;
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
const safeHash = (value, label) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be SHA-256`);
  }
  return value;
};
const safeArtifactId = (value, label) => {
  if (typeof value !== 'string' || !/^artifact_[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must use artifact_<sha256> format`);
  }
  return value;
};

function verifySealed(value, hashField, label) {
  const claimed = safeHash(value[hashField], `${label}.${hashField}`);
  const actual = hashObject(withoutSeal(value, hashField));
  if (actual !== claimed || value.runId !== claimed.slice(0, 20)) {
    throw new Error(`${label} self hash is invalid`);
  }
  return claimed;
}

function verifyFingerprint(value, field, label) {
  const claimed = safeHash(value[field], `${label}.${field}`);
  const { [field]: _fingerprint, ...body } = value;
  if (hashObject(body) !== claimed) {
    throw new Error(`${label} self fingerprint is invalid`);
  }
  return claimed;
}

async function descriptor(artifacts, artifactId, role) {
  const id = safeArtifactId(artifactId, `${role} artifact id`);
  const [stored, verification] = await Promise.all([
    artifacts.get(id),
    artifacts.verify(id),
  ]);
  if (!stored || !verification.descriptorValid || !verification.contentValid) {
    throw new Error(`${role} artifact failed immutable verification: ${id}`);
  }
  return stored;
}

async function main() {
  const receiptPath = process.argv[2];
  if (!receiptPath || process.argv.length !== 3) {
    throw new Error(
      'usage: verify-tile-map-candidate-mastering.mjs <mastering-receipt.json>',
    );
  }
  const receiptRecord = await readJson(
    receiptPath,
    'Tile Map candidate mastering receipt',
  );
  const receipt = receiptRecord.value;
  if (
    receipt.schema !== TILE_MAP_MASTERING_RECEIPT_SCHEMA ||
    receipt.status !== 'succeeded'
  ) {
    throw new Error('mastering receipt is not a successful Tile Map receipt');
  }
  const masteringSha256 = verifySealed(
    receipt,
    'masteringSha256',
    'mastering receipt',
  );

  const providerBatchRecord = await readJson(
    receipt.sourceProviderBatch.path,
    'Tile Map provider runtime batch',
  );
  if (
    sha256(providerBatchRecord.bytes) !==
      receipt.sourceProviderBatch.fileSha256
  ) {
    throw new Error('provider batch bytes drifted after mastering');
  }
  const providerBatch = providerBatchRecord.value;
  const providerBatchFingerprint = verifyFingerprint(
    providerBatch,
    'provider_batch_fingerprint',
    'provider batch',
  );
  if (
    providerBatchFingerprint !==
      receipt.sourceProviderBatch.documentSha256 ||
    providerBatch.source_map_fingerprint !== receipt.sourceMapFingerprint
  ) {
    throw new Error('mastering receipt provider-batch binding is invalid');
  }

  const executionRecord = await readJson(
    receipt.sourceProviderExecution.path,
    'Tile Map provider execution receipt',
  );
  if (
    sha256(executionRecord.bytes) !==
      receipt.sourceProviderExecution.fileSha256
  ) {
    throw new Error('provider execution receipt bytes drifted after mastering');
  }
  const execution = executionRecord.value;
  const executionSha256 = verifySealed(
    execution,
    'executionSha256',
    'provider execution receipt',
  );
  if (
    executionSha256 !== receipt.sourceProviderExecution.documentSha256 ||
    execution.sourceMapFingerprint !== receipt.sourceMapFingerprint
  ) {
    throw new Error('mastering receipt provider-execution binding is invalid');
  }

  const authorizationRecord = await readJson(
    execution.sourceAuthorization.path,
    'Tile Map provider authorization',
  );
  if (
    sha256(authorizationRecord.bytes) !==
      execution.sourceAuthorization.fileSha256
  ) {
    throw new Error('provider authorization bytes drifted after mastering');
  }
  const authorization = authorizationRecord.value;
  const authorizationSha256 = verifySealed(
    authorization,
    'authorizationSha256',
    'provider authorization',
  );
  if (
    authorizationSha256 !== execution.sourceAuthorization.documentSha256 ||
    authorization.sourceProviderBatch.documentSha256 !==
      providerBatchFingerprint ||
    path.resolve(authorization.sourceProviderBatch.path) !==
      providerBatchRecord.path ||
    authorization.sourceMapFingerprint !== receipt.sourceMapFingerprint ||
    path.resolve(authorization.runtime.root) !== path.resolve(receipt.runtime.root) ||
    path.resolve(authorization.artifacts.root) !==
      path.resolve(receipt.artifacts.root)
  ) {
    throw new Error('mastering receipt authorization/storage binding is invalid');
  }

  const runtime = new LocalRuntimeRepository({ root: receipt.runtime.root });
  const artifacts = new LocalArtifactStore({ root: receipt.artifacts.root });
  if (!Array.isArray(receipt.jobs) || receipt.jobs.length < 1) {
    throw new Error('mastering receipt jobs must be non-empty');
  }
  if (
    receipt.counts?.providerCandidates !== receipt.jobs.length ||
    receipt.counts?.masteringJobs !== receipt.jobs.length ||
    receipt.counts?.succeeded !== receipt.jobs.length ||
    receipt.counts?.failed !== 0
  ) {
    throw new Error('mastering receipt counts do not reconcile');
  }

  const seenCandidates = new Set();
  const verified = [];
  for (const [index, row] of receipt.jobs.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`mastering jobs[${index}] must be an object`);
    }
    if (
      typeof row.candidateId !== 'string' ||
      seenCandidates.has(row.candidateId)
    ) {
      throw new Error(`mastering jobs[${index}] candidate identity is invalid`);
    }
    seenCandidates.add(row.candidateId);
    if (
      row.state !== 'succeeded' ||
      row.qualityPassed !== true ||
      row.approvalState !== 'unapproved'
    ) {
      throw new Error(`mastering candidate is not quality-passed/unapproved: ${row.candidateId}`);
    }

    const runtimeJob = await runtime.get(row.masteringJobId);
    if (
      !runtimeJob ||
      runtimeJob.specHash !== row.masteringSpecSha256 ||
      runtimeJob.state !== 'succeeded' ||
      runtimeJob.spec.queue !== receipt.runtime.queue ||
      runtimeJob.spec.maximumAttempts !== 1 ||
      !runtimeJob.spec.requiredCapabilities.includes(
        TILE_MAP_MASTERING_CAPABILITY,
      ) ||
      !runtimeJob.spec.inputArtifacts.includes(row.sourceCandidateArtifactId) ||
      runtimeJob.attempts.length !== row.attempts
    ) {
      throw new Error(`mastering runtime job drifted: ${row.candidateId}`);
    }

    const source = await descriptor(
      artifacts,
      row.sourceCandidateArtifactId,
      'source provider candidate',
    );
    const mastered = await descriptor(
      artifacts,
      row.masteredArtifactId,
      'mastered candidate',
    );
    const evidence = await descriptor(
      artifacts,
      row.evidenceArtifactId,
      'mastering evidence',
    );
    if (
      source.storageClass !== 'intermediate' ||
      source.labels.artifactRole !== 'provider-candidate' ||
      source.labels.approvalState !== 'unapproved' ||
      mastered.storageClass !== 'intermediate' ||
      mastered.labels.artifactRole !== 'provider-candidate-alpha-master' ||
      mastered.labels.approvalState !== 'unapproved' ||
      mastered.labels.qualityState !== 'passed' ||
      mastered.labels.finalizationReady !== 'true' ||
      mastered.labels.sourceCandidateArtifactId !== source.artifactId ||
      mastered.contentHash !== row.masteredContentHash ||
      mastered.contentSha256 !== row.masteredContentSha256 ||
      evidence.labels.artifactRole !== 'candidate-finalization-evidence' ||
      evidence.contentHash !== row.evidenceContentHash ||
      evidence.contentSha256 !== row.evidenceContentSha256
    ) {
      throw new Error(`mastering artifact lineage/quality drifted: ${row.candidateId}`);
    }
    if (
      runtimeJob.outputArtifacts.length !== 2 ||
      !runtimeJob.outputArtifacts.includes(mastered.artifactId) ||
      !runtimeJob.outputArtifacts.includes(evidence.artifactId)
    ) {
      throw new Error(`mastering runtime outputs drifted: ${row.candidateId}`);
    }

    const proof = JSON.parse(
      (await artifacts.read(evidence.artifactId)).toString('utf8'),
    );
    if (
      proof.sourceCandidate?.artifactId !== source.artifactId ||
      proof.masteredCandidate?.artifactId !== mastered.artifactId ||
      proof.promotionEligible !== true ||
      proof.approvalState !== 'unapproved' ||
      proof.blockingProof?.qualityPassed !== true ||
      proof.blockingProof?.meaningfulAlphaPassed !== true ||
      proof.blockingProof?.fakeTransparencyPassed !== true ||
      proof.geometry?.targetWidth !== row.policy?.targetWidth ||
      proof.geometry?.targetHeight !== row.policy?.targetHeight
    ) {
      throw new Error(`mastering evidence content drifted: ${row.candidateId}`);
    }

    verified.push({
      candidateId: row.candidateId,
      masteringJobId: runtimeJob.id,
      sourceCandidateArtifactId: source.artifactId,
      masteredArtifactId: mastered.artifactId,
      evidenceArtifactId: evidence.artifactId,
      target: {
        width: row.policy.targetWidth,
        height: row.policy.targetHeight,
      },
      approvalState: 'unapproved',
    });
  }

  process.stdout.write(
    `${JSON.stringify({
      status: 'verified',
      masteringReceipt: receiptRecord.path,
      masteringSha256,
      providerBatchFingerprint,
      executionSha256,
      sourceMapFingerprint: receipt.sourceMapFingerprint,
      candidates: verified,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 2;
});
