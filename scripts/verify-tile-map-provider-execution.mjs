#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import { LocalRuntimeRepository } from '../packages/runtime/dist/index.js';
import {
  TILE_MAP_PROVIDER_AUTHORIZATION_SCHEMA,
  TILE_MAP_PROVIDER_EXECUTION_CAPABILITY,
} from './authorize-tile-map-provider-runtime.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
const hashObject = (value) => sha256(Buffer.from(canonical(value), 'utf8'));
const readJson = async (file, label) => {
  const resolved = path.resolve(file);
  const bytes = await readFile(resolved);
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return { path: resolved, bytes, value };
};
const withoutSeal = (value, hashName) => {
  const { [hashName]: _hash, runId: _run, ...body } = value;
  return body;
};

async function main() {
  const receiptPath = process.argv[2];
  if (!receiptPath || process.argv.length !== 3) {
    throw new Error(
      'usage: verify-tile-map-provider-execution.mjs <execution-receipt.json>',
    );
  }
  const receiptRecord = await readJson(
    receiptPath,
    'Tile Map provider execution receipt',
  );
  const receipt = receiptRecord.value;
  if (
    receipt.schema !== 'evavo.tile-map-provider-execution-receipt.v1' ||
    receipt.status !== 'succeeded'
  ) {
    throw new Error('execution receipt is not a successful Tile Map receipt');
  }
  const executionSha256 = hashObject(
    withoutSeal(receipt, 'executionSha256'),
  );
  if (
    receipt.executionSha256 !== executionSha256 ||
    receipt.runId !== executionSha256.slice(0, 20)
  ) {
    throw new Error('execution receipt self hash mismatch');
  }

  const authorizationRecord = await readJson(
    receipt.sourceAuthorization.path,
    'Tile Map provider authorization',
  );
  if (sha256(authorizationRecord.bytes) !== receipt.sourceAuthorization.fileSha256) {
    throw new Error('authorization bytes drifted after execution');
  }
  const authorization = authorizationRecord.value;
  if (
    authorization.schema !== TILE_MAP_PROVIDER_AUTHORIZATION_SCHEMA ||
    authorization.authorizationSha256 !==
      receipt.sourceAuthorization.documentSha256 ||
    authorization.runId !== receipt.sourceAuthorization.runId
  ) {
    throw new Error('execution receipt authorization binding is invalid');
  }
  const authorizationHash = hashObject(
    withoutSeal(authorization, 'authorizationSha256'),
  );
  if (authorization.authorizationSha256 !== authorizationHash) {
    throw new Error('authorization self hash mismatch');
  }
  if (authorization.sourceMapFingerprint !== receipt.sourceMapFingerprint) {
    throw new Error('execution source map fingerprint drifted');
  }

  const providerBatch = await readJson(
    authorization.sourceProviderBatch.path,
    'Tile Map provider batch',
  );
  if (
    sha256(providerBatch.bytes) !== authorization.sourceProviderBatch.fileSha256 ||
    providerBatch.value.provider_batch_fingerprint !==
      authorization.sourceProviderBatch.documentSha256 ||
    providerBatch.value.source_map_fingerprint !== receipt.sourceMapFingerprint
  ) {
    throw new Error('provider batch binding drifted');
  }

  const runtime = new LocalRuntimeRepository({ root: authorization.runtime.root });
  const artifacts = new LocalArtifactStore({ root: authorization.artifacts.root });
  const expectedJobs = new Map(
    authorization.jobs.map((job) => [job.jobId, job]),
  );
  if (
    !Array.isArray(receipt.jobs) ||
    receipt.jobs.length !== expectedJobs.size
  ) {
    throw new Error('execution receipt job count differs from authorization');
  }

  const verifiedJobs = [];
  for (const row of receipt.jobs) {
    const expected = expectedJobs.get(row.jobId);
    if (!expected) throw new Error(`execution receipt has unauthorized job ${row.jobId}`);
    if (
      row.candidateId !== expected.candidateId ||
      row.specSha256 !== expected.specSha256 ||
      row.providerRequestSha256 !== expected.providerRequestSha256
    ) {
      throw new Error(`execution receipt job identity drifted: ${row.jobId}`);
    }
    const runtimeJob = await runtime.get(row.jobId);
    if (
      !runtimeJob ||
      runtimeJob.specHash !== expected.specSha256 ||
      runtimeJob.state !== 'succeeded' ||
      runtimeJob.spec.maximumAttempts !== 1 ||
      !runtimeJob.spec.requiredCapabilities.includes(
        TILE_MAP_PROVIDER_EXECUTION_CAPABILITY,
      )
    ) {
      throw new Error(`runtime job state/spec drifted: ${row.jobId}`);
    }
    if (runtimeJob.attempts.length !== row.attempts) {
      throw new Error(`runtime job attempt count drifted: ${row.jobId}`);
    }

    const outputs = [];
    for (const evidence of row.outputArtifacts ?? []) {
      const verification = await artifacts.verify(evidence.artifactId);
      if (!verification.descriptorValid || !verification.contentValid) {
        throw new Error(
          `execution artifact failed immutable verification: ${evidence.artifactId}`,
        );
      }
      const descriptor = await artifacts.get(evidence.artifactId);
      if (!descriptor) {
        throw new Error(`execution artifact disappeared: ${evidence.artifactId}`);
      }
      if (descriptor.contentHash !== evidence.contentHash) {
        throw new Error(`execution artifact content hash drifted: ${evidence.artifactId}`);
      }
      if (
        descriptor.labels.artifactRole === 'provider-candidate' &&
        (descriptor.storageClass !== 'intermediate' ||
          descriptor.labels.approvalState !== 'unapproved' ||
          descriptor.metadata?.finalDeliverable !== false)
      ) {
        throw new Error(
          `provider candidate crossed unapproved boundary: ${evidence.artifactId}`,
        );
      }
      outputs.push({
        artifactId: descriptor.artifactId,
        contentHash: descriptor.contentHash,
        role: descriptor.labels.artifactRole ?? null,
      });
    }
    if (outputs.length !== runtimeJob.outputArtifacts.length) {
      throw new Error(`execution artifact count drifted: ${row.jobId}`);
    }
    verifiedJobs.push({
      jobId: row.jobId,
      candidateId: row.candidateId,
      state: runtimeJob.state,
      artifacts: outputs,
    });
  }

  process.stdout.write(`${JSON.stringify({
    status: 'verified',
    executionReceipt: receiptRecord.path,
    executionSha256,
    authorizationSha256: authorization.authorizationSha256,
    sourceMapFingerprint: receipt.sourceMapFingerprint,
    jobs: verifiedJobs,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 2;
});
