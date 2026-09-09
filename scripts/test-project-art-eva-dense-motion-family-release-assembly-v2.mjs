#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION_V2,
  evaDenseMotionFamilyReleaseAssemblyV2Capabilities,
} from './project-art/eva-dense-motion-family-release-assembly-v2.mjs';
import {
  EVA_DENSE_MOTION_FAMILY_RELEASE_PROVENANCE_GATE_VERSION,
  evaDenseMotionFamilyReleaseAssemblyV2ProvenanceCapabilities,
} from './project-art/eva-dense-motion-family-release-assembly-v2-provenance.mjs';
import {
  compileEvaDenseMotionTenMasterProgram,
  createEvaDenseMotionTenMasterRequest,
} from './project-art/eva-dense-motion-ten-master-program.mjs';
import {
  compileEvaDenseMotionProductionStatusV1,
  evaDenseMotionProductionStatusV1Capabilities,
} from './project-art/eva-dense-motion-production-status-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(
  path.join(root, 'scripts/project-art/eva-dense-motion-family-release-assembly-v2.mjs'),
  'utf8',
);
const provenanceSource = readFileSync(
  path.join(root, 'scripts/project-art/eva-dense-motion-family-approval-provenance-v1.mjs'),
  'utf8',
);
const gatedAssemblySource = readFileSync(
  path.join(root, 'scripts/project-art/eva-dense-motion-family-release-assembly-v2-provenance.mjs'),
  'utf8',
);
const runnerSource = readFileSync(
  path.join(root, 'scripts/run-project-art-eva-dense-motion-family-release-assembly-v2.mjs'),
  'utf8',
);
for (const marker of [
  "'2026-08-22.2'",
  "schema: 'evavo.project-art-eva-dense-motion-family-evidence-fingerprint.v1'",
  'familyReleaseManifest.familyEvidenceFingerprint === fingerprint',
  'value.familyEvidenceFingerprint === fingerprint',
  "familyApproval(familyReleaseManifest.approvals?.owner, 'owner'",
  "familyApproval(familyReleaseManifest.approvals?.creativeDirector, 'creative-director'",
  "familyApproval(familyReleaseManifest.approvals?.technicalDirector, 'technical-director'",
  'new Set([owner.reviewer.actorId, creativeDirector.reviewer.actorId, technicalDirector.reviewer.actorId]).size === 3',
  'compileEvaDenseMotionReleaseEvidence',
  'evaluateEvaDenseMotionReleaseEvidence',
  'evaluation.runtimeReceiptAssemblyReady === true',
  'evaluation.publicationAllowed === false',
  'evaluation.runtimeActivationAllowed === false',
]) assert.ok(source.includes(marker), marker);

for (const forbidden of [
  'approval.familyEvidenceSha256 === familyReleaseManifest.manifestSha256',
  'providerExecution: true',
  'cloudinaryUpload: true',
  'publication: true',
  'deployment: true',
  'runtimeActivation: true',
  'forcePush: true',
]) assert.equal(source.includes(forbidden), false, forbidden);

for (const marker of [
  'evidencePath',
  'stableEvidenceJson',
  "createHash('sha256').update(bytes).digest('hex')",
  'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_HASH_MISMATCH',
  'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_BINDING_MISMATCH',
  'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_APPROVER_INDEPENDENCE_REQUIRED',
  'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_DISTINCT_EVIDENCE_REQUIRED',
  "receipt.reviewScope === 'complete-dense-motion-family-release-evidence'",
  'receipt.automaticDecision === false',
]) assert.ok(provenanceSource.includes(marker), marker);

assert.ok(
  gatedAssemblySource.indexOf('verifyEvaDenseMotionFamilyApprovalProvenance') <
    gatedAssemblySource.indexOf('compileEvaDenseMotionFamilyReleaseEvidenceV2(args)'),
  'file-backed approval provenance must verify before v2 family assembly',
);
for (const forbidden of [
  'providerExecution: true',
  'imageMutation: true',
  'publication: true',
  'deployment: true',
  'runtimeActivation: true',
]) assert.equal(gatedAssemblySource.includes(forbidden), false, forbidden);

for (const marker of [
  "from './project-art/eva-dense-motion-family-release-assembly-v2-provenance.mjs'",
  'compileEvaDenseMotionFamilyReleaseEvidenceV2WithProvenance({',
  'approvalProvenanceStatus: result.approvalProvenance.status',
  'approvalProvenanceCount: result.approvalProvenance.approvalCount',
  'writeOutput(args.get(\'--output\'), result.evidence)',
]) assert.ok(runnerSource.includes(marker), `runner missing ${marker}`);
assert.equal(
  runnerSource.includes(
    "from './project-art/eva-dense-motion-family-release-assembly-v2.mjs'",
  ),
  false,
  'operational runner must not import the legacy assembler directly',
);
assert.equal(
  runnerSource.includes('compileEvaDenseMotionFamilyReleaseEvidenceV2({'),
  false,
  'operational runner must not call the legacy assembler directly',
);

