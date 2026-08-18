#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  canonical,
  fail,
  hashObject,
  isObject,
  readJsonRecord,
  verifySelfHash,
  writeCreateOnly,
} from './raw-art-provider/shared.mjs';
import { validateMobileIdentityRasterApproval } from './mobile-identity-contract.mjs';

export const MOBILE_IDENTITY_REVIEW_PACK_SCHEMA = 'evavo.mobile-identity-raster-review-pack.v1';
export const MOBILE_IDENTITY_REVIEW_DECISION_SCHEMA = 'evavo.mobile-identity-raster-review-decision.v1';
export const MOBILE_IDENTITY_HANDOFF_SCHEMA = 'evavo.mobile-identity-raster-handoff.v1';
const PROVIDER_REQUEST_SCHEMA = 'evavo.mobile-identity-provider-request.v1';
const AUTHORIZATION_SCHEMA = 'evavo.mobile-identity-provider-runtime-authorization.v1';
const EXECUTION_SCHEMA = 'evavo.mobile-identity-provider-runtime-execution.v1';
const APPROVAL_SCHEMA = 'evavo.mobile-identity-raster-approval.v1';
const ARTIFACT_ID = /^artifact_[0-9a-f]{64}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const OPENAI_MODELS = new Set(['gpt-image-2', 'gpt-image-2-2026-04-21']);
const REQUIRED_REVIEW_CHECKS = Object.freeze([
  'smallScale',
  'circleMask',
  'squircleMask',
  'androidAdaptiveMask',
  'noTextOrWordmark',
  'nonGenericIdentity',
  'strongSilhouette',
  'iosOpacity',
  'androidSafeZone',
]);
const REVIEW_MODES = new Set(['human', 'hybrid']);
const MAX_CANDIDATE_BYTES = 64 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function text(value, label, maximum = 4096) {
  if (typeof value !== 'string' || value.trim() !== value || !value || value.length > maximum || value.includes('\0')) fail(`${label} is invalid`);
  return value;
}
function sha(value, label) {
  const result = text(value, label, 64);
  if (!HEX64.test(result)) fail(`${label} must be SHA-256`);
  return result;
}
function artifactId(value, label) {
  const result = text(value, label, 80);
  if (!ARTIFACT_ID.test(result)) fail(`${label} must use artifact_<sha256> format`);
  return result;
}
function sha256Bytes(value) { return createHash('sha256').update(value).digest('hex'); }
function sha256JsonOrder(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function canonicalTimestamp(value, label) {
  const result = text(value, label, 40);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) fail(`${label} must be a canonical UTC timestamp`);
  return result;
}
function exactFalseAuthority(value, label) {
  if (!isObject(value) || Object.keys(value).length === 0 || Object.values(value).some((entry) => entry !== false)) fail(`${label} authority must be entirely false`);
}
function sourceRecord(record, documentSha256, runId) {
  return Object.freeze({ path: record.path, fileSha256: record.fileSha256, documentSha256, runId });
}
function exactSource(actual, expected, label) {
  if (!isObject(actual) || canonical(actual) !== canonical(expected)) fail(`${label} does not bind the exact source file`);
}
function providerIdentity(adapter, model) {
  const providerAdapter = text(adapter, 'provider adapter', 160);
  const providerModel = text(model, 'provider model', 160);
  if (providerAdapter === 'openai-gpt-image') {
    if (!OPENAI_MODELS.has(providerModel)) fail('OpenAI mobile identity candidate uses an unadmitted model');
  } else if (!(providerAdapter.startsWith('comfyui:') && providerAdapter.length > 'comfyui:'.length)) {
    fail('mobile identity candidate must use openai-gpt-image or a concrete comfyui:<profileId> adapter');
  }
  return Object.freeze({ providerAdapter, providerModel });
}

