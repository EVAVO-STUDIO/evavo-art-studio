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
  PROVIDER_PROTOCOL_VERSION,
  compileProviderCandidateRuntimeContract,
} from '../packages/providers/dist/index.js';
import { LocalRuntimeRepository } from '../packages/runtime/dist/index.js';
import { hashObject } from './raw-art-provider/shared.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SELECTOR = path.join(ROOT, 'select-raw-art-provider-runtime-jobs.mjs');
const ADMITTER = path.join(ROOT, 'admit-raw-art-provider-runtime-batch.mjs');
const AUTHORIZER = path.join(
  ROOT,
  'authorize-raw-art-provider-runtime-execution.mjs',
);
const EXECUTOR = path.join(ROOT, 'run-authorized-raw-art-provider-worker.mjs');
const REVIEW_COMPILER = path.join(
  ROOT,
  'compile-raw-art-provider-review-plan.mjs',
);
const REVIEW_MODULE = path.join(ROOT, 'raw-art-provider', 'review.mjs');
const REVIEW_DOC = path.join(
  path.dirname(ROOT),
  'docs',
  'RAW_ART_PROVIDER_REVIEW_AND_REPAIR.md',
);
const REVIEW_WORKFLOW = path.join(
  path.dirname(ROOT),
  '.github',
  'workflows',
  'raw-art-provider-review.yml',
);

