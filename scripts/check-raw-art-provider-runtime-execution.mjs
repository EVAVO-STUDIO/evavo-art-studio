#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import {
  FixtureImageProviderAdapter,
  PROVIDER_PROTOCOL_VERSION,
  ProviderRegistry,
  compileProviderCandidateRuntimeContract,
} from '../packages/providers/dist/index.js';
import {
  LocalRuntimeRepository,
  RuntimeWorker,
} from '../packages/runtime/dist/index.js';
import {
  RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
  createProviderHandlers,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
} from '../apps/worker/dist/provider-handlers.js';
import { hashObject } from './raw-art-provider/shared.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SELECTOR = path.join(ROOT, 'select-raw-art-provider-runtime-jobs.mjs');
const ADMITTER = path.join(ROOT, 'admit-raw-art-provider-runtime-batch.mjs');
const AUTHORIZER = path.join(
  ROOT,
  'authorize-raw-art-provider-runtime-execution.mjs',
);
const EXECUTOR = path.join(ROOT, 'run-authorized-raw-art-provider-worker.mjs');
const EXECUTION_MODULE = path.join(ROOT, 'raw-art-provider', 'execution.mjs');
const PROVIDER_HANDLERS = path.join(
  path.dirname(ROOT),
  'apps',
  'worker',
  'src',
  'provider-handlers.ts',
);

const GAME_HEAD = 'a'.repeat(40);
const QUEUE_SHA = 'b'.repeat(64);
const CAMPAIGN_SHA = 'c'.repeat(64);
const CAMPAIGN_RUN_ID = CAMPAIGN_SHA.slice(0, 20);
const TECHNICAL_ADMISSION_SHA = 'd'.repeat(64);
const STYLE_SHA = 'e'.repeat(64);
const BINDINGS_SHA = 'f'.repeat(64);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(file, text, 'utf8');
  return {
    file: path.resolve(file),
    text,
    fileSha256: sha256(Buffer.from(text, 'utf8')),
  };
}

function seal(value, key) {
  const digest = hashObject(value);
  return { ...value, [key]: digest, runId: digest.slice(0, 20) };
}

function reseal(value, key) {
  const copy = structuredClone(value);
  delete copy[key];
  delete copy.runId;
  return seal(copy, key);
}

function verifySelfHash(value, key) {
  const copy = structuredClone(value);
  delete copy[key];
  delete copy.runId;
  assert.equal(hashObject(copy), value[key], `${key} self hash mismatch`);
  assert.equal(value.runId, value[key].slice(0, 20), `${key} runId mismatch`);
}

