import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  inspectAvatarProviderFramePng,
  sha256FrameFinisherDocument,
} from './avatar-final-pass-provider-frame-finisher.mjs';
import {
  canonicalRelativePath,
  deepFreeze,
  sha256Bytes,
  sha256Document,
  timestamp,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  verifyEvaDenseMotionCandidateAssurance,
} from './eva-dense-motion-candidate-assurance.mjs';
import {
  verifyEvaDenseMotionMasteringCampaignReceipt,
  verifyEvaDenseMotionMasteringFrameReceipt,
} from './eva-dense-motion-mastering-campaign.mjs';
import {
  EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_PLAN_SCHEMA,
  EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_RECEIPT_SCHEMA,
} from './eva-dense-motion-frame-review-intake.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';
import { inspectPngStructure } from './png-structure-v1.mjs';

export const EVA_DENSE_MOTION_TECHNICAL_INSPECTION_SCHEMA =
  'evavo.project-art-eva-dense-motion-technical-inspection.v1';
export const EVA_DENSE_MOTION_CREATIVE_APPROVAL_EVIDENCE_SCHEMA =
  'evavo.project-art-eva-dense-motion-creative-approval-evidence.v1';
export const EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_RECEIPT_SCHEMA =
  'evavo.project-art-eva-dense-motion-reviewed-frame-evidence-receipt.v1';
export const EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_PROTOCOL_VERSION =
  '2026-08-22.1';

const FRAME_COUNT = 10;
const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;
const MAXIMUM_PNG_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

function assert(condition, code, message = code) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function authority() {
  return Object.freeze({
    masteredFrameRead: true,
    candidateAssuranceRead: true,
    humanReviewOutcomeRead: true,
    deterministicTechnicalInspection: true,
    humanApprovalLineageSealing: true,
    technicalEvidencePersistence: true,
    creativeApprovalEvidencePersistence: true,
    humanDecisionCreation: false,
    automaticCreativeDecision: false,
    imageMutation: false,
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
    'EVA_DENSE_REVIEWED_EVIDENCE_ROOT_INVALID',
    label,
  );
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(normalized) === normalized,
    'EVA_DENSE_REVIEWED_EVIDENCE_ROOT_INVALID',
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
  assert(inside(root, absolute), 'EVA_DENSE_REVIEWED_EVIDENCE_PATH_ESCAPE', label);
  return absolute;
}

function stableFile(filePath, label, maximum, minimum) {
  const lexical = path.resolve(filePath);
  const before = lstatSync(lexical);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= minimum &&
      before.size <= maximum &&
      realpathSync(lexical) === lexical,
    'EVA_DENSE_REVIEWED_EVIDENCE_INPUT_INVALID',
    label,
  );
  const bytes = readFileSync(lexical);
  const after = lstatSync(lexical);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'EVA_DENSE_REVIEWED_EVIDENCE_INPUT_CHANGED',
      label,
    );
  }
  return Object.freeze({ absolute: lexical, bytes, sha256: sha256Bytes(bytes) });
}

function stableJson(filePath, label) {
  const file = stableFile(filePath, label, MAXIMUM_JSON_BYTES, 2);
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
  } catch {
    assert(false, 'EVA_DENSE_REVIEWED_EVIDENCE_JSON_INVALID', label);
  }
  return Object.freeze({ ...file, value });
}

function verifySelfHash(value, field, schema, code) {
  assert(value?.schema === schema && SHA256.test(value?.[field]), code);
  const body = { ...value };
  delete body[field];
  assert(sha256Document(body) === value[field], code);
  return value;
}

