#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "evavo-image-quality-pipeline-doctor";
const SERVER_VERSION = "1.29.0";
const PROTOCOL_VERSION = "2025-03-26";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHECKS = Object.freeze([
  { id: "alpha-aware-quality", file: "packages/media/src/existing-image-quality-review.ts", tokens: ["alpha-weighted-visible-pixels", "visiblePixelRatio", "transparentRgbDetectionMode"] },
  { id: "profile-aware-defects", file: "packages/media/src/existing-image-defect-detection.ts", tokens: ["resolveTransparentRgbMode", "haloColorDistanceThreshold"] },
  { id: "defect-regions", file: "packages/media/src/defect-region-components.ts", tokens: ["segmentDefectMaskRegions", "retainedComponentCount"] },
  { id: "finishing-plan", file: "packages/media/src/existing-image-finishing-plan.ts", tokens: ["planExistingImageFinishing", "automaticRepairAllowed: false", "localized-repair", "manual-review"] },
  { id: "artifact-signals", file: "packages/media/src/image-artifact-signals.ts", tokens: ["ringingRiskRatio", "posterizationRisk", "nearestNeighbourUpscaleRisk"] },
  { id: "enhancement-session", file: "tools/enhancement_review_session_mcp.mjs", tokens: ["evavo.enhancement-art-review-session.v1_5", "evavo_verify_enhancement_review_session", "proofSha256AndLengthBound: true"] },
  { id: "work-preview-core-v8", file: "packages/media/src/work-header-preview-admission.ts", tokens: ["evavo.work-header-candidate-preview-capture.v8", "browserResponseBodyIdentityVerified", "browserResponseMetadataBound", "exactTriggeredBrowserRequestBindingVerified", "browserResponseBindings", "exactTriggeredRequestsBoundAcrossProfiles", "browserCandidateRequestBindingRequired", "atomicEvidenceBundleVerified: true"] },
  { id: "work-preview-mcp-v180", file: "tools/work_header_preview_admission_mcp.mjs", tokens: ['SERVER_VERSION = "1.8.0"', 'acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v8"', "exactTriggeredBrowserRequestBindingRequired: true", 'exactTriggeredBrowserRequestMethod: "GET"', "browserResponseMetadataShaAndLengthBound: true", "browserResponseMetadataPersistedPerProfile: true", "exactTriggeredBrowserRequestBindingVerified: true", "evavo_verify_work_header_preview_admission"] },
  { id: "work-page-review-input-safety", file: "packages/media/src/work-header-page-render-review.ts", tokens: ["MAX_SCREENSHOT_BYTES", "MAX_NOTES = 24", "MAX_NOTE_CHARACTERS = 500", "MAX_NOTES_CHARACTERS = 4_000", "normalizedReviewInputsPersisted: true", "reviewInputs", "pageSlug must be a canonical Work detail route under /work/.", "must be boolean.", "notes exceed the"] },
  { id: "work-page-review-v220", file: "tools/work_header_page_render_review_mcp.mjs", tokens: ['SERVER_VERSION = "2.2.0"', "normalizedPageReviewInputsPersisted: true", "pageReviewEvidenceRecomputedDuringVerification: true", "pageReviewProofRecomputedDuringVerification: true", "tamperedPageReviewScoresFlagsOrNotesRejected: true", "Page-render evidence changed after review or no longer recomputes from persisted normalized review inputs.", "Page-render proof no longer recomputes from exact screenshots and normalized review inputs.", "pageReviewEvidenceRecomputedAndMatched: true", "pageReviewProofRecomputedAndMatched: true", "exactTriggeredBrowserRequestBindingRequiredFromAdmission: true", "selectionReceiptShaAndLengthBound: true", "candidateReviewReceiptShaAndLengthBound: true", "previewAdmissionReceiptShaAndLengthBound: true", "previewManifestShaAndLengthBound: true", "pageSourceBindingsShaAndLengthReverified: true", "fullReceiptLineageVerifiedBeforeApprovalPacket: true", "approvalPacketReverificationAvailable: true", "approvalPacketCoreRecomputedDuringVerification: true", "staleApprovalPacketLineageRejected: true", "evavo_verify_work_header_approval_packet", "automaticPublicationAllowed: false"] },
  { id: "work-explicit-approval-decision", file: "tools/work_header_approval_decision_mcp.mjs", tokens: ['CONTRACT = "evavo.work-header-approval-decision.v1"', "explicitReviewerDecisionRequired: true", "automaticDecisionAllowed: false", "approvalPacketReverificationRequired: true", "approvedDecisionAllowsPublicationPreparationOnly: true", "publicationAllowed: false", "cloudOverwriteAllowed: false", "websiteMutationAllowed: false"] },
  { id: "work-publication-preparation", file: "tools/work_header_publication_preparation_mcp.mjs", tokens: ['CONTRACT = "evavo.work-header-publication-preparation.v1"', "explicitApprovedDecisionRequired: true", "approvalDecisionReverificationRequired: true", "backupRequiredBeforeExecution: true", "rollbackEvidenceRequiredBeforeExecution: true", "executionAllowed: false", "publicationAllowed: false"] },
  { id: "work-publication-transaction-plan", file: "tools/work_header_publication_transaction_plan_mcp.mjs", tokens: ['CONTRACT = "evavo.work-header-publication-transaction-plan.v1"', "explicitExecutionConfirmationRequired: true", "currentTargetSnapshotRequired: true", "separateRollbackBackupRequired: true", "exactRollbackByteMatchRequired: true", "executionAllowed: false", "publicationAllowed: false"] },
  { id: "work-publication-target-aware-recheck", file: "tools/lib/publication_target_recheck.mjs", tokens: ['CLOUDINARY_HOST = "res.cloudinary.com"', 'CLOUDINARY_CLOUD = "dntogqtey"', "unversioned stable delivery URL", 'cache: "no-store"', "cloudinary-stable-id-replacement", "currentTargetRecheckUrl", "currentTargetRecheckPath", "live-remote-cloudinary", "governed-local-website-source"] },
  { id: "work-publication-execution-authorization", file: "tools/work_header_publication_execution_authorization_mcp.mjs", tokens: ['SERVER_VERSION = "1.1.0"', 'CONTRACT = "evavo.work-header-publication-execution-authorization.v1"', "confirmExecutionAuthorization=true is required", "targetAwareCurrentTargetRecheck: true", "cloudinaryUsesLiveRemoteRecheck: true", "cloudinaryUnversionedStableDeliveryUrlRequired: true", "cloudinaryCallerLocalRecheckRejected: true", "singleTransactionAuthorizationOnly: true", "authorizationExpiresOnAnyEvidenceDrift: true", "executionAllowed: false", "publicationAllowed: false"] },
  { id: "work-publication-execution-claim", file: "tools/work_header_publication_execution_claim_mcp.mjs", tokens: ['SERVER_VERSION = "1.1.0"', 'CONTRACT = "evavo.work-header-publication-execution-claim.v1"', "targetAwareCurrentTargetRecheck: true", "cloudinaryUsesLiveRemoteRecheck: true", "cloudinaryUnversionedStableDeliveryUrlRequired: true", "deterministicClaimPathRequired: true", "createOnlySingleUseClaim: true", "secondClaimForSameAuthorizationRejected: true", "claimInvalidOnAnyEvidenceDrift: true", "executionAllowed: false", "publicationAllowed: false"] },
  { id: "work-publication-execution-result", file: "tools/work_header_publication_execution_result_mcp.mjs", tokens: ['CONTRACT = "evavo.work-header-publication-execution-result.v1"', "observedExternalExecutionOnly: true", "postExecutionTargetMustExactlyMatchCandidate: true", "rollbackBackupMustRemainPreserved: true", "resultIsEvidenceOnly: true", "executionPerformedByThisTool: false", "executionAllowed: false", "publicationAllowed: false"] },
  { id: "work-publication-rollback-readiness", file: "tools/work_header_publication_rollback_readiness_mcp.mjs", tokens: ['CONTRACT = "evavo.work-header-publication-rollback-readiness.v1"', "currentPublishedTargetMustStillMatchCandidate: true", "rollbackBackupMustExactlyMatchPreviousTarget: true", "rollbackPreparationOnly: true", "rollbackExecutionAllowed: false", "publicationAllowed: false"] },
  { id: "work-publication-postflight", file: "tools/work_header_publication_postflight_mcp.mjs", tokens: ['CONTRACT = "evavo.work-header-publication-postflight.v1"', 'SCHEMA_SHA256 = "5a1a2a9a329d3ce4eecd81981e3aa35cd2d6d2d3487f78b6b56672bacca99ae8"', "executionResultReverificationRequired: true", "rollbackReadinessReverificationRequired: true", "currentLiveTargetMustExactlyMatchReviewedCandidate: true", "rollbackBackupMustRemainReady: true", "postflightEvidenceOnly: true", "publicationAllowed: false", "cloudOverwriteAllowed: false", "websiteMutationAllowed: false"] },
  { id: "work-publication-rollback-authorization", file: "tools/work_header_publication_rollback_authorization_mcp.mjs", tokens: ['SERVER_VERSION = "1.1.0"', 'CONTRACT = "evavo.work-header-publication-rollback-authorization.v1"', 'SCHEMA_SHA256 = "3f23166dc2901ba09f222682b2d6e2be4ab84e4d0ad4d469ae9c041e3bac211b"', "explicitRollbackConfirmationRequired: true", "publicationPostflightReverificationRequired: true", "postflightLiveTargetMustMatchCandidate: true", "postflightRollbackBackupMustRemainReady: true", "singleRollbackTransactionAuthorizationOnly: true", "authorizationExpiresOnAnyEvidenceDrift: true", "rollbackExecutionAllowed: false", "publicationAllowed: false"] },
  { id: "work-publication-rollback-execution-claim", file: "tools/work_header_publication_rollback_execution_claim_mcp.mjs", tokens: ['SERVER_VERSION = "1.1.0"', 'CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1"', 'SCHEMA_SHA256 = "2abc5c031803e2d29c40fe80dcc118ca4ee984e3f0a9a1fe7da17455acbf4e78"', "confirmSingleUseRollbackClaim=true is required", "singleUseRollbackClaimEstablished", "claimInvalidOnAnyEvidenceDrift", "currentPublishedTargetRecheckedAtClaim", "rollbackBackupReverifiedAtClaim", "rollbackExecutionAllowed: false", "publicationAllowed: false"] },
  { id: "work-publication-rollback-execution-result", file: "tools/work_header_publication_rollback_execution_result_mcp.mjs", tokens: ['SERVER_VERSION = "1.1.0"', 'CONTRACT = "evavo.work-header-publication-rollback-execution-result.v1"', 'SCHEMA_SHA256 = "2c963f8ba6adb05deb871e62c0803d78c55f68da551127c01b07c82df2480352"', "publicationPostflightReceiptPath", "rollback-authorized-unexecuted", "rollback-claimed-unexecuted", "rollback backup no longer exactly matches the previous-target snapshot bytes", "rollbackExecutionAllowed: false", "publicationAllowed: false"] },
  { id: "durable-review", file: "tools/image_review_session_mcp.mjs", tokens: ["evavo.image-review-session.v1_1", "sourceSha256AndLengthBound: true", "staleEvidenceVerification: true"] },
  { id: "safe-bundle", file: "tools/lib/create_only_bundle.mjs", tokens: ["writeCreateOnlyBundle", "rollback", "preflight"] },
  { id: "mcp-registration", file: ".mcp.json", tokens: ["evavo-image-review-session-v1", "evavo-image-quality-pipeline-doctor-v1", "evavo-work-header-preview-admission-v1", "evavo-work-header-page-render-review-v1", "evavo-work-header-approval-decision-v1", "evavo-work-header-publication-preparation-v1", "evavo-work-header-publication-transaction-plan-v1", "evavo-work-header-publication-execution-authorization-v1", "evavo-work-header-publication-execution-claim-v1", "evavo-work-header-publication-execution-result-v1", "evavo-work-header-publication-rollback-readiness-v1", "evavo-work-header-publication-rollback-authorization-v1", "evavo-work-header-publication-rollback-execution-claim-v1", "evavo-work-header-publication-rollback-execution-result-v1"] },
]);