assert.equal(EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION_V2, '2026-08-22.2');
const capabilities = evaDenseMotionFamilyReleaseAssemblyV2Capabilities();
assert.equal(capabilities.nonCircularFamilyEvidenceFingerprintRequired, true);
assert.equal(capabilities.distinctFamilyApproversRequired, true);
assert.equal(capabilities.exactTenRuntimeFrameEvidenceRequired, true);
assert.equal(capabilities.exactTenContinuityEdgesRequired, true);
assert.equal(capabilities.runtime037OrNewerRequired, true);
assert.equal(capabilities.providerExecution, false);
assert.equal(capabilities.cloudinaryUpload, false);
assert.equal(capabilities.publication, false);
assert.equal(capabilities.deployment, false);
assert.equal(capabilities.runtimeActivation, false);

assert.equal(EVA_DENSE_MOTION_FAMILY_RELEASE_PROVENANCE_GATE_VERSION, '2026-09-09.1');
const provenanceCapabilities = evaDenseMotionFamilyReleaseAssemblyV2ProvenanceCapabilities();
assert.equal(provenanceCapabilities.delegatesToV2Assembly, true);
assert.equal(provenanceCapabilities.preservesV2FailClosedReleaseEvaluation, true);
assert.equal(provenanceCapabilities.fileBackedHumanFamilyApprovalEvidenceRequired, true);
assert.equal(provenanceCapabilities.byteExactSha256VerificationRequired, true);
assert.equal(provenanceCapabilities.semanticReviewBindingRequired, true);
assert.equal(provenanceCapabilities.distinctHumanApproversRequired, true);
assert.equal(provenanceCapabilities.distinctEvidenceFilesRequired, true);
assert.equal(provenanceCapabilities.exactTenRuntimeFrameEvidenceRequired, true);
assert.equal(provenanceCapabilities.exactTenContinuityEdgesRequired, true);
assert.equal(provenanceCapabilities.providerExecution, false);
assert.equal(provenanceCapabilities.imageMutation, false);
assert.equal(provenanceCapabilities.publication, false);
assert.equal(provenanceCapabilities.deployment, false);
assert.equal(provenanceCapabilities.runtimeActivation, false);

const tenMasterProgram = compileEvaDenseMotionTenMasterProgram(
  createEvaDenseMotionTenMasterRequest({
    programId: 'eva-dense-motion-production-status-guard-v1',
    actorId: 'eva-dense-motion-production-status-guard',
    createdAt: '2026-09-09T00:00:00.000Z',
  }),
);
const productionStatus = compileEvaDenseMotionProductionStatusV1(tenMasterProgram);
assert.equal(productionStatus.summary, 'three-frame-fallback-live__ten-new-final-masters-not-produced');
assert.equal(productionStatus.publicFallback.frameCount, 3);
assert.deepEqual(productionStatus.publicFallback.ordinals, [4, 5, 6]);
assert.equal(productionStatus.publicFallback.finalMasterEligibleCount, 0);
assert.equal(productionStatus.finalMasterProduction.sourceContractsBound, 10);
assert.equal(productionStatus.finalMasterProduction.requiredNewMasterCount, 10);
assert.equal(productionStatus.finalMasterProduction.producedMasterCount, 0);
assert.equal(productionStatus.finalMasterProduction.remainingMasterCount, 10);
assert.equal(productionStatus.finalMasterProduction.sourcesBoundDoesNotMeanMastersProduced, true);
assert.equal(productionStatus.continuity.requiredEdgeCount, 10);
assert.equal(productionStatus.continuity.reviewedEdgeCount, 0);
assert.equal(productionStatus.continuity.remainingEdgeCount, 10);
assert.equal(productionStatus.release.releaseReady, false);
assert.equal(productionStatus.release.runtimeActivationReady, false);
assert.equal(productionStatus.evidenceBoundary.workstationSourceMediaPreflightClaimed, false);
assert.equal(productionStatus.evidenceBoundary.candidateBytesClaimed, false);
assert.equal(productionStatus.evidenceBoundary.reviewEvidenceClaimed, false);
const productionStatusCapabilities = evaDenseMotionProductionStatusV1Capabilities();
assert.equal(productionStatusCapabilities.separatesLiveFallbackFromFinalMasterSet, true);
assert.equal(productionStatusCapabilities.separatesSourceContractsFromProducedMasters, true);
assert.equal(productionStatusCapabilities.refusesUnobservedWorkstationEvidenceClaims, true);
assert.equal(productionStatusCapabilities.partialPromotionAllowed, false);
assert.equal(productionStatusCapabilities.runtimeActivation, false);

console.log('EVA dense family release assembler v2 guard passed.');
console.log('- family approvals sign non-circular evidence fingerprint');
console.log('- owner, creative director and technical director must be distinct humans');
console.log('- human approval provenance is file-backed, byte-hashed and semantically bound');
console.log('- operational family runner cannot bypass the provenance gate');
console.log('- public status distinguishes the live three-frame fallback from zero produced final masters');
console.log('- exact ten-frame and ten-continuity-edge release semantics remain authoritative');
console.log('- existing release evaluator remains authoritative');
console.log('- publication, deployment and activation remain closed');