function verifyReviewIntake(planInput, receiptInput, program, campaign) {
  const plan = verifySelfHash(
    planInput,
    'planSha256',
    EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_PLAN_SCHEMA,
    'EVA_DENSE_REVIEWED_EVIDENCE_REVIEW_PLAN_INVALID',
  );
  const receipt = verifySelfHash(
    receiptInput,
    'receiptSha256',
    EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_RECEIPT_SCHEMA,
    'EVA_DENSE_REVIEWED_EVIDENCE_REVIEW_RECEIPT_INVALID',
  );
  assert(
    plan.programSha256 === program.programSha256 &&
      plan.masteringCampaignReceiptSha256 === campaign.campaignReceiptSha256 &&
      receipt.programSha256 === program.programSha256 &&
      receipt.masteringCampaignReceiptSha256 === campaign.campaignReceiptSha256 &&
      receipt.planSha256 === plan.planSha256 &&
      receipt.status === 'succeeded-all-ten-human-approved' &&
      plan.frames?.length === FRAME_COUNT &&
      receipt.frames?.length === FRAME_COUNT &&
      receipt.counts?.reviewed === FRAME_COUNT &&
      receipt.counts?.approved === FRAME_COUNT &&
      receipt.counts?.repairRequired === 0 &&
      receipt.counts?.rejected === 0,
    'EVA_DENSE_REVIEWED_EVIDENCE_REVIEW_CHAIN_INVALID',
  );
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const planFrame = plan.frames[index];
    const receiptFrame = receipt.frames[index];
    const job = program.production.jobs[index];
    assert(
      planFrame.ordinal === job.ordinal &&
        planFrame.frameId === job.frameId &&
        planFrame.decision === 'approve-final-frame' &&
        planFrame.expectedStatus === 'final-frame-admitted' &&
        receiptFrame.ordinal === job.ordinal &&
        receiptFrame.frameId === job.frameId &&
        receiptFrame.decision === 'approve-final-frame' &&
        receiptFrame.status === 'final-frame-admitted' &&
        receiptFrame.reviewer?.actorClass === 'human' &&
        SHA256.test(receiptFrame.reviewOutcomeSha256) &&
        SHA256.test(receiptFrame.finalFrameSha256),
      'EVA_DENSE_REVIEWED_EVIDENCE_REVIEW_FRAME_INVALID',
    );
  }
  return Object.freeze({ plan, receipt });
}

function genericReviewOutcome(job) {
  const stem = job.outputs.alphaMastered.slice(0, -4);
  return `${stem}.frame-review-outcome.json`;
}

function verifyReviewOutcome(value, intakeFrame, job) {
  assert(
    value?.reviewOutcomeSha256 === intakeFrame.reviewOutcomeSha256,
    'EVA_DENSE_REVIEWED_EVIDENCE_OUTCOME_HASH_MISMATCH',
  );
  const body = { ...value };
  delete body.reviewOutcomeSha256;
  assert(
    sha256FrameFinisherDocument(body) === value.reviewOutcomeSha256 &&
      value.status === 'final-frame-admitted' &&
      value.frameId === job.frameId &&
      value.finalFrameSha256 === intakeFrame.finalFrameSha256 &&
      value.reviewer?.actorClass === 'human' &&
      value.gates?.technical === 'pass' &&
      value.gates?.handsAndAnatomy === 'pass' &&
      value.gates?.faceIdentity === 'pass' &&
      value.gates?.silhouetteRegistration === 'pass' &&
      value.gates?.adjacentFrameContinuity === 'pass' &&
      (value.gates?.loopClosure === 'pass' ||
        value.gates?.loopClosure === 'not-applicable') &&
      value.sequenceReleaseAllowed === false &&
      value.runtimeActivationAllowed === false,
    'EVA_DENSE_REVIEWED_EVIDENCE_OUTCOME_INVALID',
  );
  return value;
}

function inspectFinalPng(bytes) {
  const structural = inspectPngStructure(bytes, {
    expectedWidth: 1024,
    expectedHeight: 1536,
    expectedBitDepth: 8,
    allowedColorTypes: [6],
    requireNonInterlaced: true,
    maximumBytes: MAXIMUM_PNG_BYTES,
    errorPrefix: 'EVA_DENSE_REVIEWED_FRAME_PNG',
  });
  const pixel = inspectAvatarProviderFramePng(bytes, 1024, 1536);
  assert(
    structural.width === 1024 &&
      structural.height === 1536 &&
      pixel.width === 1024 &&
      pixel.height === 1536 &&
      pixel.hiddenRgbTransparentPixels === 0 &&
      pixel.edgeVisiblePixels === 0,
    'EVA_DENSE_REVIEWED_EVIDENCE_FINAL_PNG_INVALID',
  );
  return Object.freeze({ structural, pixel });
}