const GAME_HEAD = 'a'.repeat(40);
const QUEUE_SHA = 'b'.repeat(64);
const CAMPAIGN_SHA = 'c'.repeat(64);
const CAMPAIGN_RUN_ID = CAMPAIGN_SHA.slice(0, 20);
const TECHNICAL_ADMISSION_SHA = 'd'.repeat(64);
const STYLE_SHA = 'e'.repeat(64);
const BINDINGS_SHA = 'f'.repeat(64);
const REVIEW_GATE_NAMES = [
  'technical',
  'styleConsistency',
  'identityContinuity',
  'animationContinuity',
  'historicalAccuracy',
  'composition',
  'gameplayReadability',
  'runtimeReadiness',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(file, text, 'utf8');
  return {
    path: path.resolve(file),
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
    timeout: 180_000,
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
      'Create historically plausible 1871 London dock environment candidates.',
    style: {
      styleName: 'Brass and Brine engraved port',
      intent: 'Controlled monochrome engraving with a broad readable gameplay lane.',
      mustHave: ['period shipping', 'front-on stage composition'],
      mustAvoid: ['modern containers', 'pseudo-text'],
      identityLocks: [],
      palette: ['black', 'white'],
      lineTreatment: ['engraved hatching'],
      materials: ['timber', 'iron', 'stone'],
      cameraRules: ['front-on side-stage'],
      compositionRules: ['clear lower gameplay lane'],
      eraRules: ['historically plausible 1871 detail'],
    },
    shot: {
      subject: 'A side-stage London dock in rain.',
      include: ['complete dock lane'],
      exclude: ['modern infrastructure'],
      separateAssets: ['weather particles'],
      framing: ['widescreen gameplay plate'],
    },
    target: {
      width: 1280,
      height: 720,
      transparency: 'opaque',
      outputFormat: 'png',
    },
    background: { strategy: 'opaque-source' },
    quality: 'high',
    candidateCount: 7,
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

function gates(failed = []) {
  return Object.fromEntries(
    REVIEW_GATE_NAMES.map((gate) => [gate, failed.includes(gate) ? 'fail' : 'pass']),
  );
}

function defect(id, summary) {
  return {
    id,
    severity: 'major',
    summary,
    evidenceArtifactIds: [],
  };
}

function reviewAuthority() {
  return {
    reviewCompilation: false,
    providerExecution: false,
    runtimeSubmission: false,
    candidateApproval: false,
    candidatePromotion: false,
    targetRepositoryMutation: false,
    publication: false,
  };
}

function reviewCandidate(output, candidateIndex, decision, maskArtifactId) {
  const base = {
    jobId: 'raw-art:placeholder',
    providerRequestId: 'provider_placeholder',
    artifactId: output.artifactId,
    contentHash: output.contentHash,
    candidateIndex,
    decision,
    reason: `Fixture review decision ${decision} for candidate ${candidateIndex}.`,
    confidence: 0.91,
    strengths: decision === 'keep' ? ['strong composition'] : [],
    preserve: decision === 'keep' ? ['broad readable lane'] : ['period dock geometry'],
    change: [],
    avoid: [],
    defects: [],
    evidenceArtifactIds: [],
    gates: gates(),
  };
  if (['edit', 'recreate', 'generate-variation'].includes(decision)) {
    base.gates = gates(['styleConsistency']);
    base.defects = [defect(`fixture-${candidateIndex}`, 'Style treatment needs a bounded revision.')];
    base.change = ['restore the exact engraved line treatment'];
    base.avoid = ['soft painterly edges'];
    base.candidateCount = 2;
    base.allowedAdapterIds = ['fixture-image'];
  }
  if (decision === 'reference-only') {
    base.gates = gates(['runtimeReadiness']);
    base.defects = [defect(`fixture-${candidateIndex}`, 'Useful reference but not runtime ready.')];
  }
  if (decision === 'reject') {
    base.gates = gates(['technical']);
    base.defects = [defect(`fixture-${candidateIndex}`, 'Candidate is unsuitable for continued production.')];
  }
  if (maskArtifactId) base.maskArtifactId = maskArtifactId;
  return base;
}

function compileReview(args, expected = 0) {
  return run(REVIEW_COMPILER, args, expected);
}

async function main() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'evavo-raw-art-provider-review-'),
  );
  try {
    const now = Date.now();
    const selectedAt = new Date(now - 240_000).toISOString();
    const admittedAt = new Date(now - 180_000).toISOString();
    const authorizedAt = new Date(now - 120_000).toISOString();
    const expiresAt = new Date(now + 20 * 60_000).toISOString();
    const reviewedAt = new Date(now - 30_000).toISOString();
    const compiledAt = new Date(now - 10_000).toISOString();
    const batchPath = path.join(root, 'runtime-batch.json');
    const selectionPath = path.join(root, 'selection.json');
    const admissionPath = path.join(root, 'admission-receipt.json');
    const authorizationPath = path.join(root, 'authorization.json');
    const executionPath = path.join(root, 'execution-receipt.json');
    const reviewPath = path.join(root, 'review-decisions.json');
    const planPath = path.join(root, 'review-plan.json');
    const runtimeRoot = path.join(root, 'runtime');
    const artifactRoot = path.join(root, 'artifacts');
    writeJson(batchPath, runtimeBatch());

    run(SELECTOR, [
      '--runtime-batch', batchPath,
      '--work-orders', 'raw-art-provider-london-docks',
      '--selected-at', selectedAt,
      '--selected-by', 'art-director',
      '--reason', 'Select the exact fixture-backed RAW_ART job for review-loop validation.',
      '--output', selectionPath,
    ]);
    run(ADMITTER, [
      '--runtime-batch', batchPath,
      '--selection', selectionPath,
      '--runtime-root', runtimeRoot,
      '--actor', 'raw-art-admission-agent',
      '--admitted-at', admittedAt,
      '--receipt', admissionPath,
    ]);
    run(AUTHORIZER, [
      '--runtime-batch', batchPath,
      '--selection', selectionPath,
      '--admission-receipt', admissionPath,
      '--runtime-root', runtimeRoot,
      '--artifact-root', artifactRoot,
      '--authorized-at', authorizedAt,
      '--expires-at', expiresAt,
      '--authorized-by', 'fixture-execution-authority',
      '--reason', 'Authorize one exact fixture provider attempt for candidate review validation.',
      '--allowed-adapters', 'fixture-image',
      '--output', authorizationPath,
    ]);
    run(
      EXECUTOR,
      [
        '--authorization', authorizationPath,
        '--worker-id', 'raw-art-review-fixture-worker',
        '--command', 'until-idle',
        '--concurrency', '1',
        '--receipt', executionPath,
      ],
      0,
      { ...process.env, EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    );

    const executionText = fs.readFileSync(executionPath, 'utf8');
    const execution = JSON.parse(executionText);
    verifySelfHash(execution, 'executionSha256');
    assert.equal(execution.status, 'succeeded');
    const job = execution.jobs[0];
    const candidateOutputs = job.outputArtifacts
      .filter((entry) => entry.artifactRole === 'provider-candidate');
    assert.equal(candidateOutputs.length, 7);

    const artifacts = new LocalArtifactStore({ root: artifactRoot });
    const candidates = [];
    for (const output of candidateOutputs) {
      const descriptor = await artifacts.get(output.artifactId);
      assert.ok(descriptor);
      const candidateIndex = Number(descriptor.labels.candidateIndex);
      assert.ok(Number.isSafeInteger(candidateIndex));
      candidates.push({ ...output, candidateIndex });
    }
    candidates.sort((left, right) => left.candidateIndex - right.candidateIndex);
    assert.deepEqual(
      candidates.map((entry) => entry.candidateIndex),
      [1, 2, 3, 4, 5, 6, 7],
    );

    const maskBytes = await artifacts.read(candidates[2].artifactId);
    const mask = await artifacts.put(maskBytes, {
      mediaType: 'image/png',
      storageClass: 'evidence',
      fileName: 'candidate-03.review-mask.png',
      sourceArtifacts: [candidates[2].artifactId],
      labels: {
        artifactRole: 'review-repair-mask',
        approvalState: 'evidence-only',
      },
      metadata: { fixture: true },
    });

    const decisions = [
      reviewCandidate(candidates[0], candidates[0].candidateIndex, 'keep'),
      reviewCandidate(candidates[1], candidates[1].candidateIndex, 'edit'),
      reviewCandidate(
        candidates[2],
        candidates[2].candidateIndex,
        'edit',
        mask.artifactId,
      ),
      reviewCandidate(candidates[3], candidates[3].candidateIndex, 'recreate'),
      reviewCandidate(
        candidates[4],
        candidates[4].candidateIndex,
        'generate-variation',
      ),
      reviewCandidate(
        candidates[5],
        candidates[5].candidateIndex,
        'reference-only',
      ),
      reviewCandidate(candidates[6], candidates[6].candidateIndex, 'reject'),
    ];
    for (const decision of decisions) {
      decision.jobId = job.jobId;
      decision.providerRequestId = job.providerRequestId;
    }
    const executionFileSha256 = sha256(Buffer.from(executionText, 'utf8'));
    const review = {
      schema: 'evavo.raw-art-provider-candidate-review-decisions.v1',
      status: 'reviewed',
      reviewedAt,
      reviewedBy: 'fixture-art-reviewer',
      reviewMode: 'agent-assisted',
      sourceExecutionReceipt: {
        path: path.resolve(executionPath),
        fileSha256: executionFileSha256,
        documentSha256: execution.executionSha256,
        runId: execution.runId,
      },
      candidates: decisions,
      authority: reviewAuthority(),
    };
    writeJson(reviewPath, review);

    const reviewArgs = [
      '--authorization', authorizationPath,
      '--execution-receipt', executionPath,
      '--review-decisions', reviewPath,
      '--compiled-at', compiledAt,
      '--output', planPath,
    ];
    compileReview(reviewArgs);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    verifySelfHash(plan, 'reviewPlanSha256');
    assert.equal(plan.status, 'review-complete-repair-ready');
    assert.deepEqual(plan.counts, {
      candidates: 7,
      keep: 1,
      edit: 2,
      recreate: 1,
      generateVariation: 1,
      referenceOnly: 1,
      reject: 1,
      repairRequests: 4,
      generateRequests: 1,
      editRequests: 2,
      inpaintRequests: 1,
    });
    assert.equal(plan.authority.providerExecution, false);
    assert.equal(plan.authority.runtimeSubmission, false);
    assert.equal(plan.authority.candidateApproval, false);
    assert.equal(plan.authority.candidatePromotion, false);
    assert.equal(plan.authority.targetRepositoryMutation, false);
    assert.equal(plan.authority.publication, false);

    const byDecision = new Map(
      plan.repairRequests.map((entry) => [entry.decision, entry]),
    );
    const editRepairs = plan.repairRequests.filter((entry) => entry.decision === 'edit');
    assert.equal(editRepairs.length, 2);
    assert.equal(editRepairs.find((entry) => entry.operation === 'edit').request.operation, 'edit');
    const inpaint = editRepairs.find((entry) => entry.operation === 'inpaint');
    assert.ok(inpaint);
    assert.equal(
      inpaint.request.references.find((entry) => entry.role === 'mask').artifactId,
      mask.artifactId,
    );
    assert.equal(byDecision.get('recreate').operation, 'generate');
    assert.equal(byDecision.get('generate-variation').operation, 'edit');
    for (const repair of plan.repairRequests) {
      assert.deepEqual(repair.request.selection.allowedAdapterIds, ['fixture-image']);
      assert.equal(repair.request.selection.allowFallback, false);
      assert.equal(repair.requiresFreshAdmission, true);
      assert.equal(repair.requiresFreshExecutionAuthorization, true);
      assert.equal(repair.request.metadata.reviewRepair.independentApprovalPerformed, false);
      assert.equal(repair.contract.requestSha256, repair.requestSha256);
      verifySelfHash(
        {
          probe: 'noop',
          digest: hashObject({ probe: 'noop' }),
          runId: hashObject({ probe: 'noop' }).slice(0, 20),
        },
        'digest',
      );
    }
    const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
    assert.equal((await runtime.list({ limit: 50 })).length, 1);

    const overwrite = compileReview(reviewArgs, 2);
    assert.match(overwrite.stderr, /output already exists/u);

    const attacks = [];
    function attack(name, mutate, expectedMessage) {
      const attacked = structuredClone(review);
      mutate(attacked);
      const source = path.join(root, `${name}.review.json`);
      const output = path.join(root, `${name}.plan.json`);
      writeJson(source, attacked);
      const result = compileReview([
        '--authorization', authorizationPath,
        '--execution-receipt', executionPath,
        '--review-decisions', source,
        '--compiled-at', compiledAt,
        '--output', output,
      ], 2);
      assert.match(result.stderr, expectedMessage, name);
      assert.equal(fs.existsSync(output), false, `${name} wrote output before failure`);
      attacks.push(name);
    }

    attack(
      'missing-candidate',
      (value) => value.candidates.pop(),
      /cover every exact candidate once/u,
    );
    attack(
      'changed-content-hash',
      (value) => { value.candidates[0].contentHash = `sha256:${'0'.repeat(64)}`; },
      /does not bind the exact immutable candidate/u,
    );
    attack(
      'keep-with-failure',
      (value) => { value.candidates[0].gates.technical = 'fail'; },
      /keep decisions cannot carry failures/u,
    );
    attack(
      'authority-escalation',
      (value) => { value.authority.candidateApproval = true; },
      /authority must be entirely false/u,
    );
    attack(
      'unauthorized-adapter',
      (value) => { value.candidates[1].allowedAdapterIds = ['unavailable-adapter']; },
      /no exact authorized adapter intersection/u,
    );
    attack(
      'duplicate-candidate',
      (value) => { value.candidates[1] = structuredClone(value.candidates[0]); },
      /unknown or duplicated/u,
    );

    const nonImage = await artifacts.put('{"not":"an image"}\n', {
      mediaType: 'application/json',
      storageClass: 'evidence',
      fileName: 'not-a-mask.json',
      labels: { artifactRole: 'review-evidence' },
    });
    attack(
      'non-image-mask',
      (value) => { value.candidates[2].maskArtifactId = nonImage.artifactId; },
      /mask is not a supported image artifact/u,
    );

    const forgedExecution = structuredClone(execution);
    forgedExecution.jobs[0].outputArtifacts[0].contentHash =
      `sha256:${'4'.repeat(64)}`;
    const forgedExecutionSealed = reseal(forgedExecution, 'executionSha256');
    const forgedExecutionPath = path.join(root, 'forged-execution.json');
    writeJson(forgedExecutionPath, forgedExecutionSealed);
    const forgedReview = structuredClone(review);
    const forgedExecutionText = fs.readFileSync(forgedExecutionPath, 'utf8');
    forgedReview.sourceExecutionReceipt = {
      path: path.resolve(forgedExecutionPath),
      fileSha256: sha256(Buffer.from(forgedExecutionText, 'utf8')),
      documentSha256: forgedExecutionSealed.executionSha256,
      runId: forgedExecutionSealed.runId,
    };
    const forgedReviewPath = path.join(root, 'forged-execution.review.json');
    writeJson(forgedReviewPath, forgedReview);
    const forgedResult = compileReview([
      '--authorization', authorizationPath,
      '--execution-receipt', forgedExecutionPath,
      '--review-decisions', forgedReviewPath,
      '--compiled-at', compiledAt,
      '--output', path.join(root, 'forged-execution.plan.json'),
    ], 2);
    assert.match(forgedResult.stderr, /differs from the immutable artifact descriptor/u);

    const reorderedExecution = structuredClone(execution);
    reorderedExecution.jobs[0].outputArtifacts.reverse();
    const reorderedSealed = reseal(reorderedExecution, 'executionSha256');
    const reorderedPath = path.join(root, 'reordered-execution.json');
    writeJson(reorderedPath, reorderedSealed);
    const reorderedReview = structuredClone(review);
    const reorderedText = fs.readFileSync(reorderedPath, 'utf8');
    reorderedReview.sourceExecutionReceipt = {
      path: path.resolve(reorderedPath),
      fileSha256: sha256(Buffer.from(reorderedText, 'utf8')),
      documentSha256: reorderedSealed.executionSha256,
      runId: reorderedSealed.runId,
    };
    const reorderedReviewPath = path.join(root, 'reordered-execution.review.json');
    writeJson(reorderedReviewPath, reorderedReview);
    const reorderedResult = compileReview([
      '--authorization', authorizationPath,
      '--execution-receipt', reorderedPath,
      '--review-decisions', reorderedReviewPath,
      '--compiled-at', compiledAt,
      '--output', path.join(root, 'reordered-execution.plan.json'),
    ], 2);
    assert.match(reorderedResult.stderr, /drifted from its successful execution/u);

    const firstDescriptor = await artifacts.get(candidates[0].artifactId);
    assert.ok(firstDescriptor);
    const objectPath = path.join(artifactRoot, firstDescriptor.objectRelativePath);
    const originalBytes = fs.readFileSync(objectPath);
    fs.writeFileSync(objectPath, Buffer.from('tampered candidate bytes', 'utf8'));
    const byteDriftResult = compileReview([
      '--authorization', authorizationPath,
      '--execution-receipt', executionPath,
      '--review-decisions', reviewPath,
      '--compiled-at', compiledAt,
      '--output', path.join(root, 'byte-drift.plan.json'),
    ], 2);
    assert.match(byteDriftResult.stderr, /failed immutable verification/u);
    fs.writeFileSync(objectPath, originalBytes);

    const moduleSource = fs.readFileSync(REVIEW_MODULE, 'utf8');
    const docSource = fs.readFileSync(REVIEW_DOC, 'utf8');
    const workflowSource = fs.readFileSync(REVIEW_WORKFLOW, 'utf8');
    assert.match(moduleSource, /requiresFreshAdmission: true/u);
    assert.match(moduleSource, /requiresFreshExecutionAuthorization: true/u);
    assert.match(moduleSource, /independentApprovalPerformed: false/u);
    assert.doesNotMatch(moduleSource, /candidateApproval: true/u);
    assert.doesNotMatch(moduleSource, /candidatePromotion: true/u);
    assert.doesNotMatch(moduleSource, /targetRepositoryMutation: true/u);
    assert.doesNotMatch(moduleSource, /publication: true/u);
    assert.match(docSource, /ComfyUI/u);
    assert.match(workflowSource, /check-raw-art-provider-review\.mjs/u);
    assert.match(workflowSource, /pnpm check/u);

    process.stdout.write(
      [
        'EVAVO RAW_ART provider candidate review and repair v1',
        '- exact successful runtime and immutable provider artifacts passed',
        '- seven complete review dispositions compiled with four bounded repair requests',
        '- edit, inpaint, recreate and variation request contracts passed',
        `- ${attacks.length + 4} adversarial review, receipt, mask, ordering and byte attacks passed`,
        '- runtime submission, approval, promotion, repository mutation and publication remain false',
      ].join('\n') + '\n',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