async function inspect() {
  const checks = [];
  for (const check of CHECKS) {
    try {
      const source = await readFile(path.join(repoRoot, check.file), "utf8");
      const missing = check.tokens.filter((token) => !source.includes(token));
      checks.push({ id: check.id, file: check.file, ok: missing.length === 0, missing });
    } catch (error) {
      checks.push({ id: check.id, file: check.file, ok: false, missing: ["file-unreadable"], error: String(error) });
    }
  }
  const blockers = checks.filter((check) => !check.ok).map((check) => check.id);
  return Object.freeze({
    contract: "evavo.image-quality-pipeline-doctor.v1_29",
    ready: blockers.length === 0,
    blockerCount: blockers.length,
    blockers,
    checks,
    executionPerformed: false,
    sourceMutationPerformed: false,
    publicationAllowed: false,
    nextAction: blockers.length
      ? "Repair failing image-quality contract surfaces before trusting publication or rollback evidence."
      : "Static image-quality evidence now runs from preservation through exact browser review, deterministic page-review score/flag/note recomputation, explicit approval, rollback-safe publication planning, target-aware live current-target checks at authorization and single-use claim, execution evidence, publication postflight and the complete postflight-gated rollback chain.",
  });
}

const tools = Object.freeze([
  { name: "evavo_image_quality_pipeline_doctor_capabilities", description: "Describe the read-only EVAVO image quality pipeline doctor.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_run_image_quality_pipeline_doctor", description: "Inspect preservation, deterministic reviewed-image evidence, target-aware publication TOCTOU protection, post-publication verification and rollback evidence without mutating source, website or Cloudinary state.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
]);
function capabilities() {
  return Object.freeze({
    contract: "evavo.image-quality-pipeline-doctor.v1_29",
    serverVersion: SERVER_VERSION,
    readOnly: true,
    browserResponseBodyLineageChecked: true,
    exactTriggeredBrowserRequestBindingChecked: true,
    fullPageReviewReceiptLineageChecked: true,
    normalizedPageReviewInputsChecked: true,
    pageReviewEvidenceRecomputationChecked: true,
    pageReviewProofRecomputationChecked: true,
    tamperedPageReviewScoresFlagsOrNotesRejected: true,
    approvalPacketReverificationChecked: true,
    explicitReviewerDecisionBoundaryChecked: true,
    publicationPreparationBoundaryChecked: true,
    publicationTransactionPlanBoundaryChecked: true,
    publicationTargetAwareRecheckChecked: true,
    cloudinaryLiveStableTargetRecheckChecked: true,
    publicationExecutionAuthorizationBoundaryChecked: true,
    publicationExecutionSingleUseClaimBoundaryChecked: true,
    publicationExecutionResultAttestationBoundaryChecked: true,
    publicationRollbackReadinessBoundaryChecked: true,
    publicationPostflightBoundaryChecked: true,
    rollbackAuthorizationPostflightGateChecked: true,
    rollbackSingleUseClaimBoundaryChecked: true,
    rollbackExecutionResultEvidenceBoundaryChecked: true,
    rollbackMutationAuthorityAbsent: true,
    runtimeExecutionPerformed: false,
    sourceMutationPerformed: false,
    publicationAllowed: false,
    checkCount: CHECKS.length,
  });
}
async function callTool(name) {
  if (name === "evavo_image_quality_pipeline_doctor_capabilities") return capabilities();
  if (name === "evavo_run_image_quality_pipeline_doctor") return inspect();
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}
const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line);
    let outgoing = null;
    if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
    else if (message.method === "notifications/initialized") outgoing = null;
    else if (message.method === "tools/list") outgoing = response(message.id, { tools });
    else if (message.method === "tools/call") {
      try { outgoing = response(message.id, toolResult(await callTool(message.params?.name))); }
      catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); }
    }
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`);
  }
}