function buildFrameEvidence({
  program,
  campaign,
  reviewReceipt,
  workspaceRoot,
  job,
  index,
  inspectedAt,
}) {
  const assuranceRecord = stableJson(
    resolveRelative(workspaceRoot, job.outputs.candidateAssurance, 'candidateAssurance'),
    'candidate assurance',
  );
  const assurance = verifyEvaDenseMotionCandidateAssurance(
    assuranceRecord.value,
    { program },
  );
  const frameReceiptRecord = stableJson(
    resolveRelative(workspaceRoot, job.outputs.frameFinisherReceipt, 'frameFinisherReceipt'),
    'mastering frame receipt',
  );
  const frameReceipt = verifyEvaDenseMotionMasteringFrameReceipt(
    frameReceiptRecord.value,
    program,
    job,
  );
  const intakeFrame = reviewReceipt.frames[index];
  const outcomeRecord = stableJson(
    resolveRelative(workspaceRoot, genericReviewOutcome(job), 'reviewOutcome'),
    'human frame review outcome',
  );
  const outcome = verifyReviewOutcome(outcomeRecord.value, intakeFrame, job);
  const finalFile = stableFile(
    resolveRelative(workspaceRoot, frameReceipt.finishedFrame.path, 'finishedFrame'),
    'final reviewed frame',
    MAXIMUM_PNG_BYTES,
    57,
  );
  assert(
    finalFile.sha256 === frameReceipt.finishedFrame.sha256 &&
      finalFile.sha256 === outcome.finalFrameSha256 &&
      finalFile.sha256 === intakeFrame.finalFrameSha256,
    'EVA_DENSE_REVIEWED_EVIDENCE_FINAL_FRAME_HASH_MISMATCH',
  );
  const inspection = inspectFinalPng(finalFile.bytes);
  assert(
    assurance.independentInspection?.inspectorCount >= 2 &&
      assurance.independentInspection?.allObservationsPassed === true &&
      campaign.frames[index].frameFinisherSha256 === frameReceipt.frameFinisherSha256,
    'EVA_DENSE_REVIEWED_EVIDENCE_INDEPENDENT_ASSURANCE_INVALID',
  );

  const technicalBody = {
    schema: EVA_DENSE_MOTION_TECHNICAL_INSPECTION_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_PROTOCOL_VERSION,
    status: 'passed-independent-technical-inspection',
    inspectedAt,
    programSha256: program.programSha256,
    jobId: job.jobId,
    ordinal: job.ordinal,
    frameId: job.frameId,
    candidateAssuranceSha256: assurance.assuranceSha256,
    masteringFrameReceiptSha256: frameReceipt.frameReceiptSha256,
    frameFinisherSha256: frameReceipt.frameFinisherSha256,
    humanReviewOutcomeSha256: outcome.reviewOutcomeSha256,
    finalFrame: Object.freeze({
      path: frameReceipt.finishedFrame.path,
      sha256: finalFile.sha256,
      bytes: finalFile.bytes.length,
      width: 1024,
      height: 1536,
    }),
    independentChecks: Object.freeze({
      candidateInspectorCount: assurance.independentInspection.inspectorCount,
      candidateAssurancePassed: true,
      pngStructureParserPassed: true,
      finalFramePixelInspectorPassed: true,
      actualRgbaAlpha: true,
      hiddenRgbTransparentPixels: inspection.pixel.hiddenRgbTransparentPixels,
      edgeVisiblePixels: inspection.pixel.edgeVisiblePixels,
      humanTechnicalGatePassed: outcome.gates.technical === 'pass',
      humanAnatomyGatePassed: outcome.gates.handsAndAnatomy === 'pass',
      humanIdentityGatePassed: outcome.gates.faceIdentity === 'pass',
      humanSilhouetteRegistrationGatePassed:
        outcome.gates.silhouetteRegistration === 'pass',
    }),
    authority: authority(),
  };
  const technical = deepFreeze({
    ...technicalBody,
    technicalInspectionSha256: sha256Document(technicalBody),
  });

  const creativeBody = {
    schema: EVA_DENSE_MOTION_CREATIVE_APPROVAL_EVIDENCE_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_PROTOCOL_VERSION,
    status: 'named-human-creative-approval-lineage-sealed',
    programSha256: program.programSha256,
    jobId: job.jobId,
    ordinal: job.ordinal,
    frameId: job.frameId,
    finalFrameSha256: finalFile.sha256,
    reviewOutcomeSha256: outcome.reviewOutcomeSha256,
    reviewDecisionSha256: outcome.reviewDecisionSha256,
    reviewedAt: outcome.reviewedAt,
    reviewer: outcome.reviewer,
    gates: outcome.gates,
    evidence: outcome.evidence,
    creativeApproved: true,
    approvalSource: 'externally-authored-named-human-frame-review-decision',
    automaticDecisionCreationAllowed: false,
    authority: authority(),
  };
  const creative = deepFreeze({
    ...creativeBody,
    creativeApprovalSha256: sha256Document(creativeBody),
  });
  return Object.freeze({ technical, creative });
}

