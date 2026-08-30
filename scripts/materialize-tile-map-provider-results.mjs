#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';

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
const readJson = async (file, label) => {
  const resolved = path.resolve(file);
  const bytes = await readFile(resolved);
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return { path: resolved, bytes, value };
};
const optionMap = (argv) => {
  const supported = new Set([
    '--provider-batch',
    '--execution-receipt',
    '--mastering-receipt',
    '--artifact-root',
    '--output-root',
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
const safeRelative = (value, label) => {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    path.posix.isAbsolute(value)
  ) {
    throw new Error(`${label} must be a forward-slash relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('//')
  ) {
    throw new Error(`${label} is unsafe`);
  }
  return normalized;
};
const bodyWithoutSeal = (value, hashField) => {
  const { [hashField]: _hash, runId: _run, ...body } = value;
  return body;
};
const safeHash = (value, label) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be SHA-256`);
  }
  return value;
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
  const claimed = safeHash(
    batch.provider_batch_fingerprint,
    'provider_batch_fingerprint',
  );
  const { provider_batch_fingerprint: _fingerprint, ...body } = batch;
  if (hashObject(body) !== claimed) {
    throw new Error('provider batch self fingerprint mismatch');
  }
  if (!Array.isArray(batch.jobs) || batch.jobs.length < 1) {
    throw new Error('provider batch jobs must be non-empty');
  }
  return claimed;
}

function verifyExecution(execution) {
  if (
    execution.schema !== 'evavo.tile-map-provider-execution-receipt.v1' ||
    execution.status !== 'succeeded'
  ) {
    throw new Error(
      'execution receipt must be a successful Tile Map provider execution receipt',
    );
  }
  const digest = hashObject(bodyWithoutSeal(execution, 'executionSha256'));
  if (
    execution.executionSha256 !== digest ||
    execution.runId !== digest.slice(0, 20)
  ) {
    throw new Error('execution receipt self hash mismatch');
  }
  return digest;
}

function verifyMastering(mastering) {
  if (
    mastering.schema !== 'evavo.tile-map-candidate-mastering-receipt.v1' ||
    mastering.status !== 'succeeded'
  ) {
    throw new Error(
      'mastering receipt must be a successful Tile Map candidate mastering receipt',
    );
  }
  const digest = hashObject(bodyWithoutSeal(mastering, 'masteringSha256'));
  if (
    mastering.masteringSha256 !== digest ||
    mastering.runId !== digest.slice(0, 20)
  ) {
    throw new Error('mastering receipt self hash mismatch');
  }
  return digest;
}

async function assertOutputAbsent(outputRoot) {
  const resolved = path.resolve(outputRoot);
  const existing = await lstat(resolved).catch(() => null);
  if (existing) throw new Error(`output root must not already exist: ${resolved}`);
  await mkdir(path.dirname(resolved), { recursive: true });
  return resolved;
}

async function main() {
  const values = optionMap(process.argv.slice(2));
  const providerBatchRecord = await readJson(
    required(values, '--provider-batch'),
    'Tile Map provider runtime batch',
  );
  const executionRecord = await readJson(
    required(values, '--execution-receipt'),
    'Tile Map provider execution receipt',
  );
  const masteringRecord = await readJson(
    required(values, '--mastering-receipt'),
    'Tile Map candidate mastering receipt',
  );
  const artifactRoot = path.resolve(required(values, '--artifact-root'));
  const outputRoot = await assertOutputAbsent(required(values, '--output-root'));
  const stageRoot = `${outputRoot}.stage-${randomUUID()}`;

  const batch = providerBatchRecord.value;
  const providerBatchFingerprint = verifyProviderBatch(batch);
  const execution = executionRecord.value;
  const executionSha256 = verifyExecution(execution);
  const mastering = masteringRecord.value;
  const masteringSha256 = verifyMastering(mastering);

  if (
    execution.sourceMapFingerprint !== batch.source_map_fingerprint ||
    mastering.sourceMapFingerprint !== batch.source_map_fingerprint
  ) {
    throw new Error('provider/mastering source map fingerprint differs from provider batch');
  }
  if (
    path.resolve(mastering.sourceProviderBatch.path) !== providerBatchRecord.path ||
    mastering.sourceProviderBatch.fileSha256 !== sha256(providerBatchRecord.bytes) ||
    mastering.sourceProviderBatch.documentSha256 !== providerBatchFingerprint
  ) {
    throw new Error('mastering receipt provider-batch binding is invalid');
  }
  if (
    path.resolve(mastering.sourceProviderExecution.path) !== executionRecord.path ||
    mastering.sourceProviderExecution.fileSha256 !== sha256(executionRecord.bytes) ||
    mastering.sourceProviderExecution.documentSha256 !== executionSha256
  ) {
    throw new Error('mastering receipt provider-execution binding is invalid');
  }

  const authorizationRecord = await readJson(
    execution.sourceAuthorization.path,
    'Tile Map provider authorization',
  );
  if (
    sha256(authorizationRecord.bytes) !==
      execution.sourceAuthorization.fileSha256 ||
    authorizationRecord.value.authorizationSha256 !==
      execution.sourceAuthorization.documentSha256 ||
    authorizationRecord.value.sourceProviderBatch.documentSha256 !==
      providerBatchFingerprint
  ) {
    throw new Error('authorization/provider execution binding is invalid');
  }
  if (
    path.resolve(authorizationRecord.value.artifacts.root) !== artifactRoot ||
    path.resolve(mastering.artifacts.root) !== artifactRoot
  ) {
    throw new Error('--artifact-root does not match authorized/mastering artifact root');
  }

  const masteringJobs = new Map();
  for (const job of mastering.jobs ?? []) {
    if (
      !job ||
      typeof job !== 'object' ||
      Array.isArray(job) ||
      typeof job.candidateId !== 'string'
    ) {
      throw new Error('mastering receipt contains malformed jobs');
    }
    if (masteringJobs.has(job.candidateId)) {
      throw new Error(`duplicate mastering candidate ${job.candidateId}`);
    }
    masteringJobs.set(job.candidateId, job);
  }
  if (masteringJobs.size !== batch.jobs.length) {
    throw new Error('mastering receipt and provider batch candidate counts differ');
  }

  const store = new LocalArtifactStore({ root: artifactRoot });
  const candidates = [];
  await mkdir(stageRoot, { recursive: false });
  try {
    for (const [index, planned] of batch.jobs.entries()) {
      const candidateId = planned.candidate_id;
      const completed = masteringJobs.get(candidateId);
      if (!completed || completed.state !== 'succeeded') {
        throw new Error(`candidate mastering did not succeed: ${candidateId}`);
      }
      if (
        completed.outputPath !== planned.output_path ||
        completed.taskId !== planned.task_id ||
        completed.visualFamily !== planned.visual_family ||
        completed.qualityPassed !== true ||
        completed.approvalState !== 'unapproved'
      ) {
        throw new Error(`mastering receipt identity/quality drifted: ${candidateId}`);
      }
      const [masteredVerification, evidenceVerification] = await Promise.all([
        store.verify(completed.masteredArtifactId),
        store.verify(completed.evidenceArtifactId),
      ]);
      const [masteredDescriptor, evidenceDescriptor] = await Promise.all([
        store.get(completed.masteredArtifactId),
        store.get(completed.evidenceArtifactId),
      ]);
      if (
        !masteredDescriptor ||
        !evidenceDescriptor ||
        !masteredVerification.descriptorValid ||
        !masteredVerification.contentValid ||
        !evidenceVerification.descriptorValid ||
        !evidenceVerification.contentValid ||
        masteredDescriptor.contentHash !== completed.masteredContentHash ||
        evidenceDescriptor.contentHash !== completed.evidenceContentHash ||
        masteredDescriptor.mediaType !== 'image/png' ||
        masteredDescriptor.storageClass !== 'intermediate' ||
        masteredDescriptor.labels.artifactRole !==
          'provider-candidate-alpha-master' ||
        masteredDescriptor.labels.approvalState !== 'unapproved' ||
        masteredDescriptor.labels.qualityState !== 'passed' ||
        masteredDescriptor.labels.finalizationReady !== 'true' ||
        masteredDescriptor.labels.sourceCandidateArtifactId !==
          completed.sourceCandidateArtifactId ||
        evidenceDescriptor.labels.artifactRole !==
          'candidate-finalization-evidence'
      ) {
        throw new Error(
          `mastered candidate failed immutable evidence boundary: ${candidateId}`,
        );
      }

      const bytes = await store.read(completed.masteredArtifactId);
      if (sha256(bytes) !== masteredDescriptor.contentSha256) {
        throw new Error(`mastered candidate content SHA drifted: ${candidateId}`);
      }
      const outputPath = safeRelative(
        planned.output_path,
        `jobs[${index}].output_path`,
      );
      const absolute = path.resolve(stageRoot, ...outputPath.split('/'));
      const relative = path.relative(stageRoot, absolute);
      if (
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error(`candidate output escapes materialization root: ${candidateId}`);
      }
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, bytes, { flag: 'wx' });
      candidates.push({
        candidate_id: candidateId,
        path: outputPath,
        sha256: sha256(bytes),
        source_provider_artifact_id: completed.sourceCandidateArtifactId,
        mastered_artifact_id: masteredDescriptor.artifactId,
        mastered_artifact_content_hash: masteredDescriptor.contentHash,
        mastering_evidence_artifact_id: evidenceDescriptor.artifactId,
        mastering_evidence_content_hash: evidenceDescriptor.contentHash,
        mastering_job_id: completed.masteringJobId,
        mastering_spec_sha256: completed.masteringSpecSha256,
      });
    }

    const base = {
      schema_version: 2,
      source_batch_fingerprint: batch.source_candidate_batch_fingerprint,
      source_provider_batch_path: providerBatchRecord.path,
      source_provider_batch_sha256: sha256(providerBatchRecord.bytes),
      source_provider_batch_fingerprint: providerBatchFingerprint,
      source_execution_receipt_path: executionRecord.path,
      source_execution_receipt_sha256: sha256(executionRecord.bytes),
      source_execution_sha256: executionSha256,
      source_mastering_receipt_path: masteringRecord.path,
      source_mastering_receipt_sha256: sha256(masteringRecord.bytes),
      source_mastering_sha256: masteringSha256,
      source_map_fingerprint: batch.source_map_fingerprint,
      candidates,
      authority: {
        provider_output_authority: 'intermediate-only',
        deterministic_mastering_required: true,
        mastering_quality_required: true,
        review_required: true,
        approval_authority: false,
      },
    };
    const results = { ...base, results_fingerprint: hashObject(base) };
    const resultsPath = path.join(stageRoot, 'provider-results.json');
    await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`, {
      flag: 'wx',
    });
    await rename(stageRoot, outputRoot);
    process.stdout.write(
      `${JSON.stringify({
        status: 'mastered-and-materialized-for-review',
        outputRoot,
        providerResults: path.join(outputRoot, 'provider-results.json'),
        candidates: candidates.length,
        providerExecutionSha256: executionSha256,
        masteringSha256,
        resultsFingerprint: results.results_fingerprint,
      })}\n`,
    );
  } catch (error) {
    await rm(stageRoot, { recursive: true, force: true });
    throw error;
  }
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
