#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LocalRuntimeRepository,
  normalizeRuntimeJobSubmission,
} from '../packages/runtime/dist/index.js';
import {
  PROVIDER_PROTOCOL_VERSION,
  compileProviderCandidateRuntimeContract,
} from '../packages/providers/dist/index.js';
import {
  RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
  compileRawArtProviderAdmittedRuntimeJob,
} from './raw-art-provider/admission.mjs';
import { hashObject } from './raw-art-provider/shared.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SELECTOR = path.join(ROOT, 'select-raw-art-provider-runtime-jobs.mjs');
const ADMITTER = path.join(ROOT, 'admit-raw-art-provider-runtime-batch.mjs');
const ADMISSION_MODULE = path.join(ROOT, 'raw-art-provider', 'admission.mjs');

const GAME_HEAD = 'a'.repeat(40);
const QUEUE_SHA = 'b'.repeat(64);
const CAMPAIGN_SHA = 'c'.repeat(64);
const CAMPAIGN_RUN_ID = CAMPAIGN_SHA.slice(0, 20);
const TECHNICAL_ADMISSION_SHA = 'd'.repeat(64);
const STYLE_SHA = 'e'.repeat(64);
const BINDINGS_SHA = 'f'.repeat(64);
const SELECTED_AT = '2026-08-09T00:00:00.000Z';
const ADMITTED_AT = '2026-08-09T00:01:00.000Z';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(file, text, 'utf8');
  return { file: path.resolve(file), fileSha256: sha256(Buffer.from(text, 'utf8')) };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function seal(value, key) {
  const digest = hashObject(value);
  return { ...value, [key]: digest, runId: digest.slice(0, 20) };
}