export function inspectOpaqueMobileIdentityPng(input) {
  const bytes = Buffer.from(input);
  if (bytes.byteLength < 33 || bytes.byteLength > MAX_CANDIDATE_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) fail('mobile identity candidate must be a bounded PNG');
  let offset = 8;
  let ihdr = null;
  let hasTransparencyChunk = false;
  let animated = false;
  let sawEnd = false;
  while (offset + 12 <= bytes.byteLength) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (!Number.isSafeInteger(length) || end > bytes.byteLength) fail('PNG chunk bounds are invalid');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      if (ihdr || length !== 13 || offset !== 8) fail('PNG IHDR is invalid');
      ihdr = {
        width: bytes.readUInt32BE(offset + 8),
        height: bytes.readUInt32BE(offset + 12),
        bitDepth: bytes[offset + 16],
        colorType: bytes[offset + 17],
        compression: bytes[offset + 18],
        filter: bytes[offset + 19],
        interlace: bytes[offset + 20],
      };
    }
    if (type === 'tRNS') hasTransparencyChunk = true;
    if (type === 'acTL') animated = true;
    if (type === 'IEND') { sawEnd = true; break; }
    offset = end;
  }
  if (!ihdr || !sawEnd) fail('PNG is missing IHDR or IEND');
  if (ihdr.width !== 1024 || ihdr.height !== 1024) fail('mobile identity raster master must be exactly 1024x1024');
  if (![0, 2, 3].includes(ihdr.colorType) || hasTransparencyChunk) fail('mobile identity raster master must be fully opaque');
  if (ihdr.compression !== 0 || ihdr.filter !== 0 || ![0, 1].includes(ihdr.interlace)) fail('PNG coding fields are invalid');
  if (animated) fail('mobile identity raster master must be a static PNG');
  return Object.freeze({ width: ihdr.width, height: ihdr.height, bitDepth: ihdr.bitDepth, colorType: ihdr.colorType, opaque: true, animated: false });
}

function validateProviderRequestDocument(wrapper) {
  if (!isObject(wrapper) || wrapper.schema !== PROVIDER_REQUEST_SCHEMA || wrapper.status !== 'provider-request-ready' || !isObject(wrapper.providerRequest)) fail('provider request document is not provider-request-ready');
  const request = wrapper.providerRequest;
  if (sha256JsonOrder(request) !== wrapper.providerRequestSha256) fail('provider request document hash mismatch');
  if (request.operation !== 'generate' || request.assetKind !== 'ui' || request.continuityPhase !== 'identity-master') fail('provider request is not mobile identity generation');
  if (request.target?.width !== 1024 || request.target?.height !== 1024 || request.target?.outputFormat !== 'png' || request.target?.transparency !== 'opaque') fail('provider request target is not the final 1024x1024 opaque PNG contract');
  if (request.metadata?.creativeMasterType !== 'raster-provider-generation' || request.metadata?.releaseEligible !== false || request.metadata?.approvalRequired !== true) fail('provider request approval boundary is invalid');
  sha(request.metadata?.contextSha256, 'provider request contextSha256');
  sha(request.metadata?.promptSha256, 'provider request promptSha256');
  return request;
}

function validateAuthorizationRecord(record) {
  const value = record?.value;
  if (!isObject(value) || value.schema !== AUTHORIZATION_SCHEMA || value.status !== 'authorized') fail('unexpected mobile identity authorization');
  const authorizationSha256 = verifySelfHash(value, 'authorizationSha256', 'mobile identity authorization');
  if (!Array.isArray(value.allowedAdapterIds) || !value.allowedAdapterIds.length) fail('mobile identity authorization lacks exact adapters');
  if (!isObject(value.job)) fail('mobile identity authorization job is missing');
  text(value.artifactRoot, 'authorization artifactRoot', 32768);
  return Object.freeze({ value, authorizationSha256, runId: value.runId });
}

function outputEvidence(output) {
  if (!isObject(output)) fail('execution output artifact is invalid');
  return Object.freeze({
    artifactId: artifactId(output.artifactId, 'execution artifactId'),
    contentHash: text(output.contentHash, 'execution contentHash', 80),
    mediaType: text(output.mediaType, 'execution mediaType', 128),
    storageClass: text(output.storageClass, 'execution storageClass', 64),
    artifactRole: output.artifactRole === null ? null : text(output.artifactRole, 'execution artifactRole', 128),
    approvalState: output.approvalState === null ? null : text(output.approvalState, 'execution approvalState', 128),
  });
}

