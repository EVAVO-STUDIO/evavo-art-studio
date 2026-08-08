#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');
const policy = JSON.parse(await read('../config/raw-art-production-orchestrator.v1.json'));
const queue = await read('./compile-raw-art-production-queue.mjs');
const workspace = await read('./compile-raw-art-workspace-job.mjs');
const style = await read('./build-approved-style-profile.mjs');
const provider = (
  await Promise.all([
    read('./compile-raw-art-provider-requests.mjs'),
    read('./raw-art-provider/shared.mjs'),
    read('./raw-art-provider/template.mjs'),
    read('./raw-art-provider/finalize.mjs'),
    read('./raw-art-provider/compile.mjs'),
  ])
).join('\n');
const providerCheck = await read('./check-raw-art-provider-requests.mjs');
const errors = [];

if (policy.schema !== 'evavo.raw-art-production-orchestrator.v3') {
  errors.push('orchestrator identity changed');
}
if (
  policy.campaignSchema !== 'evavo.brass-brine.raw-art-production-campaign-state.v1' ||
  policy.campaignRevision !== 'evavo.brass-brine.raw-art-production-campaign-revision.v3' ||
  policy.providerRoleMapSchema !== 'evavo.brass-brine.raw-art-provider-role-map.v2' ||
  policy.providerArtifactBindingsTemplateSchema !== 'evavo.raw-art-provider-artifact-bindings-template.v2' ||
  policy.providerArtifactBindingsSchema !== 'evavo.raw-art-provider-artifact-bindings.v2' ||
  policy.providerRequestBatchSchema !== 'evavo.raw-art-provider-request-batch.v2' ||
  policy.providerRequestMetadataSchema !== 'evavo.raw-art-provider-request-metadata.v2'
) {
  errors.push('orchestrator provider campaign schemas changed');
}
for (const state of [
  'blocked-missing-decision',
  'blocked-role-unmapped',
  'blocked-target-unresolved',
  'blocked-source-evidence',
  'blocked-receipt-mismatch',
  'ready-deterministic',
  'provider-required',
  'reference-only',
  'held-rejected',
  'completed',
]) {
  if (!policy.states.includes(state) || !queue.includes(`'${state}'`)) {
    errors.push(`missing queue state ${state}`);
  }
}
for (const token of [
  'evavo.raw-art-production-queue.v2',
  'receiptCannotBypassReviewDecision',
  'target path collision',
  'decoded-dimensions-and-source-byte-length-are-required',
  'exact-source-target-and-output-receipt-present',
  'resumableBySourceSha256AndTargetPath',
  'queueSha256',
]) {
  if (!queue.includes(token)) errors.push(`queue compiler lost ${token}`);
}
for (const token of [
  'evavo.governed-workspace-job.v1',
  'sharp-delivery-optimizer',
  'sharp-exact-canvas-runtime',
  'python-pillow-fallback',
  'run_art_delivery_optimizer.py',
  'process_image_with_sharp.mjs',
  'process_image_with_pillow.py',
  "type: 'run-node'",
  'executableCandidates',
  "kind: 'directory'",
  'minimumFiles',
  'sourceQueueSha256',
  'stagingOnly: true',
]) {
  if (!workspace.includes(token)) errors.push(`workspace compiler lost ${token}`);
}
for (const token of [
  'evavo.approved-style-reference-profile.v2',
  'duplicate style exemplar SHA-256',
  'approvedTraits',
  'knownDefectsToAvoid',
  'negativeConstraints',
  'approvalEvidence',
  'metadataReferenceOnly: true',
  'modelTrainingPerformed: false',
  'profileSha256',
]) {
  if (!style.includes(token)) errors.push(`style compiler lost ${token}`);
}
for (const token of [
  'evavo.brass-brine.raw-art-provider-role-map.v2',
  'evavo.raw-art-provider-artifact-bindings-template.v2',
  'evavo.raw-art-provider-artifact-bindings.v2',
  'evavo.raw-art-provider-request-batch.v2',
  'evavo.raw-art-provider-request-metadata.v2',
  'evavo.brass-brine.raw-art-production-campaign-revision.v3',
  'evavo.image-style-reference-bank.v1',
  'queue is not bound to the supplied Art Studio bridge bytes',
  'RAW_ART campaign lacks complete current-byte technical admission',
  'outside-campaign-next-batch',
  'campaign-stage-not-needs-processing',
  'campaign-technical-admission-not-passed',
  'approved-style-reference-artifact-missing',
  'canonical-identity-artifact-missing',
  'inpaint-mask-artifact-missing',
  'bindingsSha256',
  'batchSha256',
  'adapter-derived-from-target',
  'providerExecution: false',
  'runtimeSubmission: false',
  'writeCreateOnly',
]) {
  if (!provider.includes(token)) errors.push(`provider compiler lost ${token}`);
}
for (const token of [
  'campaign v3 nextBatch and technical admission gating passed',
  'create-only template, finalize and request compilation passed',
  'adapter-derived provider canvas prevents small source canvases from blocking execution',
  'immutable candidates and provider evidence remain unapproved and unpublished',
  'output already exists',
  'stale RAW_ART provider artifact bindings',
  'outside-campaign-next-batch',
  'campaign-technical-admission-not-passed',
]) {
  if (!providerCheck.includes(token)) errors.push(`provider regression lost ${token}`);
}
for (const source of [queue, workspace, style, provider]) {
  for (const forbidden of [
    'child_process',
    'spawn(',
    'exec(',
    'git push',
    'sourceDeletion: true',
    'providerExecution: true',
    'runtimeSubmission: true',
    'publication: true',
    'evavo.brass-brine.raw-art-provider-role-map.v1',
    'evavo.raw-art-provider-artifact-bindings.v1',
    'evavo.raw-art-provider-request-batch.v1',
  ]) {
    if (source.includes(forbidden)) errors.push(`orchestrator contains forbidden ${forbidden}`);
  }
}
if (
  policy.execution.sourceMutation !== false ||
  policy.execution.sourceDeletion !== false ||
  policy.execution.targetRepositoryMutation !== false ||
  policy.execution.providerExecution !== false ||
  policy.execution.runtimeSubmission !== false ||
  policy.execution.publication !== false ||
  policy.execution.receiptCannotBypassReviewDecision !== true ||
  policy.execution.stagingOnly !== true
) {
  errors.push('orchestrator authority boundary changed');
}
if (
  policy.styleLearning.metadataOnly !== true ||
  policy.styleLearning.modelTrainingClaimed !== false ||
  policy.styleLearning.duplicateExemplarsRejected !== true ||
  policy.styleLearning.technicallyGatedStyleBankRequiredForProviderRequests !== true ||
  policy.styleLearning.approvedStyleReferenceArtifactsRequiredForProviderRequests !== true ||
  policy.styleLearning.technicallyBlockedReferencesExcludedFromProviderRequests !== true
) {
  errors.push('style-learning truth boundary changed');
}
if (
  policy.providerWorkflow.gameOwnedRoleMapRequired !== true ||
  policy.providerWorkflow.exactQueueBindingRequired !== true ||
  policy.providerWorkflow.exactCampaignBindingRequired !== true ||
  policy.providerWorkflow.campaignNextBatchMembershipRequired !== true ||
  policy.providerWorkflow.completeTechnicalAdmissionRequired !== true ||
  policy.providerWorkflow.technicallyPassedCampaignItemRequired !== true ||
  policy.providerWorkflow.needsProcessingCampaignStageRequired !== true ||
  policy.providerWorkflow.exactStyleBankBindingRequired !== true ||
  policy.providerWorkflow.exactBridgeProviderMapDirectionAndStyleFileBindingsRequired !== true ||
  policy.providerWorkflow.finalizedArtifactBindingsSelfHashRequired !== true ||
  policy.providerWorkflow.immutableArtifactIdsRequired !== true ||
  policy.providerWorkflow.adapterDerivedProviderCanvasRequired !== true ||
  policy.providerWorkflow.automaticImmutableCandidateAndProviderEvidenceExpected !== true ||
  policy.providerWorkflow.providerExecutionSeparate !== true ||
  policy.providerWorkflow.runtimeSubmissionSeparate !== true ||
  policy.providerWorkflow.candidateApprovalSeparate !== true ||
  policy.providerWorkflow.createOnlyEvidence !== true
) {
  errors.push('provider-workflow truth boundary changed');
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const providerRegression = spawnSync(
  process.execPath,
  [path.join(root, 'scripts', 'check-raw-art-provider-requests.mjs')],
  {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    shell: false,
  },
);
if (providerRegression.status !== 0) {
  errors.push(
    `provider request regression failed: ${`${providerRegression.stdout || ''}\n${providerRegression.stderr || ''}`.trim()}`,
  );
}

console.log('EVAVO RAW_ART production orchestrator');
for (const error of errors) console.log(`  - ${error}`);
if (errors.length) process.exit(1);
console.log('  deterministic staging and governed provider-request bridge passed');