function run(script, args, expected = 0) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 60_000,
  });
  if (result.status !== expected) {
    throw new Error(
      `${path.basename(script)} exit ${result.status}, expected ${expected}: ${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function requestMetadata(
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

function providerRequest(number) {
  const suffix = number === 1 ? 'london-docks' : 'liverpool-docks';
  const campaignItemId = String(number).repeat(24);
  const sourcePath = `RAW_ART/locations/${suffix}.png`;
  const sourceSha256 = String(number + 2).repeat(64);
  const targetPath = `assets/art/ports/${suffix}/locations/docks/base.png`;
  const semanticRole = 'location-background';
  return {
    schemaVersion: '1.0',
    operation: 'generate',
    assetKind: 'environment',
    continuityPhase: 'independent',
    assetId: suffix,
    candidateFamilyId: `${suffix}-rain`,
    creativeIntent: `Create one historically plausible 1871 ${suffix} environment candidate.`,
    style: {
      styleName: 'Brass and Brine engraved port',
      intent: 'Controlled monochrome engraving with a broad readable gameplay lane.',
      mustHave: ['period shipping', 'front-on stage composition'],
      mustAvoid: ['modern containers', 'pseudo-text'],
    },
    shot: {
      subject: `A side-stage ${suffix} dock in rain.`,
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
    metadata: requestMetadata(
      campaignItemId,
      sourcePath,
      sourceSha256,
      targetPath,
      semanticRole,
    ),
  };
}

function runtimeEntry(number) {
  const request = providerRequest(number);
  const contract = compileProviderCandidateRuntimeContract(request);
  return {
    workOrderId: `raw-art-provider-${request.assetId}`,
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
}

function runtimeBatch() {
  const jobs = [runtimeEntry(1), runtimeEntry(2)];
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
      campaignNextBatchItemIds: jobs.map((entry) => entry.campaignItemId),
      sourceRequestBatch: {
        path: '/staging/raw-art-provider-request-batch.json',
        fileSha256: '9'.repeat(64),
        documentSha256: '0'.repeat(64),
        runId: '0'.repeat(20),
      },
      counts: {
        providerRequiredTotal: 2,
        campaignNextBatchEligible: 2,
        requestInputs: 2,
        readyRuntimeJobs: 2,
        providerContractBlocked: 0,
        upstreamBlocked: 0,
        upstreamDeferred: 0,
        outsideCampaignNextBatch: 0,
        campaignOrBatchDeferred: 0,
      },
      jobs,
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

function reseal(value, key) {
  const unsealed = structuredClone(value);
  delete unsealed[key];
  delete unsealed.runId;
  return seal(unsealed, key);
}

function verifySelfHash(value, key) {
  const unhashed = structuredClone(value);
  delete unhashed[key];
  delete unhashed.runId;
  if (hashObject(unhashed) !== value[key]) {
    throw new Error(`${key} self hash mismatch`);
  }
  if (value.runId !== value[key].slice(0, 20)) {
    throw new Error(`${key} runId mismatch`);
  }
}

async function main() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'evavo-raw-art-runtime-admission-'),
  );
  try {
    const batchPath = path.join(root, 'runtime-batch.json');
    writeJson(batchPath, runtimeBatch());
    const selectionPath = path.join(root, 'selection.json');
    const workOrders =
      'raw-art-provider-london-docks,raw-art-provider-liverpool-docks';
    run(SELECTOR, [
      '--runtime-batch',
      batchPath,
      '--work-orders',
      workOrders,
      '--selected-at',
      SELECTED_AT,
      '--selected-by',
      'art-director',
      '--reason',
      'Admit the exact campaign-v3 environment jobs for durable review-first execution.',
      '--output',
      selectionPath,
    ]);
    const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
    verifySelfHash(selection, 'selectionSha256');
    if (
      selection.schema !==
        'evavo.raw-art-provider-runtime-admission-selection.v1' ||
      selection.counts.selectedRuntimeJobs !== 2 ||
      selection.authority.runtimeSubmission !== false ||
      selection.intent.durableRuntimeAdmission !== true
    ) {
      throw new Error('selection did not preserve exact non-effect authority');
    }

    const runtimeRoot = path.join(root, 'runtime');
    const receiptPath = path.join(root, 'receipt-a.json');
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
      ADMITTED_AT,
      '--receipt',
      receiptPath,
    ]);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    verifySelfHash(receipt, 'admissionSha256');
    if (
      receipt.schema !==
        'evavo.raw-art-provider-runtime-admission-receipt.v2' ||
      receipt.status !== 'admitted' ||
      receipt.counts.admittedRuntimeJobs !== 2 ||
      receipt.authority.durableRuntimeAdmission !== true ||
      receipt.authority.runtimeSubmission !== true ||
      receipt.authority.providerExecution !== false ||
      receipt.authority.workerClaim !== false ||
      receipt.authority.deliveryPublication !== false ||
      receipt.authority.candidatePromotion !== false ||
      receipt.authority.publication !== false
    ) {
      throw new Error('admission receipt authority or counts are invalid');
    }
    if (
      receipt.executionIsolation.mode !== 'explicit-authorization-required' ||
      receipt.executionIsolation.requiredCapability !==
        RAW_ART_PROVIDER_EXECUTION_CAPABILITY ||
      receipt.executionIsolation.maximumAttempts !== 1 ||
      receipt.executionIsolation.genericProviderWorkerMayClaim !== false ||
      receipt.executionIsolation.queue !==
        `raw-art.provider.${selection.runId}`
    ) {
      throw new Error('admission receipt did not isolate provider execution');
    }

    const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
    const admittedJobs = await runtime.list({ limit: 10 });
    if (admittedJobs.length !== 2) {
      throw new Error('durable runtime did not retain exactly two admitted jobs');
    }
    const currentBatch = runtimeBatch();
    for (const [index, entry] of currentBatch.jobs.entries()) {
      const selected = {
        ...selection.jobs[index],
        batchEntry: {
          ...entry,
          runtimeJob: entry.contract.runtimeJob,
        },
      };
      const admitted = compileRawArtProviderAdmittedRuntimeJob(
        selection,
        selected,
      );
      const normalized = normalizeRuntimeJobSubmission(admitted);
      const retained = admittedJobs.find((job) => job.id === normalized.spec.id);
      if (
        !retained ||
        retained.specHash !== normalized.specHash ||
        retained.state !== 'queued' ||
        retained.attempts.length !== 0 ||
        retained.spec.queue !== receipt.executionIsolation.queue ||
        retained.spec.maximumAttempts !== 1 ||
        !retained.spec.requiredCapabilities.includes(
          RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
        ) ||
        receipt.jobs[index].admittedRuntimeJobSha256 !==
          hashObject(admitted)
      ) {
        throw new Error('admitted runtime job drifted or began execution');
      }
    }

    const replayReceiptPath = path.join(root, 'receipt-b.json');
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
      ADMITTED_AT,
      '--receipt',
      replayReceiptPath,
    ]);
    if (
      fs.readFileSync(receiptPath, 'utf8') !==
      fs.readFileSync(replayReceiptPath, 'utf8')
    ) {
      throw new Error('idempotent admission replay did not produce the exact same receipt');
    }
    if ((await runtime.list({ limit: 10 })).length !== 2) {
      throw new Error('idempotent admission replay duplicated durable jobs');
    }

    const overwrite = run(
      ADMITTER,
      [
        '--runtime-batch',
        batchPath,
        '--selection',
        selectionPath,
        '--runtime-root',
        runtimeRoot,
        '--actor',
        'raw-art-admission-agent',
        '--admitted-at',
        ADMITTED_AT,
        '--receipt',
        receiptPath,
      ],
      2,
    );
    if (!overwrite.stderr.includes('output already exists')) {
      throw new Error('create-only admission receipt was not enforced');
    }

    const staleSelection = reseal(
      {
        ...selection,
        runtimeBatchSha256: '1'.repeat(64),
      },
      'selectionSha256',
    );
    const staleSelectionPath = path.join(root, 'selection-stale.json');
    writeJson(staleSelectionPath, staleSelection);
    const staleRoot = path.join(root, 'stale-runtime');
    const stale = run(
      ADMITTER,
      [
        '--runtime-batch',
        batchPath,
        '--selection',
        staleSelectionPath,
        '--runtime-root',
        staleRoot,
        '--actor',
        'raw-art-admission-agent',
        '--admitted-at',
        ADMITTED_AT,
        '--receipt',
        path.join(root, 'stale-receipt.json'),
      ],
      2,
    );
    if (
      !stale.stderr.includes('selection is stale') ||
      fs.existsSync(staleRoot)
    ) {
      throw new Error('stale selection did not fail before runtime mutation');
    }

    const forgedSelection = structuredClone(selection);
    forgedSelection.jobs[0].runtimeJobSha256 = '2'.repeat(64);
    const forgedSelectionSealed = reseal(
      forgedSelection,
      'selectionSha256',
    );
    const forgedSelectionPath = path.join(root, 'selection-forged.json');
    writeJson(forgedSelectionPath, forgedSelectionSealed);
    const forged = run(
      ADMITTER,
      [
        '--runtime-batch',
        batchPath,
        '--selection',
        forgedSelectionPath,
        '--runtime-root',
        path.join(root, 'forged-runtime'),
        '--actor',
        'raw-art-admission-agent',
        '--admitted-at',
        ADMITTED_AT,
        '--receipt',
        path.join(root, 'forged-receipt.json'),
      ],
      2,
    );
    if (!forged.stderr.includes('does not bind the exact runtime job')) {
      throw new Error('freshly rehashed forged selection did not fail closed');
    }

    const tamperedBatch = structuredClone(runtimeBatch());
    tamperedBatch.jobs[0].contract.runtimeJob.labels.assetId = 'tampered';
    tamperedBatch.jobs[0].runtimeJobSha256 = hashObject(
      tamperedBatch.jobs[0].contract.runtimeJob,
    );
    tamperedBatch.jobs[0].contractSha256 = hashObject(
      tamperedBatch.jobs[0].contract,
    );
    const tamperedBatchSealed = reseal(
      tamperedBatch,
      'runtimeBatchSha256',
    );
    const tamperedBatchPath = path.join(root, 'runtime-batch-tampered.json');
    writeJson(tamperedBatchPath, tamperedBatchSealed);
    const tampered = run(
      SELECTOR,
      [
        '--runtime-batch',
        tamperedBatchPath,
        '--work-orders',
        'raw-art-provider-london-docks',
        '--selected-at',
        SELECTED_AT,
        '--selected-by',
        'art-director',
        '--reason',
        'This forged batch must not be selectable.',
        '--output',
        path.join(root, 'tampered-selection.json'),
      ],
      2,
    );
    if (!tampered.stderr.includes('not the canonical provider runtime contract')) {
      throw new Error('freshly rehashed forged runtime contract did not fail closed');
    }

    const earlyRoot = path.join(root, 'early-runtime');
    const early = run(
      ADMITTER,
      [
        '--runtime-batch',
        batchPath,
        '--selection',
        selectionPath,
        '--runtime-root',
        earlyRoot,
        '--actor',
        'raw-art-admission-agent',
        '--admitted-at',
        '2026-08-08T23:59:59.000Z',
        '--receipt',
        path.join(root, 'early-receipt.json'),
      ],
      2,
    );
    if (!early.stderr.includes('may not precede selectedAt') || fs.existsSync(earlyRoot)) {
      throw new Error('invalid admission time mutated the runtime root');
    }

    const conflictRoot = path.join(root, 'conflict-runtime');
    const conflictRuntime = new LocalRuntimeRepository({ root: conflictRoot });
    const conflictBatch = runtimeBatch();
    const conflictSelectionJob = {
      ...selection.jobs[1],
      batchEntry: conflictBatch.jobs[1],
    };
    const conflictJob = structuredClone(
      compileRawArtProviderAdmittedRuntimeJob(
        selection,
        conflictSelectionJob,
      ),
    );
    conflictJob.labels = { ...conflictJob.labels, continuityPhase: 'conflict' };
    await conflictRuntime.submit(
      conflictJob,
      'conflict-fixture',
      new Date(ADMITTED_AT),
    );
    const conflictReceipt = path.join(root, 'conflict-receipt.json');
    const conflict = run(
      ADMITTER,
      [
        '--runtime-batch',
        batchPath,
        '--selection',
        selectionPath,
        '--runtime-root',
        conflictRoot,
        '--actor',
        'raw-art-admission-agent',
        '--admitted-at',
        ADMITTED_AT,
        '--receipt',
        conflictReceipt,
      ],
      2,
    );
    if (
      !conflict.stderr.includes('Idempotency key already belongs') ||
      fs.existsSync(conflictReceipt)
    ) {
      throw new Error('runtime idempotency conflict did not fail without a receipt');
    }
    const conflictJobs = await conflictRuntime.list({ limit: 10 });
    if (conflictJobs.length !== 1) {
      throw new Error('failed batch admission was not atomic');
    }

    const source = fs.readFileSync(ADMISSION_MODULE, 'utf8');
    for (const forbidden of [
      'RuntimeWorker',
      'PgBossRuntimeDelivery',
      'executeProviderCandidateRequest',
      'provider.generate(',
      'fetch(',
      'candidatePromotion: true',
      'publication: true',
    ]) {
      if (source.includes(forbidden)) {
        throw new Error(`admission module crossed its authority boundary: ${forbidden}`);
      }
    }

    process.stdout.write('EVAVO RAW_ART durable runtime admission v1\n');
    process.stdout.write('- exact runtime-batch and explicit selection binding passed\n');
    process.stdout.write('- atomic durable submission and immutable job identity passed\n');
    process.stdout.write('- idempotent replay produced an identical receipt without duplicate jobs\n');
    process.stdout.write('- stale, forged and re-fingerprinted inputs failed before effects\n');
    process.stdout.write('- idempotency conflicts rolled back the complete selected batch\n');
    process.stdout.write('- provider execution, worker claim, promotion and publication remain separate\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