function run(script, args, expected = 0, environment = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 120_000,
    env: environment,
  });
  if (result.status !== expected) {
    throw new Error(
      `${path.basename(script)} exit ${result.status}, expected ${expected}: ${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function requestMetadata(campaignItemId, sourcePath, sourceSha256, targetPath) {
  return {
    schema: 'evavo.raw-art-provider-request-metadata.v2',
    gameHead: GAME_HEAD,
    queueSha256: QUEUE_SHA,
    campaignSha256: CAMPAIGN_SHA,
    campaignRunId: CAMPAIGN_RUN_ID,
    campaignItemId,
    technicalAdmissionSha256: TECHNICAL_ADMISSION_SHA,
    styleBankSha256: STYLE_SHA,
    bindingsSha256: BINDINGS_SHA,
    artDirectionFileSha256: '6'.repeat(64),
    bridgeFileSha256: '7'.repeat(64),
    providerMapFileSha256: '8'.repeat(64),
    sourcePath,
    sourceSha256,
    sourceDimensions: { width: 1280, height: 720 },
    providerCanvasPolicy: 'adapter-derived-from-target',
    masteringRequired: true,
    targetPath,
    semanticRole: 'location-background',
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

function providerRequest() {
  const campaignItemId = '1'.repeat(24);
  const sourcePath = 'RAW_ART/locations/london-docks.png';
  const sourceSha256 = '3'.repeat(64);
  const targetPath = 'assets/art/ports/london/locations/docks/base.png';
  return {
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
      intent: 'Controlled monochrome engraving with a broad readable gameplay lane.',
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
    candidateCount: 1,
    references: [],
    selection: {
      allowedAdapterIds: ['fixture-image'],
      allowFallback: false,
      requireSeed: false,
    },
    metadata: requestMetadata(
      campaignItemId,
      sourcePath,
      sourceSha256,
      targetPath,
    ),
  };
}

function runtimeBatch() {
  const request = providerRequest();
  const contract = compileProviderCandidateRuntimeContract(request);
  const job = {
    workOrderId: 'raw-art-provider-london-docks',
    campaignItemId: request.metadata.campaignItemId,
    sourcePath: request.metadata.sourcePath,
    sourceSha256: request.metadata.sourceSha256,
    semanticRole: request.metadata.semanticRole,
    targetPath: request.metadata.targetPath,
    operation: request.operation,
    contract,
    contractSha256: hashObject(contract),
    runtimeJobSha256: hashObject(contract.runtimeJob),
  };
  return seal(
    {
      schema: 'evavo.raw-art-provider-runtime-batch.v1',
      status: 'ready',
      providerProtocolVersion: PROVIDER_PROTOCOL_VERSION,
      gameHead: GAME_HEAD,
      queueSha256: QUEUE_SHA,
      campaignSha256: CAMPAIGN_SHA,
      campaignRunId: CAMPAIGN_RUN_ID,
      technicalAdmissionSha256: TECHNICAL_ADMISSION_SHA,
      styleBankSha256: STYLE_SHA,
      bindingsSha256: BINDINGS_SHA,
      campaignNextBatchItemIds: [job.campaignItemId],
      sourceRequestBatch: {
        path: '/staging/raw-art-provider-request-batch.json',
        fileSha256: '9'.repeat(64),
        documentSha256: '0'.repeat(64),
        runId: '0'.repeat(20),
      },
      counts: {
        providerRequiredTotal: 1,
        campaignNextBatchEligible: 1,
        requestInputs: 1,
        readyRuntimeJobs: 1,
        providerContractBlocked: 0,
        upstreamBlocked: 0,
        upstreamDeferred: 0,
        outsideCampaignNextBatch: 0,
        campaignOrBatchDeferred: 0,
      },
      jobs: [job],
      providerContractBlocked: [],
      upstreamBlocked: [],
      upstreamDeferred: [],
      nextActions: [],
      authority: {
        providerExecution: false,
        runtimeSubmission: false,
        sourceMutation: false,
        sourceDeletion: false,
        targetRepositoryMutation: false,
        candidatePromotion: false,
        creativeApproval: false,
        historicalApproval: false,
        provenanceApproval: false,
        runtimeApproval: false,
        publication: false,
        forcePush: false,
      },
    },
    'runtimeBatchSha256',
  );
}

async function main() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'evavo-raw-art-runtime-execution-'),
  );
  try {
    const now = Date.now();
    const selectedAt = new Date(now - 180_000).toISOString();
    const admittedAt = new Date(now - 120_000).toISOString();
    const authorizedAt = new Date(now - 60_000).toISOString();
    const expiresAt = new Date(now + 15 * 60_000).toISOString();
    const expiredAt = new Date(now - 120_000).toISOString();
    const expiredEnd = new Date(now - 60_000).toISOString();
    const batchPath = path.join(root, 'runtime-batch.json');
    const selectionPath = path.join(root, 'selection.json');
    const receiptPath = path.join(root, 'admission-receipt.json');
    const runtimeRoot = path.join(root, 'runtime');
    const artifactRoot = path.join(root, 'artifacts');
    writeJson(batchPath, runtimeBatch());

    run(SELECTOR, [
      '--runtime-batch',
      batchPath,
      '--work-orders',
      'raw-art-provider-london-docks',
      '--selected-at',
      selectedAt,
      '--selected-by',
      'art-director',
      '--reason',
      'Select the exact fixture-backed RAW_ART job for execution-boundary validation.',
      '--output',
      selectionPath,
    ]);
    run(ADMITTER, [
      '--runtime-batch',
      batchPath,
      '--selection',
      selectionPath,
      '--runtime-root',
      runtimeRoot,
      '--actor',
      'raw-art-admission-agent',
      '--admitted-at',
      admittedAt,
      '--receipt',
      receiptPath,
    ]);
    const admissionReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    verifySelfHash(admissionReceipt, 'admissionSha256');
    assert.equal(
      admissionReceipt.executionIsolation.requiredCapability,
      RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
    );
    assert.equal(admissionReceipt.executionIsolation.maximumAttempts, 1);

    const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
    const admitted = await runtime.get(admissionReceipt.jobs[0].jobId);
    assert.ok(admitted);
    assert.equal(admitted.state, 'queued');
    assert.equal(admitted.spec.queue, admissionReceipt.executionIsolation.queue);

    const registry = new ProviderRegistry([new FixtureImageProviderAdapter()]);
    const genericWorker = new RuntimeWorker({
      runtime,
      artifacts: new LocalArtifactStore({ root: artifactRoot }),
      worker: {
        id: 'generic-provider-worker',
        capabilities: providerWorkerCapabilities(registry),
        capabilityProfiles: providerWorkerCapabilityProfiles(registry),
        queues: [admitted.spec.queue],
      },
      handlers: createProviderHandlers(registry),
    });
    const genericRun = await genericWorker.runOnce();
    assert.equal(genericRun.claimed, 0);
    assert.equal((await runtime.get(admitted.id)).state, 'queued');

    const expiredAuthorizationPath = path.join(root, 'authorization-expired.json');
    run(AUTHORIZER, [
      '--runtime-batch',
      batchPath,
      '--selection',
      selectionPath,
      '--admission-receipt',
      receiptPath,
      '--runtime-root',
      runtimeRoot,
      '--artifact-root',
      artifactRoot,
      '--authorized-at',
      expiredAt,
      '--expires-at',
      expiredEnd,
      '--authorized-by',
      'fixture-execution-authority',
      '--reason',
      'This expired authorization must fail before worker claim.',
      '--allowed-adapters',
      'fixture-image',
      '--output',
      expiredAuthorizationPath,
    ]);
    const expired = run(
      EXECUTOR,
      [
        '--authorization',
        expiredAuthorizationPath,
        '--worker-id',
        'raw-art-expired-worker',
        '--command',
        'until-idle',
        '--receipt',
        path.join(root, 'expired-execution-receipt.json'),
      ],
      2,
      { ...process.env, EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    );
    assert.match(expired.stderr, /not currently active/u);
    assert.equal((await runtime.get(admitted.id)).state, 'queued');

    const wrongAdapterPath = path.join(root, 'authorization-wrong-adapter.json');
    run(AUTHORIZER, [
      '--runtime-batch',
      batchPath,
      '--selection',
      selectionPath,
      '--admission-receipt',
      receiptPath,
      '--runtime-root',
      runtimeRoot,
      '--artifact-root',
      artifactRoot,
      '--authorized-at',
      authorizedAt,
      '--expires-at',
      expiresAt,
      '--authorized-by',
      'fixture-execution-authority',
      '--reason',
      'An unavailable adapter must fail before worker claim.',
      '--allowed-adapters',
      'unavailable-adapter',
      '--output',
      wrongAdapterPath,
    ]);
    const wrongAdapter = run(
      EXECUTOR,
      [
        '--authorization',
        wrongAdapterPath,
        '--worker-id',
        'raw-art-wrong-adapter-worker',
        '--command',
        'until-idle',
        '--receipt',
        path.join(root, 'wrong-adapter-execution-receipt.json'),
      ],
      2,
      { ...process.env, EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    );
    assert.match(wrongAdapter.stderr, /unavailable adapters/u);
    assert.equal((await runtime.get(admitted.id)).state, 'queued');

    const authorizationPath = path.join(root, 'authorization.json');
    run(AUTHORIZER, [
      '--runtime-batch',
      batchPath,
      '--selection',
      selectionPath,
      '--admission-receipt',
      receiptPath,
      '--runtime-root',
      runtimeRoot,
      '--artifact-root',
      artifactRoot,
      '--authorized-at',
      authorizedAt,
      '--expires-at',
      expiresAt,
      '--authorized-by',
      'fixture-execution-authority',
      '--reason',
      'Authorize one exact fixture provider attempt for boundary validation.',
      '--allowed-adapters',
      'fixture-image',
      '--output',
      authorizationPath,
    ]);
    const authorization = JSON.parse(fs.readFileSync(authorizationPath, 'utf8'));
    verifySelfHash(authorization, 'authorizationSha256');
    assert.equal(authorization.authority.providerExecution, true);
    assert.equal(authorization.authority.candidateApproval, false);
    assert.equal(authorization.execution.maximumAttempts, 1);
    assert.deepEqual(authorization.allowedAdapterIds, ['fixture-image']);

    const forged = structuredClone(authorization);
    forged.jobs[0].specSha256 = '4'.repeat(64);
    const forgedSealed = reseal(forged, 'authorizationSha256');
    const forgedPath = path.join(root, 'authorization-forged.json');
    writeJson(forgedPath, forgedSealed);
    const forgedResult = run(
      EXECUTOR,
      [
        '--authorization',
        forgedPath,
        '--worker-id',
        'raw-art-forged-worker',
        '--command',
        'until-idle',
        '--receipt',
        path.join(root, 'forged-execution-receipt.json'),
      ],
      2,
      { ...process.env, EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    );
    assert.match(forgedResult.stderr, /does not bind the exact admitted job/u);
    assert.equal((await runtime.get(admitted.id)).state, 'queued');

    const overwrite = run(
      AUTHORIZER,
      [
        '--runtime-batch',
        batchPath,
        '--selection',
        selectionPath,
        '--admission-receipt',
        receiptPath,
        '--runtime-root',
        runtimeRoot,
        '--artifact-root',
        artifactRoot,
        '--authorized-at',
        authorizedAt,
        '--expires-at',
        expiresAt,
        '--authorized-by',
        'fixture-execution-authority',
        '--reason',
        'Overwrite must remain forbidden.',
        '--allowed-adapters',
        'fixture-image',
        '--output',
        authorizationPath,
      ],
      2,
    );
    assert.match(overwrite.stderr, /output already exists/u);

    const executionReceiptPath = path.join(root, 'execution-receipt.json');
    run(
      EXECUTOR,
      [
        '--authorization',
        authorizationPath,
        '--worker-id',
        'raw-art-authorized-fixture-worker',
        '--command',
        'until-idle',
        '--concurrency',
        '1',
        '--receipt',
        executionReceiptPath,
      ],
      0,
      { ...process.env, EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    );
    const executionReceipt = JSON.parse(
      fs.readFileSync(executionReceiptPath, 'utf8'),
    );
    verifySelfHash(executionReceipt, 'executionSha256');
    assert.equal(
      executionReceipt.schema,
      'evavo.raw-art-provider-runtime-execution-receipt.v1',
    );
    assert.equal(executionReceipt.status, 'succeeded');
    assert.equal(executionReceipt.counts.succeededRuntimeJobs, 1);
    assert.equal(executionReceipt.counts.failedRuntimeJobs, 0);
    assert.equal(executionReceipt.authority.providerExecution, true);
    assert.equal(executionReceipt.authority.candidateApproval, false);
    assert.equal(executionReceipt.authority.candidatePromotion, false);
    assert.equal(executionReceipt.authority.publication, false);
    assert.deepEqual(
      executionReceipt.providerAdapters.map((entry) => entry.id),
      ['fixture-image'],
    );
    const completed = await runtime.get(admitted.id);
    assert.equal(completed.state, 'succeeded');
    assert.equal(completed.attempts.length, 1);
    assert.equal(completed.redriveCount, 0);
    assert.ok(completed.outputArtifacts.length >= 3);
    const outputEvidence = executionReceipt.jobs[0].outputArtifacts;
    const candidates = outputEvidence.filter(
      (entry) => entry.artifactRole === 'provider-candidate',
    );
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].storageClass, 'intermediate');
    assert.equal(candidates[0].approvalState, 'unapproved');
    assert.ok(
      outputEvidence.some(
        (entry) => entry.artifactRole === 'provider-candidate-evidence',
      ),
    );

    const replay = run(
      EXECUTOR,
      [
        '--authorization',
        authorizationPath,
        '--worker-id',
        'raw-art-replay-worker',
        '--command',
        'until-idle',
        '--receipt',
        path.join(root, 'replay-execution-receipt.json'),
      ],
      2,
      { ...process.env, EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    );
    assert.match(replay.stderr, /no longer an exact unstarted admission/u);
    assert.equal((await runtime.get(admitted.id)).attempts.length, 1);

    const executionSource = fs.readFileSync(EXECUTION_MODULE, 'utf8');
    const handlerSource = fs.readFileSync(PROVIDER_HANDLERS, 'utf8');
    for (const required of [
      'RAW_ART_PROVIDER_RUNTIME_EXECUTION_AUTHORIZATION_SCHEMA',
      'validateRawArtProviderRuntimeExecutionAuthorization',
      'verifyRawArtProviderExecutionRuntimeState',
      'createRawArtProviderExecutionAuthorizer',
      'RAW_ART_PROVIDER_EXECUTION_UNAUTHORIZED',
      'requireRawArtExecutionAuthorization',
      'restrictProviderRegistry',
    ]) {
      if (!`${executionSource}\n${handlerSource}`.includes(required)) {
        throw new Error(`RAW_ART provider execution source lacks ${required}`);
      }
    }
    for (const forbidden of [
      'candidateApproval: true',
      'candidatePromotion: true',
      'targetRepositoryMutation: true',
      'publication: true',
      'forcePush: true',
    ]) {
      if (`${executionSource}\n${handlerSource}`.includes(forbidden)) {
        throw new Error(`RAW_ART provider execution crossed authority: ${forbidden}`);
      }
    }

    process.stdout.write('EVAVO RAW_ART provider execution authorization v1\n');
    process.stdout.write('- isolated queue and dedicated capability prevented generic worker claims\n');
    process.stdout.write('- exact admission, runtime, adapter and expiry authorization passed\n');
    process.stdout.write('- expired, unavailable, forged and replayed execution failed closed\n');
    process.stdout.write('- fixture provider execution retained immutable unapproved candidates and evidence\n');
    process.stdout.write('- approval, promotion, repository mutation and publication remain false\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