function validateExecutionRecord(record, authorization, authorizationRecord) {
  const value = record?.value;
  if (!isObject(value) || value.schema !== EXECUTION_SCHEMA || value.status !== 'succeeded') fail('raster review requires a succeeded mobile identity execution receipt');
  const executionSha256 = verifySelfHash(value, 'executionSha256', 'mobile identity execution receipt');
  exactSource(value.sourceAuthorization, sourceRecord(authorizationRecord, authorization.authorizationSha256, authorization.runId), 'execution sourceAuthorization');
  if (!isObject(value.job) || value.job.state !== 'succeeded' || value.job.attempts !== 1 || value.job.failure !== undefined) fail('mobile identity execution job is not one exact successful attempt');
  if (value.job.jobId !== authorization.value.job.jobId || value.job.specSha256 !== authorization.value.job.specSha256 || value.job.providerRequestId !== authorization.value.job.providerRequestId || value.job.requestSha256 !== authorization.value.job.requestSha256) fail('execution job drifted from authorization');
  if (!Array.isArray(value.job.outputArtifacts) || value.job.outputArtifacts.length < 2) fail('execution receipt lacks candidates and provider evidence');
  return Object.freeze({ value, executionSha256, runId: value.runId, outputs: Object.freeze(value.job.outputArtifacts.map(outputEvidence)) });
}

function exactDescriptorOutput(output, descriptor) {
  const actual = {
    artifactId: descriptor.artifactId,
    contentHash: descriptor.contentHash,
    mediaType: descriptor.mediaType,
    storageClass: descriptor.storageClass,
    artifactRole: descriptor.labels?.artifactRole ?? null,
    approvalState: descriptor.labels?.approvalState ?? null,
  };
  if (canonical(output) !== canonical(actual)) fail('candidate execution evidence differs from immutable artifact descriptor');
}

