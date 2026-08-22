import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  preflightAvatarFinalPassProviderFrameReviewFiles,
} from './avatar-final-pass-provider-frame-review-preflight.mjs';
import {
  reviewAvatarFinalPassProviderFrameFilesPinned,
} from './avatar-final-pass-provider-frame-review-pinned.mjs';
import {
  canonicalRelativePath,
  deepFreeze,
  sha256Bytes,
  sha256Document,
  snapshotJsonValue,
  timestamp,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  verifyEvaDenseMotionMasteringCampaignReceipt,
} from './eva-dense-motion-mastering-campaign.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';

export const EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_PLAN_SCHEMA =
  'evavo.project-art-eva-dense-motion-frame-review-intake-plan.v1';
export const EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_RECEIPT_SCHEMA =
  'evavo.project-art-eva-dense-motion-frame-review-intake-receipt.v1';
export const EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_CAPABILITIES_SCHEMA =
  'evavo.project-art-eva-dense-motion-frame-review-intake-capabilities.v1';
export const EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION =
  '2026-08-22.1';

const FRAME_COUNT = 10;
const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;

function assert(condition, code, message = code) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function authority() {
  return Object.freeze({
    masteringEvidenceRead: true,
    humanDecisionRead: true,
    humanDecisionVerification: true,
    reviewOutcomePersistence: true,
    humanDecisionCreation: false,
    automaticCreativeDecision: false,
    technicalInspectionCreation: false,
    creativeApprovalCreation: false,
    candidatePromotion: false,
    cloudinaryUpload: false,
    sequenceAdmission: false,
    sequenceRelease: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function realDirectory(value, label) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'EVA_DENSE_FRAME_REVIEW_ROOT_INVALID',
    label,
  );
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(normalized) === normalized,
    'EVA_DENSE_FRAME_REVIEW_ROOT_INVALID',
    label,
  );
  return normalized;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRelative(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = path.join(root, ...canonical.split('/'));
  assert(inside(root, absolute), 'EVA_DENSE_FRAME_REVIEW_PATH_ESCAPE', label);
  return absolute;
}

function stableJson(filePath, label) {
  const lexical = path.resolve(filePath);
  const before = lstatSync(lexical);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= 2 &&
      before.size <= MAXIMUM_JSON_BYTES &&
      realpathSync(lexical) === lexical,
    'EVA_DENSE_FRAME_REVIEW_INPUT_INVALID',
    label,
  );
  const bytes = readFileSync(lexical);
  const after = lstatSync(lexical);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'EVA_DENSE_FRAME_REVIEW_INPUT_CHANGED',
      label,
    );
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    assert(false, 'EVA_DENSE_FRAME_REVIEW_JSON_INVALID', label);
  }
  return Object.freeze({ absolute: lexical, bytes, sha256: sha256Bytes(bytes), value });
}

