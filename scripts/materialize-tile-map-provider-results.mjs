#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';

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
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  return { path: resolved, bytes, value };
};
const optionMap = (argv) => {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name)) {
      throw new Error('arguments must be unique --name value pairs');
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
const safeRelative = (value, label) => {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new Error(`${label} must be a forward-slash relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('//')) {
    throw new Error(`${label} is unsafe`);
  }
  return normalized;
};
const bodyWithoutSeal = (value, hashField, runField = 'runId') => {
  const { [hashField]: _hash, [runField]: _run, ...body } = value;
  return body;
};

async function ensureEmpty(root) {
  const resolved = path.resolve(root);
  await mkdir(resolved, { recursive: true });
  if ((await readdir(resolved)).length !== 0) throw new Error(`output root must be new or empty: ${resolved}`);
  return resolved;
}

async function main() {
  const values = optionMap(process.argv.slice(2));
  const providerBatchRecord = await readJson(required(values, '--provider-batch'), 'Tile Map provider runtime batch');
  const executionRecord = await readJson(required(values, '--execution-receipt'), 'Tile Map provider execution receipt');
  const artifactRoot = path.resolve(required(values, '--artifact-root'));
  const outputRoot = await ensureEmpty(required(values, '--output-root'));

  const batch = providerBatchRecord.value;
  if (batch.schema_version !== 1 || batch.status !== 'ready-for-provider-runtime') {
    throw new Error('provider batch must be schema v1 and ready-for-provider-runtime');
  }
  const execution = executionRecord.value;
  if (execution.schema !== 'evavo.tile-map-provider-execution-receipt.v1' || execution.status !== 'succeeded') {
    throw new Error('execution receipt must be a successful Tile Map provider execution receipt');
  }
  const executionHash = hashObject(bodyWithoutSeal(execution, 'executionSha256'));
  if (execution.executionSha256 !== executionHash || execution.runId !== executionHash.slice(0, 20)) {
    throw new Error('execution receipt self hash mismatch');
  }
  if (execution.sourceMapFingerprint !== batch.source_map_fingerprint) {
    throw new Error('execution receipt source map fingerprint does not match provider batch');
  }
  const authorizationRecord = await readJson(execution.sourceAuthorization.path, 'Tile Map provider authorization');
  if (sha256(authorizationRecord.bytes) !== execution.sourceAuthorization.fileSha256) {
    throw new Error('authorization bytes drifted after provider execution');
  }
  if (authorizationRecord.value.authorizationSha256 !== execution.sourceAuthorization.documentSha256) {
    throw new Error('authorization fingerprint drifted after provider execution');
  }
  if (authorizationRecord.value.sourceProviderBatch.documentSha256 !== batch.provider_batch_fingerprint) {
    throw new Error('authorization does not target this exact provider batch');
  }
  if (path.resolve(authorizationRecord.value.artifacts.root) !== artifactRoot) {
    throw new Error('--artifact-root does not match authorized artifact root');
  }

  const executionJobs = new Map();
  for (const job of execution.jobs ?? []) {
    if (!job || typeof job !== 'object' || Array.isArray(job) || typeof job.candidateId !== 'string') {
      throw new Error('execution receipt contains malformed jobs');
    }
    if (executionJobs.has(job.candidateId)) throw new Error(`duplicate execution candidate ${job.candidateId}`);
    executionJobs.set(job.candidateId, job);
  }
  const store = new LocalArtifactStore({ root: artifactRoot });
  const candidates = [];
  for (const [index, planned] of batch.jobs.entries()) {
    const candidateId = planned.candidate_id;
    const completed = executionJobs.get(candidateId);
    if (!completed || completed.state !== 'succeeded') throw new Error(`candidate did not succeed: ${candidateId}`);
    const candidateArtifacts = (completed.outputArtifacts ?? []).filter((artifact) => artifact.artifactRole === 'provider-candidate');
    if (candidateArtifacts.length !== 1) {
      throw new Error(`candidate ${candidateId} must have exactly one provider-candidate artifact; got ${candidateArtifacts.length}`);
    }
    const evidence = candidateArtifacts[0];
    const verification = await store.verify(evidence.artifactId);
    if (!verification.descriptorValid || !verification.contentValid) throw new Error(`candidate artifact verification failed: ${candidateId}`);
    const descriptor = await store.get(evidence.artifactId);
    if (!descriptor) throw new Error(`candidate artifact missing: ${candidateId}`);
    if (
      descriptor.mediaType !== 'image/png' ||
      descriptor.storageClass !== 'intermediate' ||
      descriptor.labels.artifactRole !== 'provider-candidate' ||
      descriptor.labels.approvalState !== 'unapproved' ||
      descriptor.metadata?.finalDeliverable !== false
    ) {
      throw new Error(`candidate artifact crossed provider intermediate boundary: ${candidateId}`);
    }
    if (descriptor.contentHash !== evidence.contentHash) throw new Error(`execution receipt artifact hash drifted: ${candidateId}`);
    const bytes = await store.read(evidence.artifactId);
    const outputPath = safeRelative(planned.output_path, `jobs[${index}].output_path`);
    const absolute = path.resolve(outputRoot, ...outputPath.split('/'));
    const relative = path.relative(outputRoot, absolute);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`candidate output escapes materialization root: ${candidateId}`);
    }
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes, { flag: 'wx' });
    candidates.push({
      candidate_id: candidateId,
      path: outputPath,
      sha256: sha256(bytes),
      artifact_id: evidence.artifactId,
      artifact_content_hash: descriptor.contentHash,
      execution_job_id: completed.jobId,
      execution_spec_sha256: completed.specSha256,
    });
  }
  const base = {
    schema_version: 1,
    source_batch_fingerprint: batch.source_candidate_batch_fingerprint,
    source_provider_batch_fingerprint: batch.provider_batch_fingerprint,
    source_execution_sha256: execution.executionSha256,
    source_map_fingerprint: batch.source_map_fingerprint,
    candidates,
    authority: {
      provider_output_authority: 'intermediate-only',
      review_required: true,
      approval_authority: false,
    },
  };
  const results = { ...base, results_fingerprint: hashObject(base) };
  const resultsPath = path.join(outputRoot, 'provider-results.json');
  await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({
    status: 'materialized-for-review',
    outputRoot,
    providerResults: resultsPath,
    candidates: candidates.length,
    resultsFingerprint: results.results_fingerprint,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 2;
});