export function compileMobileIdentityRasterReviewPack(input) {
  const providerRequestRecord = input?.providerRequestRecord;
  const authorizationRecord = input?.authorizationRecord;
  const executionReceiptRecord = input?.executionReceiptRecord;
  const descriptor = input?.candidateDescriptor;
  const providerEvidence = input?.providerEvidence;
  const candidateBytes = Buffer.from(input?.candidateBytes ?? []);
  if (!providerRequestRecord || !authorizationRecord || !executionReceiptRecord || !isObject(descriptor) || !isObject(providerEvidence)) fail('mobile identity review pack inputs are incomplete');

  const request = validateProviderRequestDocument(providerRequestRecord.value);
  const authorization = validateAuthorizationRecord(authorizationRecord);
  const execution = validateExecutionRecord(executionReceiptRecord, authorization, authorizationRecord);
  if (authorization.value.job.providerRequestId !== request.requestId) fail('authorization is for another provider request');
  if (!ARTIFACT_ID.test(String(descriptor.artifactId ?? ''))) fail('candidate descriptor artifact id is invalid');
  const selectedOutput = execution.outputs.find((entry) => entry.artifactId === descriptor.artifactId);
  if (!selectedOutput) fail('selected candidate is not listed by the exact execution receipt');
  exactDescriptorOutput(selectedOutput, descriptor);
  if (descriptor.storageClass !== 'intermediate' || descriptor.mediaType !== 'image/png' || descriptor.labels?.artifactRole !== 'provider-candidate' || descriptor.labels?.approvalState !== 'unapproved' || descriptor.metadata?.finalDeliverable !== false || descriptor.metadata?.requiresMastering !== true || descriptor.metadata?.requiresBlockingQa !== true) fail('selected raster candidate crossed its unapproved provider boundary');
  if (descriptor.labels?.providerRequestId !== request.requestId || descriptor.metadata?.requestSha256 !== execution.value.job.requestSha256) fail('candidate request identity drifted');
  const { providerAdapter, providerModel } = providerIdentity(descriptor.labels?.providerAdapter, descriptor.labels?.providerModel);
  if (!authorization.value.allowedAdapterIds.includes(providerAdapter)) fail('candidate adapter is outside the execution authorization');
  const adapterReceipt = Array.isArray(execution.value.providerAdapters) ? execution.value.providerAdapters.find((entry) => entry?.id === providerAdapter) : null;
  if (!adapterReceipt || !Array.isArray(adapterReceipt.models) || !adapterReceipt.models.includes(providerModel)) fail('execution receipt does not admit the candidate provider model');

  const contentSha256 = sha256Bytes(candidateBytes);
  if (contentSha256 !== descriptor.contentSha256 || descriptor.contentHash !== `sha256:${contentSha256}`) fail('candidate bytes do not match the immutable artifact descriptor');
  const png = inspectOpaqueMobileIdentityPng(candidateBytes);

  if (providerEvidence.outcome !== 'candidate-produced' || providerEvidence.requestId !== request.requestId || canonical(providerEvidence.request) !== canonical(request)) fail('provider evidence does not bind the exact mobile identity request');
  if (!Array.isArray(providerEvidence.candidateArtifacts) || !providerEvidence.candidateArtifacts.includes(descriptor.artifactId)) fail('provider evidence does not include the selected candidate');
  if (providerEvidence.selection?.adapter?.id !== providerAdapter || providerEvidence.selection?.model !== providerModel) fail('provider evidence adapter/model differs from selected candidate');

  const candidateIndex = Number(descriptor.labels?.candidateIndex);
  if (!Number.isSafeInteger(candidateIndex) || candidateIndex < 1 || candidateIndex > Number(request.candidateCount ?? 8)) fail('selected candidate index is invalid');
  const pack = {
    schema: MOBILE_IDENTITY_REVIEW_PACK_SCHEMA,
    status: 'independent-review-required',
    createdAt: canonicalTimestamp(input.createdAt ?? new Date().toISOString(), 'createdAt'),
    sourceProviderRequest: sourceRecord(providerRequestRecord, providerRequestRecord.value.providerRequestSha256, providerRequestRecord.value.providerRequestSha256.slice(0, 20)),
    sourceAuthorization: sourceRecord(authorizationRecord, authorization.authorizationSha256, authorization.runId),
    sourceExecutionReceipt: sourceRecord(executionReceiptRecord, execution.executionSha256, execution.runId),
    candidate: {
      artifactId: descriptor.artifactId,
      candidateIndex,
      contentHash: descriptor.contentHash,
      candidateSha256: contentSha256,
      mediaType: descriptor.mediaType,
      sizeBytes: candidateBytes.byteLength,
      png,
      providerFamily: providerAdapter,
      providerModel,
      generationReceiptId: execution.runId,
      providerRequestId: request.requestId,
      providerRequestSha256: providerRequestRecord.value.providerRequestSha256,
      runtimeRequestSha256: execution.value.job.requestSha256,
      contextSha256: request.metadata.contextSha256,
      promptSha256: request.metadata.promptSha256,
    },
    providerEvidence: {
      outcome: providerEvidence.outcome,
      adapterId: providerAdapter,
      model: providerModel,
      externalId: providerEvidence.selection?.externalId ?? null,
    },
    technicalGate: {
      immutableArtifactVerified: true,
      executionBindingVerified: true,
      providerEvidenceVerified: true,
      png1024Square: true,
      iosOpaqueContainer: true,
      staticImage: true,
      unapprovedBoundaryPreserved: true,
    },
    reviewRequirements: {
      mode: 'explicit-independent-review',
      humanApprovalRequired: true,
      generationEqualsApproval: false,
      checks: REQUIRED_REVIEW_CHECKS,
      smallScalePixels: [16, 24, 32, 48, 64, 128],
      masks: ['circle', 'squircle', 'android-adaptive'],
      candidateBytesMustBeReviewedExactly: true,
    },
    decisionTemplate: {
      schema: MOBILE_IDENTITY_REVIEW_DECISION_SCHEMA,
      status: 'reviewed',
      sourceReviewPackSha256: '<reviewPackSha256>',
      candidateArtifactId: descriptor.artifactId,
      candidateSha256: contentSha256,
      reviewedAt: '<canonical UTC timestamp>',
      reviewedBy: '<reviewer>',
      reviewMode: 'human',
      humanApprovalConfirmed: false,
      approved: false,
      review: Object.fromEntries(REQUIRED_REVIEW_CHECKS.map((key) => [key, false])),
      notes: '<review notes>',
      authority: { providerExecution: false, candidatePromotion: false, targetRepositoryMutation: false, deviceAuthority: false, protocolAuthority: false, publication: false, forcePush: false },
    },
    authority: { providerExecution: false, candidateApproval: false, candidatePromotion: false, targetRepositoryMutation: false, deviceAuthority: false, protocolAuthority: false, publication: false, forcePush: false },
  };
  const reviewPackSha256 = hashObject(pack);
  return Object.freeze({ ...pack, reviewPackSha256, runId: reviewPackSha256.slice(0, 20) });
}

