#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  LocalRuntimeRepository,
  RUNTIME_PROTOCOL_VERSION,
} from '../packages/runtime/dist/index.js';
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
    throw new Error(`${label} must be object`);
  }
  return { path: resolved, bytes, value };
};
const body = (value) => {
  const { authorizationSha256: _hash, runId: _run, ...rest } = value;
  return rest;
};

async function main() {
  const authorizationPath = process.argv[2];
  if (!authorizationPath || process.argv.length !== 3) {
    throw new Error(
      'usage: validate-tile-map-provider-authorization.mjs <authorization.json>',
    );
  }
  const record = await readJson(
    authorizationPath,
    'Tile Map provider authorization',
  );
  const authorization = record.value;
  if (
    authorization.schema !== TILE_MAP_PROVIDER_AUTHORIZATION_SCHEMA ||
    authorization.status !== 'authorized'
  ) {
    throw new Error('unexpected Tile Map provider authorization');
  }
  if (authorization.runtimeProtocolVersion !== RUNTIME_PROTOCOL_VERSION) {
    throw new Error('runtime protocol version drift');
  }
  const expectedHash = hashObject(body(authorization));
  if (
    authorization.authorizationSha256 !== expectedHash ||
    authorization.runId !== expectedHash.slice(0, 20)
  ) {
    throw new Error('authorization self hash mismatch');
  }
  const authorizedAt = Date.parse(authorization.authorizedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  if (
    !Number.isFinite(authorizedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= authorizedAt ||
    expiresAt - authorizedAt > 24 * 60 * 60 * 1000
  ) {
    throw new Error('authorization time window is invalid');
  }
  const now = Date.now();
  if (now < authorizedAt || now >= expiresAt) {
    throw new Error('Tile Map provider authorization is not currently active');
  }

  const source = await readJson(
    authorization.sourceProviderBatch.path,
    'Tile Map provider batch',
  );
  if (sha256(source.bytes) !== authorization.sourceProviderBatch.fileSha256) {
    throw new Error('provider batch bytes drifted');
  }
  if (
    source.value.provider_batch_fingerprint !==
    authorization.sourceProviderBatch.documentSha256
  ) {
    throw new Error('provider batch fingerprint drifted');
  }
  if (
    source.value.source_map_fingerprint !== authorization.sourceMapFingerprint
  ) {
    throw new Error('source map fingerprint drifted');
  }

  const runtime = new LocalRuntimeRepository({ root: authorization.runtime.root });
  const results = [];
  for (const expected of authorization.jobs) {
    const job = await runtime.get(expected.jobId);
    if (!job) {
      throw new Error(`authorized runtime job missing: ${expected.jobId}`);
    }
    if (job.specHash !== expected.specSha256) {
      throw new Error(`runtime job spec drifted: ${expected.jobId}`);
    }
    if (
      job.state !== 'queued' ||
      job.attempts.length !== 0 ||
      job.redriveCount !== 0
    ) {
      throw new Error(
        `runtime job is not pristine queued state: ${expected.jobId}`,
      );
    }
    if (job.spec.maximumAttempts !== 1) {
      throw new Error(`runtime job retry policy drifted: ${expected.jobId}`);
    }
    if (
      !job.spec.requiredCapabilities.includes(
        TILE_MAP_PROVIDER_EXECUTION_CAPABILITY,
      )
    ) {
      throw new Error(
        `runtime job authorization capability missing: ${expected.jobId}`,
      );
    }
    if (!authorization.execution.queues.includes(job.spec.queue)) {
      throw new Error(`runtime job queue drifted: ${expected.jobId}`);
    }
    results.push({
      jobId: job.id,
      specSha256: job.specHash,
      queue: job.spec.queue,
      state: job.state,
    });
  }

  process.stdout.write(`${JSON.stringify({
    status: 'valid-active',
    authorization: record.path,
    authorizationSha256: expectedHash,
    activeNow: true,
    expiresAt: authorization.expiresAt,
    allowedAdapterIds: authorization.allowedAdapterIds,
    jobs: results,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 2;
});