function writeJsonCreateOnly(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const handle = openSync(filePath, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function genericPaths(job) {
  const stem = job.outputs.alphaMastered.slice(0, -4);
  return Object.freeze({
    finisherReport: `${stem}.frame-finisher.json`,
    reviewRequest: `${stem}.frame-review-request.json`,
    reviewOutcome: `${stem}.frame-review-outcome.json`,
  });
}

function decisionRelative(job) {
  return `${job.outputs.frameRoot}/named-human.frame-review-decision.json`;
}

function expectedOutcomeStatus(decision) {
  if (decision === 'approve-final-frame') return 'final-frame-admitted';
  if (decision === 'repair-frame') return 'frame-repair-required';
  if (decision === 'reject-frame') return 'frame-rejected';
  return null;
}

export function compileEvaDenseMotionFrameReviewIntakePlan({
  tenMasterProgram: programInput,
  masteringCampaignReceipt: campaignInput,
  workspaceRoot: workspaceInput,
  reviewedAt,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(programInput);
  const campaign = verifyEvaDenseMotionMasteringCampaignReceipt(
    campaignInput,
    program,
  );
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  const at = timestamp(reviewedAt, 'reviewedAt');

  const preflights = program.production.jobs.map((job, index) => {
    const paths = genericPaths(job);
    const decisionPath = resolveRelative(
      workspaceRoot,
      decisionRelative(job),
      `frames[${index}].decision`,
    );
    assert(
      existsSync(decisionPath),
      'EVA_DENSE_FRAME_REVIEW_DECISION_MISSING',
      `frame ${job.ordinal}`,
    );
    const preflight = preflightAvatarFinalPassProviderFrameReviewFiles({
      workspaceRoot,
      frameFinisherReportPath: resolveRelative(
        workspaceRoot,
        paths.finisherReport,
        `frames[${index}].finisherReport`,
      ),
      frameReviewRequestPath: resolveRelative(
        workspaceRoot,
        paths.reviewRequest,
        `frames[${index}].reviewRequest`,
      ),
      frameReviewDecisionPath: decisionPath,
      reviewedAt: at,
    });
    const campaignFrame = campaign.frames[index];
    assert(
      campaignFrame.ordinal === job.ordinal &&
        campaignFrame.frameId === job.frameId &&
        campaignFrame.frameFinisherSha256 === preflight.frameFinisherSha256 &&
        preflight.expectedOutcome.status === expectedOutcomeStatus(preflight.decision),
      'EVA_DENSE_FRAME_REVIEW_MASTERING_BINDING_INVALID',
      `frame ${job.ordinal}`,
    );
    return deepFreeze({
      ordinal: job.ordinal,
      frameId: job.frameId,
      decision: preflight.decision,
      reviewer: preflight.reviewer,
      decisionFileSha256: preflight.decisionFileSha256,
      decisionSha256: preflight.decisionSha256,
      frameFinisherSha256: preflight.frameFinisherSha256,
      reviewRequestSha256: preflight.reviewRequestSha256,
      finishedFrameSha256: preflight.finishedFrameSha256,
      expectedReviewOutcomeSha256: preflight.expectedOutcome.reviewOutcomeSha256,
      expectedFinalFrameSha256: preflight.expectedOutcome.finalFrameSha256,
      expectedStatus: preflight.expectedOutcome.status,
      paths: Object.freeze({
        finisherReport: paths.finisherReport,
        reviewRequest: paths.reviewRequest,
        decision: decisionRelative(job),
        reviewOutcome: paths.reviewOutcome,
      }),
    });
  });

  assert(
    preflights.length === FRAME_COUNT,
    'EVA_DENSE_FRAME_REVIEW_FRAME_COUNT_INVALID',
  );
  const body = {
    schema: EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_PLAN_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION,
    status: 'ready-for-pinned-ten-frame-human-review-intake',
    familyId: program.familyId,
    programSha256: program.programSha256,
    masteringCampaignReceiptSha256: campaign.campaignReceiptSha256,
    reviewedAt: at,
    policy: Object.freeze({
      exactFrameCount: FRAME_COUNT,
      decisionsMustBeExternallyAuthoredNamedHumanEvidence: true,
      automaticDecisionCreationAllowed: false,
      allTenShadowReviewedBeforeFirstPersistentOutcome: true,
      exactDecisionFileShaPinnedAfterPreflight: true,
      mixedHumanOutcomesPreserved: true,
      allApprovedRequiredForReleaseEvidenceProgression: true,
    }),
    frames: Object.freeze(preflights),
    authority: authority(),
  };
  return deepFreeze({ ...body, planSha256: sha256Document(body) });
}

export function runEvaDenseMotionFrameReviewIntake({
  tenMasterProgram,
  masteringCampaignReceipt,
  workspaceRoot: workspaceInput,
  reviewedAt,
}) {
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  const plan = compileEvaDenseMotionFrameReviewIntakePlan({
    tenMasterProgram,
    masteringCampaignReceipt,
    workspaceRoot,
    reviewedAt,
  });

  const results = [];
  for (const frame of plan.frames) {
    const result = reviewAvatarFinalPassProviderFrameFilesPinned({
      workspaceRoot,
      frameFinisherReportPath: resolveRelative(
        workspaceRoot,
        frame.paths.finisherReport,
        'frame.finisherReport',
      ),
      frameReviewRequestPath: resolveRelative(
        workspaceRoot,
        frame.paths.reviewRequest,
        'frame.reviewRequest',
      ),
      frameReviewDecisionPath: resolveRelative(
        workspaceRoot,
        frame.paths.decision,
        'frame.decision',
      ),
      expectedDecisionFileSha256: frame.decisionFileSha256,
      reviewedAt: plan.reviewedAt,
    });
    assert(
      result?.outcome?.reviewOutcomeSha256 === frame.expectedReviewOutcomeSha256 &&
        result.outcome.status === frame.expectedStatus &&
        result.outcome.finalFrameSha256 === frame.expectedFinalFrameSha256 &&
        result.outcome.reviewer?.actorClass === 'human',
      'EVA_DENSE_FRAME_REVIEW_PERSISTED_OUTCOME_MISMATCH',
      `frame ${frame.ordinal}`,
    );
    results.push(
      deepFreeze({
        ordinal: frame.ordinal,
        frameId: frame.frameId,
        decision: frame.decision,
        status: result.outcome.status,
        reviewer: result.outcome.reviewer,
        reviewOutcomeSha256: result.outcome.reviewOutcomeSha256,
        finalFrameSha256: result.outcome.finalFrameSha256,
        reviewOutcomePath: frame.paths.reviewOutcome,
      }),
    );
  }

  const approvedCount = results.filter(
    (entry) => entry.status === 'final-frame-admitted',
  ).length;
  const repairCount = results.filter(
    (entry) => entry.status === 'frame-repair-required',
  ).length;
  const rejectedCount = results.filter(
    (entry) => entry.status === 'frame-rejected',
  ).length;
  const allApproved = approvedCount === FRAME_COUNT;
  const body = {
    schema: EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_RECEIPT_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION,
    status: allApproved
      ? 'succeeded-all-ten-human-approved'
      : 'succeeded-human-review-recorded-repair-or-rejection-present',
    familyId: plan.familyId,
    programSha256: plan.programSha256,
    masteringCampaignReceiptSha256: plan.masteringCampaignReceiptSha256,
    planSha256: plan.planSha256,
    reviewedAt: plan.reviewedAt,
    counts: Object.freeze({
      reviewed: results.length,
      approved: approvedCount,
      repairRequired: repairCount,
      rejected: rejectedCount,
    }),
    frames: Object.freeze(results),
    nextStage: allApproved
      ? 'technical-inspection-and-release-evidence-adapter'
      : 'repair-or-replacement-before-release-evidence',
    effects: Object.freeze({
      humanDecisionsCreated: 0,
      reviewOutcomesPersisted: results.length,
      technicalInspectionsCreated: 0,
      creativeApprovalsCreated: 0,
      cloudinaryUploadsPerformed: 0,
      sequencesReleased: 0,
      repositoriesMutated: 0,
      gitMutationsPerformed: 0,
      runtimeActivationsPerformed: 0,
    }),
    authority: authority(),
  };
  return deepFreeze({ ...body, receiptSha256: sha256Document(body) });
}

export function persistEvaDenseMotionFrameReviewIntakeEvidence({
  outputRoot: outputInput,
  plan,
  receipt,
}) {
  const outputRoot = realDirectory(outputInput, 'outputRoot');
  const planPath = path.join(outputRoot, 'campaign-plan.json');
  const receiptPath = path.join(outputRoot, 'campaign-execution.json');
  assert(
    !existsSync(planPath) && !existsSync(receiptPath),
    'EVA_DENSE_FRAME_REVIEW_EVIDENCE_ALREADY_EXISTS',
  );
  writeJsonCreateOnly(planPath, plan);
  writeJsonCreateOnly(receiptPath, receipt);
  return Object.freeze({ planPath, receiptPath });
}

export function evaDenseMotionFrameReviewIntakeCapabilities() {
  return deepFreeze({
    schema: EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_CAPABILITIES_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION,
    exactTenFrameSetRequired: true,
    successfulMasteringCampaignRequired: true,
    externallyAuthoredNamedHumanDecisionsRequired: true,
    allTenShadowReviewedBeforeFirstPersistentOutcome: true,
    exactDecisionFileShaPinnedAfterPreflight: true,
    automaticDecisionCreationAllowed: false,
    mixedHumanOutcomesPreserved: true,
    technicalInspectionCreated: false,
    creativeApprovalCreated: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    runtimeActivation: false,
    authority: authority(),
  });
}