function validateReviewPack(pack) {
  if (!isObject(pack) || pack.schema !== MOBILE_IDENTITY_REVIEW_PACK_SCHEMA || pack.status !== 'independent-review-required') fail('unexpected mobile identity review pack');
  const digest = verifySelfHash(pack, 'reviewPackSha256', 'mobile identity review pack');
  exactFalseAuthority(pack.authority, 'mobile identity review pack');
  if (!isObject(pack.candidate) || !ARTIFACT_ID.test(String(pack.candidate.artifactId ?? ''))) fail('review pack candidate is invalid');
  sha(pack.candidate.candidateSha256, 'review pack candidateSha256');
  providerIdentity(pack.candidate.providerFamily, pack.candidate.providerModel);
  return Object.freeze({ pack, digest });
}

export function compileMobileIdentityRasterApproval(reviewPackInput, reviewDecisionInput, reviewRecordSha256 = null) {
  const { pack, digest } = validateReviewPack(reviewPackInput);
  const decision = reviewDecisionInput;
  if (!isObject(decision) || decision.schema !== MOBILE_IDENTITY_REVIEW_DECISION_SCHEMA || decision.status !== 'reviewed') fail('unexpected mobile identity raster review decision');
  if (decision.sourceReviewPackSha256 !== digest || decision.candidateArtifactId !== pack.candidate.artifactId || decision.candidateSha256 !== pack.candidate.candidateSha256) fail('review decision is not bound to the exact review pack candidate');
  canonicalTimestamp(decision.reviewedAt, 'reviewedAt');
  text(decision.reviewedBy, 'reviewedBy', 256);
  if (!REVIEW_MODES.has(decision.reviewMode)) fail('reviewMode must be human or hybrid for final identity approval');
  if (decision.humanApprovalConfirmed !== true || decision.approved !== true) fail('final mobile identity requires explicit human approval');
  if (!isObject(decision.review)) fail('review checks are missing');
  for (const check of REQUIRED_REVIEW_CHECKS) if (decision.review[check] !== true) fail(`review.${check} must be true before approval`);
  text(decision.notes, 'review notes', 8192);
  exactFalseAuthority(decision.authority, 'mobile identity review decision');
  const approval = {
    schema: APPROVAL_SCHEMA,
    approved: true,
    sourceType: 'raster-provider-generation',
    providerFamily: pack.candidate.providerFamily,
    providerModel: pack.candidate.providerModel,
    candidateArtifactId: pack.candidate.artifactId,
    candidateSha256: pack.candidate.candidateSha256,
    contextSha256: pack.candidate.contextSha256,
    promptSha256: pack.candidate.promptSha256,
    generationReceiptId: pack.candidate.generationReceiptId,
    sourceReviewPackSha256: digest,
    ...(reviewRecordSha256 ? { sourceReviewDecisionFileSha256: sha(reviewRecordSha256, 'review decision file SHA-256') } : {}),
    reviewedAt: decision.reviewedAt,
    reviewedBy: decision.reviewedBy,
    reviewMode: decision.reviewMode,
    review: {
      smallScale: true,
      circleMask: true,
      squircleMask: true,
      androidAdaptiveMask: true,
      noTextOrWordmark: true,
      nonGenericIdentity: true,
      strongSilhouette: true,
      iosOpacity: true,
      androidSafeZone: true,
    },
    authority: { deviceAuthority: false, protocolAuthority: false, targetRepositoryMutation: false, publication: false, forcePush: false },
  };
  validateMobileIdentityRasterApproval(approval);
  return Object.freeze(approval);
}

