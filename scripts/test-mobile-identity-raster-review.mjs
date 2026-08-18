#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  MOBILE_IDENTITY_REVIEW_DECISION_SCHEMA,
  compileMobileIdentityRasterApproval,
  compileMobileIdentityRasterHandoff,
  compileMobileIdentityRasterReviewPack,
  inspectOpaqueMobileIdentityPng,
} from './mobile-identity-raster-review.mjs';

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function hashObject(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function rawHash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function bytesHash(value) { return createHash('sha256').update(value).digest('hex'); }
function selfHash(value, key) {
  const body = { ...value };
  delete body[key];
  delete body.runId;
  const digest = hashObject(body);
  return { ...value, [key]: digest, runId: digest.slice(0, 20) };
}
function png1024(colorType = 2, withTrns = false) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, payload) => {
    const out = Buffer.alloc(12 + payload.length);
    out.writeUInt32BE(payload.length, 0);
    out.write(type, 4, 'ascii');
    payload.copy(out, 8);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1024, 0);
  ihdr.writeUInt32BE(1024, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    ...(withTrns ? [chunk('tRNS', Buffer.from([0, 0]))] : []),
    chunk('IDAT', Buffer.from([0])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function fixture() {
  const request = {
    schemaVersion: '1.0',
    requestId: 'mobile-identity-abc123',
    operation: 'generate',
    assetKind: 'ui',
    continuityPhase: 'identity-master',
    assetId: 'mobile-identity-godmode',
    candidateFamilyId: 'godmode-family',
    creativeIntent: 'distinctive identity',
    style: {},
    shot: {},
    target: { width: 1024, height: 1024, transparency: 'opaque', outputFormat: 'png' },
    background: { strategy: 'opaque-source' },
    quality: 'high',
    candidateCount: 4,
    references: [],
    selection: { preferredAdapterId: 'openai-gpt-image', preferredModel: 'gpt-image-2', allowedAdapterIds: ['openai-gpt-image'], allowFallback: false, requireSeed: false },
    metadata: { creativeMasterType: 'raster-provider-generation', releaseEligible: false, approvalRequired: true, contextSha256: '1'.repeat(64), promptSha256: '2'.repeat(64) },
  };
  const providerRequest = {
    schema: 'evavo.mobile-identity-provider-request.v1',
    status: 'provider-request-ready',
    providerRequest: request,
    providerRequestSha256: rawHash(request),
  };
  const authorizationBody = {
    schema: 'evavo.mobile-identity-provider-runtime-authorization.v1',
    status: 'authorized',
    authorizedAt: '2026-08-18T10:00:00.000Z',
    expiresAt: '2026-08-18T11:00:00.000Z',
    allowedAdapterIds: ['openai-gpt-image'],
    artifactRoot: '/tmp/artifacts',
    job: { workOrderId: 'identity', providerRequestId: request.requestId, requestSha256: '3'.repeat(64), jobId: 'job-1', specSha256: '4'.repeat(64) },
    authority: { providerExecution: true },
  };
  const authorization = selfHash(authorizationBody, 'authorizationSha256');
  const authorizationRecord = { path: '/tmp/auth.json', fileSha256: '5'.repeat(64), value: authorization };
  const candidateBytes = png1024();
  const candidateSha = bytesHash(candidateBytes);
  const artifact = `artifact_${'6'.repeat(64)}`;
  const descriptor = {
    artifactId: artifact,
    contentHash: `sha256:${candidateSha}`,
    contentSha256: candidateSha,
    sizeBytes: candidateBytes.length,
    mediaType: 'image/png',
    storageClass: 'intermediate',
    descriptorSha256: '7'.repeat(64),
    labels: { artifactRole: 'provider-candidate', approvalState: 'unapproved', providerAdapter: 'openai-gpt-image', providerModel: 'gpt-image-2', providerRequestId: request.requestId, candidateFamilyId: 'godmode-family', assetId: 'mobile-identity-godmode', candidateIndex: '1' },
    metadata: { finalDeliverable: false, requiresMastering: true, requiresBlockingQa: true, requestSha256: '3'.repeat(64) },
  };
  const evidenceArtifact = `artifact_${'8'.repeat(64)}`;
  const executionBody = {
    schema: 'evavo.mobile-identity-provider-runtime-execution.v1',
    status: 'succeeded',
    completedAt: '2026-08-18T10:05:00.000Z',
    workerId: 'identity-worker',
    sourceAuthorization: { path: authorizationRecord.path, fileSha256: authorizationRecord.fileSha256, documentSha256: authorization.authorizationSha256, runId: authorization.runId },
    providerAdapters: [{ id: 'openai-gpt-image', version: '1', models: ['gpt-image-2'], capabilities: ['generate'] }],
    runResult: {},
    job: {
      workOrderId: 'identity',
      providerRequestId: request.requestId,
      requestSha256: '3'.repeat(64),
      jobId: 'job-1',
      specSha256: '4'.repeat(64),
      state: 'succeeded',
      attempts: 1,
      outputArtifacts: [
        { artifactId: artifact, contentHash: descriptor.contentHash, mediaType: 'image/png', storageClass: 'intermediate', artifactRole: 'provider-candidate', approvalState: 'unapproved' },
        { artifactId: evidenceArtifact, contentHash: `sha256:${'9'.repeat(64)}`, mediaType: 'application/json', storageClass: 'evidence', artifactRole: 'provider-candidate-evidence', approvalState: null },
      ],
    },
    authority: { providerExecution: true },
  };
  const execution = selfHash(executionBody, 'executionSha256');
  const executionRecord = { path: '/tmp/execution.json', fileSha256: 'a'.repeat(64), value: execution };
  const providerEvidence = {
    outcome: 'candidate-produced',
    requestId: request.requestId,
    request,
    selection: { adapter: { id: 'openai-gpt-image' }, model: 'gpt-image-2', externalId: 'generation-1' },
    candidateArtifacts: [artifact],
  };
  const providerRecord = { path: '/tmp/provider.json', fileSha256: 'b'.repeat(64), value: providerRequest };
  return { providerRecord, authorizationRecord, executionRecord, descriptor, providerEvidence, candidateBytes };
}

test('opaque mobile identity PNG inspector rejects alpha and tRNS', () => {
  assert.deepEqual(inspectOpaqueMobileIdentityPng(png1024()), { width: 1024, height: 1024, bitDepth: 8, colorType: 2, opaque: true, animated: false });
  assert.throws(() => inspectOpaqueMobileIdentityPng(png1024(6)), /fully opaque/);
  assert.throws(() => inspectOpaqueMobileIdentityPng(png1024(2, true)), /fully opaque/);
});

test('provider execution compiles only to an independent-review pack', () => {
  const f = fixture();
  const pack = compileMobileIdentityRasterReviewPack({
    providerRequestRecord: f.providerRecord,
    authorizationRecord: f.authorizationRecord,
    executionReceiptRecord: f.executionRecord,
    candidateDescriptor: f.descriptor,
    providerEvidence: f.providerEvidence,
    candidateBytes: f.candidateBytes,
    createdAt: '2026-08-18T10:06:00.000Z',
  });
  assert.equal(pack.status, 'independent-review-required');
  assert.equal(pack.candidate.candidateSha256, f.descriptor.contentSha256);
  assert.equal(pack.reviewRequirements.humanApprovalRequired, true);
  assert.equal(pack.authority.candidateApproval, false);
  assert.equal(pack.decisionTemplate.approved, false);
});

test('approval requires explicit human review and produces derivative-only handoff', () => {
  const f = fixture();
  const pack = compileMobileIdentityRasterReviewPack({
    providerRequestRecord: f.providerRecord,
    authorizationRecord: f.authorizationRecord,
    executionReceiptRecord: f.executionRecord,
    candidateDescriptor: f.descriptor,
    providerEvidence: f.providerEvidence,
    candidateBytes: f.candidateBytes,
    createdAt: '2026-08-18T10:06:00.000Z',
  });
  const review = {
    schema: MOBILE_IDENTITY_REVIEW_DECISION_SCHEMA,
    status: 'reviewed',
    sourceReviewPackSha256: pack.reviewPackSha256,
    candidateArtifactId: pack.candidate.artifactId,
    candidateSha256: pack.candidate.candidateSha256,
    reviewedAt: '2026-08-18T10:10:00.000Z',
    reviewedBy: 'greg',
    reviewMode: 'hybrid',
    humanApprovalConfirmed: true,
    approved: true,
    review: { smallScale: true, circleMask: true, squircleMask: true, androidAdaptiveMask: true, noTextOrWordmark: true, nonGenericIdentity: true, strongSilhouette: true, iosOpacity: true, androidSafeZone: true },
    notes: 'Approved after exact candidate review.',
    authority: { providerExecution: false, candidatePromotion: false, targetRepositoryMutation: false, deviceAuthority: false, protocolAuthority: false, publication: false, forcePush: false },
  };
  const approval = compileMobileIdentityRasterApproval(pack, review, 'c'.repeat(64));
  assert.equal(approval.approved, true);
  assert.equal(approval.providerFamily, 'openai-gpt-image');
  assert.equal(approval.authority.deviceAuthority, false);
  const handoff = compileMobileIdentityRasterHandoff(pack, approval);
  assert.equal(handoff.status, 'approved-raster-handoff-ready');
  assert.equal(handoff.vectorStudio.role, 'derivative-only');
  assert.equal(handoff.runtimeRelease.releaseEligibleBeforeDerivativeReceipt, false);
  assert.equal(handoff.authority.targetRepositoryMutation, false);
});

test('generation success cannot self-approve or accept generic provider aliases', () => {
  const f = fixture();
  const pack = compileMobileIdentityRasterReviewPack({
    providerRequestRecord: f.providerRecord,
    authorizationRecord: f.authorizationRecord,
    executionReceiptRecord: f.executionRecord,
    candidateDescriptor: f.descriptor,
    providerEvidence: f.providerEvidence,
    candidateBytes: f.candidateBytes,
    createdAt: '2026-08-18T10:06:00.000Z',
  });
  const review = {
    ...pack.decisionTemplate,
    sourceReviewPackSha256: pack.reviewPackSha256,
    reviewedAt: '2026-08-18T10:10:00.000Z',
    reviewedBy: 'worker',
    reviewMode: 'human',
    approved: true,
    humanApprovalConfirmed: false,
    review: Object.fromEntries(Object.keys(pack.decisionTemplate.review).map((key) => [key, true])),
    notes: 'attempt',
  };
  assert.throws(() => compileMobileIdentityRasterApproval(pack, review), /explicit human approval/);
  const altered = structuredClone(pack);
  delete altered.reviewPackSha256;
  delete altered.runId;
  altered.candidate.providerFamily = 'openai-image';
  altered.reviewPackSha256 = hashObject(altered);
  altered.runId = altered.reviewPackSha256.slice(0, 20);
  assert.throws(() => compileMobileIdentityRasterApproval(altered, { ...review, sourceReviewPackSha256: altered.reviewPackSha256, humanApprovalConfirmed: true }), /openai-gpt-image/);
});
