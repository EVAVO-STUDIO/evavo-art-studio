#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileProviderCandidateRuntimeContract } from '../packages/providers/dist/index.js';
import { hashObject } from './compile-raw-art-provider-requests.mjs';

const COMPILER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'compile-raw-art-provider-runtime-batch.mjs',
);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const GAME_HEAD = 'a'.repeat(40);
const QUEUE_SHA = 'b'.repeat(64);
const CAMPAIGN_SHA = 'c'.repeat(64);
const CAMPAIGN_RUN_ID = CAMPAIGN_SHA.slice(0, 20);
const ADMISSION_SHA = 'd'.repeat(64);
const STYLE_SHA = 'e'.repeat(64);
const BINDINGS_SHA = 'f'.repeat(64);
const DIRECTION_FILE_SHA = '6'.repeat(64);
const BRIDGE_FILE_SHA = '7'.repeat(64);
const PROVIDER_MAP_FILE_SHA = '8'.repeat(64);

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(file, text, 'utf8');
  return { file, text, sha256: sha256(Buffer.from(text, 'utf8')) };
}

function sealBatch(value) {
  const batchSha256 = hashObject(value);
  return {
    ...value,
    batchSha256,
    runId: batchSha256.slice(0, 20),
  };
}

function run(args, expected = 0) {
  const result = spawnSync(process.execPath, [COMPILER, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 30_000,
  });
  if (result.status !== expected) {
    throw new Error(
      `compiler exit ${result.status}, expected ${expected}: ${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function metadata(
  campaignItemId,
  sourcePath,
  sourceSha256,
  targetPath,
  semanticRole,
) {
  return {
    schema: 'evavo.raw-art-provider-request-metadata.v2',
    gameHead: GAME_HEAD,
    queueSha256: QUEUE_SHA,
    campaignSha256: CAMPAIGN_SHA,
    campaignRunId: CAMPAIGN_RUN_ID,
    campaignItemId,
    technicalAdmissionSha256: ADMISSION_SHA,
    styleBankSha256: STYLE_SHA,
    bindingsSha256: BINDINGS_SHA,
    artDirectionFileSha256: DIRECTION_FILE_SHA,
    bridgeFileSha256: BRIDGE_FILE_SHA,
    providerMapFileSha256: PROVIDER_MAP_FILE_SHA,
    sourcePath,
    sourceSha256,
    sourceDimensions: { width: 1280, height: 720 },
    providerCanvasPolicy: 'adapter-derived-from-target',
    masteringRequired: true,
    targetPath,
    semanticRole,
    decision: 'recreate',
    approvals: {
      creative: false,
      historical: false,
      provenance: false,
      nativeRuntime: false,
      browser: false,
      publication: false,
    },
  };
}

function validRequest() {
  const campaignItemId = '1'.repeat(24);
  const sourcePath = 'RAW_ART/locations/london-docks.png';
  const sourceSha256 = '3'.repeat(64);
  const targetPath = 'assets/art/ports/london/locations/docks/base.png';
  const semanticRole = 'location-background';
  return {
    workOrderId: 'raw-art-provider-london-docks',
    campaignItemId,
    sourcePath,
    sourceSha256,
    semanticRole,
    targetPath,
    operation: 'generate',
    request: {
      schemaVersion: '1.0',
      operation: 'generate',
      assetKind: 'environment',
      continuityPhase: 'independent',
      assetId: 'london-docks',
      candidateFamilyId: 'london-docks-rain',
      creativeIntent:
        'Create one historically plausible 1871 London dock environment candidate.',
      style: {
        styleName: 'Brass and Brine engraved port',
        intent:
          'Controlled monochrome engraving with a broad readable gameplay lane.',
        mustHave: ['period shipping', 'front-on stage composition'],
        mustAvoid: ['modern containers', 'pseudo-text'],
      },
      shot: {
        subject: 'A side-stage London dock in rain.',
        include: ['complete dock lane'],
        exclude: ['modern infrastructure'],
        separateAssets: ['weather particles'],
      },
      target: {
        width: 1280,
        height: 720,
        transparency: 'opaque',
        outputFormat: 'png',
      },
      background: { strategy: 'opaque-source' },
      quality: 'high',
      candidateCount: 3,
      references: [],
      selection: {
        allowedAdapterIds: [],
        allowFallback: false,
        requireSeed: false,
      },
      metadata: metadata(
        campaignItemId,
        sourcePath,
        sourceSha256,
        targetPath,
        semanticRole,
      ),
    },
  };
}

function invalidRequest() {
  const campaignItemId = '2'.repeat(24);
  const sourcePath = 'RAW_ART/characters/sailor.png';
  const sourceSha256 = '4'.repeat(64);
  const targetPath = 'assets/art/characters/sailor/idle-down.png';
  const semanticRole = 'standing-character';
  const requestMetadata = metadata(
    campaignItemId,
    sourcePath,
    sourceSha256,
    targetPath,
    semanticRole,
  );
  requestMetadata.sourceDimensions = { width: 512, height: 512 };
  requestMetadata.decision = 'edit';
  return {
    workOrderId: 'raw-art-provider-sailor-key-pose',
    campaignItemId,
    sourcePath,
    sourceSha256,
    semanticRole,
    targetPath,
    operation: 'edit',
    request: {
      schemaVersion: '1.0',
      operation: 'edit',
      assetKind: 'sprite-frame',
      continuityPhase: 'key-pose',
      assetId: 'sailor',
      candidateFamilyId: 'sailor-idle-down',
      creativeIntent: 'Repair the sailor idle key pose without redesigning it.',
      style: {
        styleName: 'Brass and Brine standing character',
        intent: 'Stable engraved identity and controlled pixel clusters.',
      },
      shot: {
        subject: 'The established 1871 sailor identity, full body.',
      },
      target: {
        width: 512,
        height: 512,
        transparency: 'required',
        outputFormat: 'png',
      },
      background: { strategy: 'native-alpha' },
      quality: 'high',
      candidateCount: 2,
      references: [],
      selection: {
        allowedAdapterIds: [],
        allowFallback: false,
        requireSeed: false,
      },
      metadata: requestMetadata,
    },
  };
}

function requestBatch() {
  const requests = [validRequest(), invalidRequest()];
  return sealBatch({
    schema: 'evavo.raw-art-provider-request-batch.v2',
    status: 'ready',
    gameHead: GAME_HEAD,
    queueSha256: QUEUE_SHA,
    campaignSha256: CAMPAIGN_SHA,
    campaignRunId: CAMPAIGN_RUN_ID,
    technicalAdmissionSha256: ADMISSION_SHA,
    styleBankSha256: STYLE_SHA,
    bindingsSha256: BINDINGS_SHA,
    campaignNextBatchItemIds: ['1'.repeat(24), '2'.repeat(24)],
    inputBindings: {},
    maximumOrders: 25,
    maximumOrdersAuthority: 25,
    counts: {
      providerRequiredTotal: 2,
      campaignNextBatchEligible: 2,
      ready: 2,
      blocked: 0,
      deferred: 0,
      outsideCampaignNextBatch: 0,
      campaignOrBatchDeferred: 0,
    },
    requests,
    blocked: [],
    deferred: [],
    nextActions: [],
    authority: {
      providerExecution: false,
      runtimeSubmission: false,
      sourceMutation: false,
      sourceDeletion: false,
      targetRepositoryMutation: false,
      creativeApproval: false,
      historicalApproval: false,
      provenanceApproval: false,
      runtimeApproval: false,
      publication: false,
      forcePush: false,
    },
  });
}

function verifyRuntimeSelfHash(batch) {
  const unhashed = { ...batch };
  delete unhashed.runtimeBatchSha256;
  delete unhashed.runId;
  if (hashObject(unhashed) !== batch.runtimeBatchSha256) {
    throw new Error('runtime batch self hash mismatch');
  }
  if (batch.runId !== batch.runtimeBatchSha256.slice(0, 20)) {
    throw new Error('runtime batch runId mismatch');
  }
}

function main() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'evavo-raw-art-provider-runtime-'),
  );
  try {
    const input = writeJson(path.join(root, 'provider-batch.json'), requestBatch());
    const firstPath = path.join(root, 'runtime-batch-a.json');
    const secondPath = path.join(root, 'runtime-batch-b.json');
    run(['--provider-batch', input.file, '--output', firstPath]);
    run(['--provider-batch', input.file, '--output', secondPath]);
    const first = JSON.parse(fs.readFileSync(firstPath, 'utf8'));
    const second = JSON.parse(fs.readFileSync(secondPath, 'utf8'));
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error('runtime batch compilation was not deterministic');
    }
    verifyRuntimeSelfHash(first);
    if (
      first.schema !== 'evavo.raw-art-provider-runtime-batch.v1' ||
      first.status !== 'partially-ready' ||
      first.campaignSha256 !== CAMPAIGN_SHA ||
      first.technicalAdmissionSha256 !== ADMISSION_SHA ||
      first.bindingsSha256 !== BINDINGS_SHA ||
      first.counts.readyRuntimeJobs !== 1 ||
      first.counts.providerContractBlocked !== 1 ||
      first.authority.providerExecution !== false ||
      first.authority.runtimeSubmission !== false ||
      first.authority.candidatePromotion !== false
    ) {
      throw new Error('runtime batch did not retain its campaign or authority boundary');
    }
    const expected = compileProviderCandidateRuntimeContract(
      validRequest().request,
    );
    if (JSON.stringify(first.jobs[0]?.contract) !== JSON.stringify(expected)) {
      throw new Error('RAW_ART runtime job drifted from the canonical MCP contract');
    }
    if (
      first.jobs[0]?.campaignItemId !== '1'.repeat(24) ||
      first.jobs[0]?.contract.request.sourceCanvas !== undefined ||
      first.jobs[0]?.contract.runtimeJob.requiredCapabilityProfile.join(',') !==
        'cancellation,candidate-count,generate' ||
      first.jobs[0]?.contract.runtimeJob.idempotencyKey !==
        `provider:${first.jobs[0].contract.request.requestId}` ||
      first.jobs[0]?.contractSha256 !== hashObject(first.jobs[0].contract) ||
      first.jobs[0]?.runtimeJobSha256 !==
        hashObject(first.jobs[0].contract.runtimeJob)
    ) {
      throw new Error('runtime job hashes, campaign binding or capability profile are invalid');
    }
    if (
      first.providerContractBlocked[0]?.campaignItemId !== '2'.repeat(24) ||
      first.providerContractBlocked[0]?.error.code !==
        'PROVIDER_CANDIDATE_REQUEST_INVALID' ||
      !first.providerContractBlocked[0]?.error.message.includes(
        'canonical-identity',
      )
    ) {
      throw new Error('invalid provider request was not isolated correctly');
    }

    const overwrite = run(
      ['--provider-batch', input.file, '--output', firstPath],
      2,
    );
    if (!overwrite.stderr.includes('output already exists')) {
      throw new Error('create-only runtime output was not enforced');
    }

    const tampered = requestBatch();
    tampered.requests[0].targetPath = 'assets/art/tampered.png';
    const tamperedRecord = writeJson(
      path.join(root, 'tampered-batch.json'),
      tampered,
    );
    const tamperedResult = run(
      [
        '--provider-batch',
        tamperedRecord.file,
        '--output',
        path.join(root, 'tampered-output.json'),
      ],
      2,
    );
    if (!tamperedResult.stderr.includes('batchSha256 mismatch')) {
      throw new Error('tampered provider request batch was not rejected');
    }

    const reboundBase = requestBatch();
    const reboundUnsealed = { ...reboundBase };
    delete reboundUnsealed.batchSha256;
    delete reboundUnsealed.runId;
    reboundUnsealed.requests[0].request.metadata.targetPath =
      'assets/art/ports/london/locations/wrong.png';
    const rebound = sealBatch(reboundUnsealed);
    const reboundRecord = writeJson(
      path.join(root, 'rebound-batch.json'),
      rebound,
    );
    const reboundPath = path.join(root, 'rebound-output.json');
    run(['--provider-batch', reboundRecord.file, '--output', reboundPath]);
    const reboundOutput = JSON.parse(fs.readFileSync(reboundPath, 'utf8'));
    if (
      reboundOutput.status !== 'blocked' ||
      reboundOutput.counts.providerContractBlocked !== 2 ||
      !reboundOutput.providerContractBlocked.some((entry) =>
        entry.error.message.includes('metadata.targetPath'),
      )
    ) {
      throw new Error('rehashed metadata mismatch did not fail closed per item');
    }

    process.stdout.write('EVAVO RAW_ART provider runtime batch v1\n');
    process.stdout.write('- campaign v3 request-batch v2 bindings and self-hashes passed\n');
    process.stdout.write('- canonical provider validation, prompt hashes and runtime jobs passed\n');
    process.stdout.write('- invalid requests remain isolated without blocking unrelated valid jobs\n');
    process.stdout.write('- exact MCP runtime-job parity and adapter capability profiles passed\n');
    process.stdout.write('- tampered inputs and create-only output overwrite fail closed\n');
    process.stdout.write('- provider execution, runtime submission, approval and publication remain false\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