export function compileMobileIdentityRasterHandoff(reviewPackInput, approvalInput, candidateRelativePath = 'GODMODE-1024.png') {
  const { pack, digest } = validateReviewPack(reviewPackInput);
  validateMobileIdentityRasterApproval(approvalInput);
  if (approvalInput.sourceReviewPackSha256 !== digest || approvalInput.candidateArtifactId !== pack.candidate.artifactId || approvalInput.candidateSha256 !== pack.candidate.candidateSha256) fail('approval does not bind the exact review-pack candidate');
  const relativePath = text(candidateRelativePath, 'candidateRelativePath', 255).replaceAll('\\', '/');
  if (path.posix.isAbsolute(relativePath) || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) fail('candidateRelativePath must be safe and relative');
  const handoff = {
    schema: MOBILE_IDENTITY_HANDOFF_SCHEMA,
    status: 'approved-raster-handoff-ready',
    sourceReviewPackSha256: digest,
    approvalSha256: hashObject(approvalInput),
    candidate: {
      artifactId: pack.candidate.artifactId,
      sha256: pack.candidate.candidateSha256,
      mediaType: 'image/png',
      relativePath,
      width: 1024,
      height: 1024,
      opaque: true,
    },
    vectorStudio: {
      repository: 'EVAVO-STUDIO/evavo-vector-studio',
      role: 'derivative-only',
      approvalSchema: APPROVAL_SCHEMA,
      derivativePlanSchema: 'evavo.vector-mobile-identity-derivative.v1',
      derivativeReceiptSchema: 'evavo.vector-mobile-identity-derivative-receipt.v1',
      sourceRasterSha256: pack.candidate.candidateSha256,
      creativeMasterMayBeReplaced: false,
    },
    runtimeRelease: {
      repository: 'EVAVO-STUDIO/evavo-glasses',
      releaseValidationScript: 'scripts/validate-mobile-identity-release.mjs',
      releaseEligibleBeforeDerivativeReceipt: false,
      targetRepositoryMutation: false,
    },
    authority: { creativeApproval: false, vectorDerivativeExecution: false, targetRepositoryMutation: false, deviceAuthority: false, protocolAuthority: false, publication: false, forcePush: false },
  };
  const handoffSha256 = hashObject(handoff);
  return Object.freeze({ ...handoff, handoffSha256, runId: handoffSha256.slice(0, 20) });
}

async function loadCandidateFromArtifacts(reviewPackInput, artifactRoot) {
  const { pack } = validateReviewPack(reviewPackInput);
  const { LocalArtifactStore } = await import('../packages/artifacts/dist/index.js');
  const store = new LocalArtifactStore({ root: artifactRoot });
  const verification = await store.verify(pack.candidate.artifactId);
  const descriptor = await store.get(pack.candidate.artifactId);
  if (!descriptor || !verification.exists || !verification.descriptorValid || !verification.contentValid) fail('approved candidate artifact failed immutable verification during handoff');
  const bytes = await store.read(pack.candidate.artifactId);
  if (sha256Bytes(bytes) !== pack.candidate.candidateSha256) fail('approved candidate bytes drifted before handoff');
  return bytes;
}

async function prepareReviewPack(values) {
  const providerRequestRecord = await readJsonRecord(required(values, '--provider-request'), 'mobile identity provider request');
  const authorizationRecord = await readJsonRecord(required(values, '--authorization'), 'mobile identity authorization');
  const executionReceiptRecord = await readJsonRecord(required(values, '--execution-receipt'), 'mobile identity execution receipt');
  const candidate = artifactId(required(values, '--candidate-artifact'), '--candidate-artifact');
  const authorization = validateAuthorizationRecord(authorizationRecord);
  const { LocalArtifactStore } = await import('../packages/artifacts/dist/index.js');
  const store = new LocalArtifactStore({ root: authorization.value.artifactRoot });
  const verification = await store.verify(candidate);
  const descriptor = await store.get(candidate);
  if (!descriptor || !verification.exists || !verification.descriptorValid || !verification.contentValid) fail('selected candidate artifact failed immutable verification');
  const candidateBytes = await store.read(candidate);
  const execution = validateExecutionRecord(executionReceiptRecord, authorization, authorizationRecord);
  const evidenceOutputs = execution.outputs.filter((entry) => entry.artifactRole === 'provider-candidate-evidence');
  if (evidenceOutputs.length !== 1) fail('mobile identity execution must contain exactly one provider evidence artifact');
  const evidenceDescriptor = await store.get(evidenceOutputs[0].artifactId);
  const evidenceVerification = await store.verify(evidenceOutputs[0].artifactId);
  if (!evidenceDescriptor || !evidenceVerification.exists || !evidenceVerification.descriptorValid || !evidenceVerification.contentValid || evidenceDescriptor.storageClass !== 'evidence') fail('provider evidence artifact failed immutable verification');
  exactDescriptorOutput(evidenceOutputs[0], evidenceDescriptor);
  const providerEvidence = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await store.read(evidenceDescriptor.artifactId)));
  const pack = compileMobileIdentityRasterReviewPack({ providerRequestRecord, authorizationRecord, executionReceiptRecord, candidateDescriptor: descriptor, providerEvidence, candidateBytes, createdAt: values.get('--created-at') });
  await writeCreateOnly(required(values, '--output'), pack);
  return { status: pack.status, reviewPackSha256: pack.reviewPackSha256, candidateSha256: pack.candidate.candidateSha256, output: path.resolve(required(values, '--output')) };
}