function transactionalCreateOnly(records) {
  const staged = [];
  const linked = [];
  try {
    for (const record of records) {
      assert(!existsSync(record.path), 'EVA_DENSE_REVIEWED_EVIDENCE_OUTPUT_EXISTS');
      mkdirSync(path.dirname(record.path), { recursive: true, mode: 0o700 });
      const temporary = `${record.path}.tmp-${randomBytes(8).toString('hex')}`;
      const handle = openSync(temporary, 'wx', 0o600);
      try {
        writeFileSync(handle, `${JSON.stringify(record.value, null, 2)}\n`);
        fsyncSync(handle);
      } finally {
        closeSync(handle);
      }
      staged.push(temporary);
    }
    for (let index = 0; index < records.length; index += 1) {
      linkSync(staged[index], records[index].path);
      linked.push(records[index].path);
    }
  } catch (error) {
    for (const output of linked.reverse()) {
      try { unlinkSync(output); } catch {}
    }
    throw error;
  } finally {
    for (const temporary of staged) {
      try { unlinkSync(temporary); } catch {}
    }
  }
}

export function compileEvaDenseMotionReviewedFrameEvidence({
  tenMasterProgram: programInput,
  masteringCampaignReceipt: campaignInput,
  reviewIntakePlan,
  reviewIntakeReceipt,
  workspaceRoot: workspaceInput,
  inspectedAt,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(programInput);
  const campaign = verifyEvaDenseMotionMasteringCampaignReceipt(campaignInput, program);
  const review = verifyReviewIntake(
    reviewIntakePlan,
    reviewIntakeReceipt,
    program,
    campaign,
  );
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  const at = timestamp(inspectedAt, 'inspectedAt');
  const frames = program.production.jobs.map((job, index) =>
    buildFrameEvidence({
      program,
      campaign,
      reviewReceipt: review.receipt,
      workspaceRoot,
      job,
      index,
      inspectedAt: at,
    }),
  );
  assert(frames.length === FRAME_COUNT, 'EVA_DENSE_REVIEWED_EVIDENCE_FRAME_COUNT_INVALID');
  return deepFreeze({
    status: 'ready-to-persist-reviewed-frame-evidence',
    familyId: program.familyId,
    programSha256: program.programSha256,
    masteringCampaignReceiptSha256: campaign.campaignReceiptSha256,
    reviewIntakePlanSha256: review.plan.planSha256,
    reviewIntakeReceiptSha256: review.receipt.receiptSha256,
    inspectedAt: at,
    frames,
    effects: Object.freeze({
      technicalInspectionsPrepared: FRAME_COUNT,
      humanCreativeApprovalLineageRecordsPrepared: FRAME_COUNT,
      humanDecisionsCreated: 0,
      automaticCreativeDecisionsMade: 0,
      imagesMutated: 0,
      cloudinaryUploadsPerformed: 0,
      sequencesReleased: 0,
      runtimeActivationsPerformed: 0,
    }),
    authority: authority(),
  });
}

export function persistEvaDenseMotionReviewedFrameEvidence({
  tenMasterProgram: programInput,
  workspaceRoot: workspaceInput,
  compiled,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(programInput);
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  assert(
    compiled?.status === 'ready-to-persist-reviewed-frame-evidence' &&
      compiled.programSha256 === program.programSha256 &&
      compiled.frames?.length === FRAME_COUNT,
    'EVA_DENSE_REVIEWED_EVIDENCE_COMPILED_INVALID',
  );
  const records = [];
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const job = program.production.jobs[index];
    const frame = compiled.frames[index];
    assert(
      frame.technical?.ordinal === job.ordinal &&
        frame.creative?.ordinal === job.ordinal &&
        frame.technical?.finalFrame?.sha256 === frame.creative?.finalFrameSha256,
      'EVA_DENSE_REVIEWED_EVIDENCE_FRAME_BINDING_INVALID',
    );
    records.push(
      {
        path: resolveRelative(
          workspaceRoot,
          job.outputs.technicalInspection,
          'technicalInspection',
        ),
        value: frame.technical,
      },
      {
        path: resolveRelative(
          workspaceRoot,
          job.outputs.creativeApproval,
          'creativeApproval',
        ),
        value: frame.creative,
      },
    );
  }
  transactionalCreateOnly(records);
  const body = {
    schema: EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_RECEIPT_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_PROTOCOL_VERSION,
    status: 'succeeded-ten-reviewed-frame-evidence-persisted',
    familyId: compiled.familyId,
    programSha256: compiled.programSha256,
    masteringCampaignReceiptSha256: compiled.masteringCampaignReceiptSha256,
    reviewIntakePlanSha256: compiled.reviewIntakePlanSha256,
    reviewIntakeReceiptSha256: compiled.reviewIntakeReceiptSha256,
    inspectedAt: compiled.inspectedAt,
    frames: Object.freeze(
      compiled.frames.map((frame) => Object.freeze({
        ordinal: frame.technical.ordinal,
        frameId: frame.technical.frameId,
        finalFrameSha256: frame.technical.finalFrame.sha256,
        technicalInspectionSha256: frame.technical.technicalInspectionSha256,
        creativeApprovalSha256: frame.creative.creativeApprovalSha256,
        reviewer: frame.creative.reviewer,
        reviewDecisionSha256: frame.creative.reviewDecisionSha256,
      })),
    ),
    effects: Object.freeze({
      technicalInspectionsCreated: FRAME_COUNT,
      humanCreativeApprovalLineageRecordsCreated: FRAME_COUNT,
      humanDecisionsCreated: 0,
      automaticCreativeDecisionsMade: 0,
      imagesMutated: 0,
      cloudinaryUploadsPerformed: 0,
      sequencesReleased: 0,
      runtimeActivationsPerformed: 0,
    }),
    authority: authority(),
  };
  return deepFreeze({ ...body, receiptSha256: sha256Document(body) });
}

export function evaDenseMotionReviewedFrameEvidenceCapabilities() {
  return deepFreeze({
    schema: 'evavo.project-art-eva-dense-motion-reviewed-frame-evidence-capabilities.v1',
    exactTenFrameSetRequired: true,
    successfulMasteringCampaignRequired: true,
    allTenNamedHumanApprovalsRequired: true,
    twoIndependentCandidateInspectorsRequired: true,
    independentPngStructureInspectionRequired: true,
    finalFramePixelInspectionRequired: true,
    humanTechnicalGateRequired: true,
    humanAnatomyGateRequired: true,
    humanIdentityGateRequired: true,
    humanSilhouetteRegistrationGateRequired: true,
    creativeApprovalEvidenceDerivedOnlyFromHumanApproval: true,
    automaticDecisionCreationAllowed: false,
    imageMutation: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    runtimeActivation: false,
    authority: authority(),
  });
}