async function approveReview(values) {
  const packRecord = await readJsonRecord(required(values, '--review-pack'), 'mobile identity review pack');
  const decisionRecord = await readJsonRecord(required(values, '--review-decision'), 'mobile identity review decision');
  const approval = compileMobileIdentityRasterApproval(packRecord.value, decisionRecord.value, decisionRecord.fileSha256);
  await writeCreateOnly(required(values, '--output'), approval);
  return { status: 'approved', candidateSha256: approval.candidateSha256, output: path.resolve(required(values, '--output')) };
}

async function materializeHandoff(values) {
  const packRecord = await readJsonRecord(required(values, '--review-pack'), 'mobile identity review pack');
  const approvalRecord = await readJsonRecord(required(values, '--approval'), 'mobile identity raster approval');
  const authorizationRecord = await readJsonRecord(required(values, '--authorization'), 'mobile identity authorization');
  const authorization = validateAuthorizationRecord(authorizationRecord);
  exactSource(packRecord.value.sourceAuthorization, sourceRecord(authorizationRecord, authorization.authorizationSha256, authorization.runId), 'handoff sourceAuthorization');
  const outputRoot = path.resolve(required(values, '--handoff-root'));
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const candidateName = values.get('--candidate-name') ?? 'GODMODE-1024.png';
  const handoff = compileMobileIdentityRasterHandoff(packRecord.value, approvalRecord.value, candidateName);
  const bytes = await loadCandidateFromArtifacts(packRecord.value, authorization.value.artifactRoot);
  const candidatePath = path.resolve(outputRoot, handoff.candidate.relativePath);
  if (path.dirname(candidatePath) !== outputRoot) fail('candidate handoff must remain directly inside handoff root');
  const handle = await open(candidatePath, 'wx', 0o600);
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
  const materializedBytes = await readFile(candidatePath);
  if (sha256Bytes(materializedBytes) !== handoff.candidate.sha256) fail('materialized handoff candidate hash mismatch');
  const manifestPath = path.resolve(outputRoot, values.get('--manifest-name') ?? 'mobile-identity-handoff.json');
  if (path.dirname(manifestPath) !== outputRoot) fail('handoff manifest must remain directly inside handoff root');
  await writeCreateOnly(manifestPath, handoff);
  return { status: handoff.status, handoffSha256: handoff.handoffSha256, candidate: candidatePath, manifest: manifestPath };
}

function parse(argv) {
  const command = argv[0];
  const tail = argv.slice(1);
  if (!command || tail.length % 2 !== 0) fail('command and unique --name value pairs are required');
  const values = new Map();
  for (let index = 0; index < tail.length; index += 2) {
    const name = tail[index]; const value = tail[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name)) fail('arguments must be unique --name value pairs');
    values.set(name, value);
  }
  return { command, values };
}
function required(values, name) { const value = values.get(name); if (!value) fail(`missing ${name}`); return value; }

export async function runMobileIdentityRasterReviewCli(argv = process.argv.slice(2)) {
  const { command, values } = parse(argv);
  if (command === 'prepare') return prepareReviewPack(values);
  if (command === 'approve') return approveReview(values);
  if (command === 'handoff') return materializeHandoff(values);
  fail('command must be prepare, approve or handoff');
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) {
  runMobileIdentityRasterReviewCli()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
}
