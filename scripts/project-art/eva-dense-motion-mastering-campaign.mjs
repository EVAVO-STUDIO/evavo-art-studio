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
  assert,
  canonicalRelativePath,
  deepFreeze,
  digest,
  sha256Document,
  snapshotJsonValue,
  timestamp,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  finishAvatarFinalPassProviderFrameFiles,
} from './avatar-final-pass-provider-frame-finisher.mjs';
import {
  preflightAvatarFinalPassProviderFrameFiles,
} from './avatar-final-pass-provider-frame-finisher-preflight.mjs';
import {
  compileEvaDenseMotionAlphaMastering,
  masterEvaDenseMotionAlphaFiles,
} from './eva-dense-motion-alpha-mastering.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';

export const EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PLAN_SCHEMA =
  'evavo.project-art-eva-dense-motion-mastering-campaign-plan.v1';
export const EVA_DENSE_MOTION_MASTERING_FRAME_RECEIPT_SCHEMA =
  'evavo.project-art-eva-dense-motion-mastering-frame-receipt.v1';
export const EVA_DENSE_MOTION_MASTERING_CAMPAIGN_RECEIPT_SCHEMA =
  'evavo.project-art-eva-dense-motion-mastering-campaign-receipt.v1';
export const EVA_DENSE_MOTION_MASTERING_CAMPAIGN_CAPABILITIES_SCHEMA =
  'evavo.project-art-eva-dense-motion-mastering-campaign-capabilities.v1';
export const EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PROTOCOL_VERSION =
  '2026-08-20.1';

const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;
const MAXIMUM_PNG_BYTES = 64 * 1024 * 1024;

function authority() {
  return Object.freeze({
    sourceRead: true,
    assuranceRead: true,
    alphaMatteRead: true,
    deterministicAlphaMastering: true,
    frameFinishing: true,
    executionReceiptPersistence: true,
    technicalInspection: false,
    creativeReview: false,
    candidateApproval: false,
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
    'EVA_DENSE_MASTERING_CAMPAIGN_ROOT_INVALID',
  );
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(normalized) === normalized,
    'EVA_DENSE_MASTERING_CAMPAIGN_ROOT_INVALID',
    `${label} must be a real normalized directory.`,
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
  assert(inside(root, absolute), 'EVA_DENSE_MASTERING_CAMPAIGN_PATH_ESCAPE');
  return absolute;
}

function stableFile(filePath, label, maximumBytes, minimumBytes) {
  const absolute = realpathSync(path.resolve(filePath));
  const before = lstatSync(absolute);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= minimumBytes &&
      before.size <= maximumBytes,
    'EVA_DENSE_MASTERING_CAMPAIGN_INPUT_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[key] === after[key], 'EVA_DENSE_MASTERING_CAMPAIGN_INPUT_CHANGED', label);
  }
  return Object.freeze({ absolute, bytes });
}

function stableJson(filePath, label) {
  const file = stableFile(filePath, label, MAXIMUM_JSON_BYTES, 2);
  let value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    assert(text.charCodeAt(0) !== 0xfeff, 'EVA_DENSE_MASTERING_CAMPAIGN_BOM_FORBIDDEN');
    value = JSON.parse(text);
  } catch (error) {
    if (error?.code) throw error;
    assert(false, 'EVA_DENSE_MASTERING_CAMPAIGN_JSON_INVALID', label);
  }
  return Object.freeze({ ...file, value });
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

function authorizationRelative(job) {
  return `${job.outputs.frameRoot}/alpha-mastering.authorization.json`;
}

function genericPaths(job) {
  const stem = job.outputs.alphaMastered.slice(0, -4);
  return Object.freeze({
    materialization: `${stem}.materialization.json`,
    finisherRequest: `${stem}.finisher-request.json`,
    finished: `${stem}.finished.png`,
    finisherReport: `${stem}.frame-finisher.json`,
    reviewRequest: `${stem}.frame-review-request.json`,
  });
}

function campaignReceiptRelative(program) {
  const firstRoot = program.production.jobs[0].outputs.frameRoot;
  const framesRoot = path.posix.dirname(firstRoot);
  const outputRoot = path.posix.dirname(framesRoot);
  return `${outputRoot}/mastering.campaign.json`;
}

function verifyFrameReceipt(input, program, job) {
  const value = snapshotJsonValue(input, 'dense mastering frame receipt');
  assert(
    value?.schema === EVA_DENSE_MOTION_MASTERING_FRAME_RECEIPT_SCHEMA &&
      value.protocolVersion === EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PROTOCOL_VERSION &&
      value.status === 'frame-finished-awaiting-technical-and-creative-review' &&
      value.programSha256 === program.programSha256 &&
      value.jobId === job.jobId &&
      value.ordinal === job.ordinal &&
      value.frameId === job.frameId,
    'EVA_DENSE_MASTERING_FRAME_RECEIPT_INVALID',
  );
  digest(value.alphaMasteringSha256, 'frameReceipt.alphaMasteringSha256');
  digest(value.materializationSha256, 'frameReceipt.materializationSha256');
  digest(value.finisherRequestSha256, 'frameReceipt.finisherRequestSha256');
  digest(value.frameFinisherSha256, 'frameReceipt.frameFinisherSha256');
  digest(value.reviewRequestSha256, 'frameReceipt.reviewRequestSha256');
  digest(value.finishedFrame?.sha256, 'frameReceipt.finishedFrame.sha256');
  digest(value.frameReceiptSha256, 'frameReceipt.frameReceiptSha256');
  const body = { ...value };
  delete body.frameReceiptSha256;
  assert(
    sha256Document(body) === value.frameReceiptSha256 &&
      value.approvals?.technical === false &&
      value.approvals?.creative === false &&
      value.approvals?.runtime === false &&
      value.effects?.cloudinaryUploads === 0 &&
      value.effects?.runtimeActivations === 0,
    'EVA_DENSE_MASTERING_FRAME_RECEIPT_INVALID',
  );
  return deepFreeze(value);
}

function verifyCampaignReceipt(input, program) {
  const value = snapshotJsonValue(input, 'dense mastering campaign receipt');
  assert(
    value?.schema === EVA_DENSE_MOTION_MASTERING_CAMPAIGN_RECEIPT_SCHEMA &&
      value.protocolVersion === EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PROTOCOL_VERSION &&
      value.status === 'succeeded-awaiting-technical-and-creative-review' &&
      value.programSha256 === program.programSha256 &&
      Array.isArray(value.frames) &&
      value.frames.length === 10 &&
      value.effects?.alphaMastersProduced === 10 &&
      value.effects?.frameFinisherBundlesProduced === 10 &&
      value.effects?.technicalInspectionsCreated === 0 &&
      value.effects?.creativeApprovalsCreated === 0 &&
      value.effects?.cloudinaryUploadsPerformed === 0 &&
      value.effects?.runtimeActivationsPerformed === 0,
    'EVA_DENSE_MASTERING_CAMPAIGN_RECEIPT_INVALID',
  );
  digest(value.campaignReceiptSha256, 'campaignReceiptSha256');
  const body = { ...value };
  delete body.campaignReceiptSha256;
  assert(
    sha256Document(body) === value.campaignReceiptSha256,
    'EVA_DENSE_MASTERING_CAMPAIGN_RECEIPT_HASH_MISMATCH',
  );
  value.frames.forEach((frame, index) => {
    assert(frame.ordinal === index + 1, 'EVA_DENSE_MASTERING_CAMPAIGN_FRAME_ORDER_INVALID');
    digest(frame.frameReceiptSha256, `frames[${index}].frameReceiptSha256`);
  });
  return deepFreeze(value);
}

function existingCompletedFrame(root, program, job) {
  const semantic = resolveRelative(
    root,
    job.outputs.frameFinisherReceipt,
    'frameFinisherReceipt',
  );
  if (!existsSync(semantic)) return null;
  const record = stableJson(semantic, 'existing dense mastering frame receipt');
  const receipt = verifyFrameReceipt(record.value, program, job);
  const finished = resolveRelative(root, receipt.finishedFrame.path, 'finishedFrame.path');
  assert(existsSync(finished), 'EVA_DENSE_MASTERING_COMPLETED_FRAME_BYTES_MISSING');
  const bytes = stableFile(finished, 'existing finished frame', MAXIMUM_PNG_BYTES, 57);
  assert(
    sha256Document({ sha256: receipt.finishedFrame.sha256 }) &&
      receipt.finishedFrame.bytes === bytes.bytes.length,
    'EVA_DENSE_MASTERING_COMPLETED_FRAME_BYTES_INVALID',
  );
  return receipt;
}

function partialExecutionOutputs(root, job) {
  const generic = genericPaths(job);
  return [
    job.outputs.alphaMastered,
    job.outputs.alphaMasteringReceipt,
    generic.materialization,
    generic.finisherRequest,
    generic.finished,
    generic.finisherReport,
    generic.reviewRequest,
  ].filter((relative) => existsSync(resolveRelative(root, relative, 'partialOutput')));
}

function readPendingInputs(root, job) {
  const candidate = stableFile(
    resolveRelative(root, job.outputs.denseCandidate, 'denseCandidate'),
    'dense candidate',
    MAXIMUM_PNG_BYTES,
    57,
  );
  const assurance = stableJson(
    resolveRelative(root, job.outputs.candidateAssurance, 'candidateAssurance'),
    'candidate assurance',
  );
  const matte = stableFile(
    resolveRelative(root, job.outputs.alphaMatte, 'alphaMatte'),
    'alpha matte',
    MAXIMUM_PNG_BYTES,
    57,
  );
  const review = stableJson(
    resolveRelative(root, job.outputs.alphaMatteReview, 'alphaMatteReview'),
    'alpha matte review',
  );
  const authorization = stableJson(
    resolveRelative(root, authorizationRelative(job), 'alphaMasteringAuthorization'),
    'alpha mastering authorization',
  );
  return Object.freeze({ candidate, assurance, matte, review, authorization });
}

async function prepareCampaign({
  tenMasterProgram,
  workspaceRoot: workspaceRootInput,
  masteredAt: masteredAtInput,
  finishedAt: finishedAtInput,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const root = realDirectory(workspaceRootInput, 'workspaceRoot');
  const masteredAt = timestamp(masteredAtInput, 'masteredAt');
  const finishedAt = timestamp(finishedAtInput, 'finishedAt');
  assert(
    Date.parse(finishedAt) >= Date.parse(masteredAt),
    'EVA_DENSE_MASTERING_CAMPAIGN_TIME_INVALID',
  );
  const campaignReceiptPath = resolveRelative(
    root,
    campaignReceiptRelative(program),
    'campaignReceipt',
  );
  if (existsSync(campaignReceiptPath)) {
    const existing = stableJson(campaignReceiptPath, 'existing mastering campaign receipt');
    return Object.freeze({
      program,
      root,
      masteredAt,
      finishedAt,
      campaignReceiptPath,
      existingCampaignReceipt: verifyCampaignReceipt(existing.value, program),
      prepared: Object.freeze([]),
    });
  }

  const prepared = [];
  for (const job of program.production.jobs) {
    const completed = existingCompletedFrame(root, program, job);
    if (completed) {
      prepared.push(Object.freeze({ job, mode: 'reuse-completed-frame', completed }));
      continue;
    }
    const partial = partialExecutionOutputs(root, job);
    assert(
      partial.length === 0,
      'EVA_DENSE_MASTERING_PARTIAL_FRAME_QUARANTINED',
      `${job.frameId} has partial execution outputs: ${partial.join(', ')}`,
    );
    const inputs = readPendingInputs(root, job);
    const preflight = compileEvaDenseMotionAlphaMastering({
      tenMasterProgram: program,
      ordinal: job.ordinal,
      candidateAssurance: inputs.assurance.value,
      sourceSpaceCandidateBytes: inputs.candidate.bytes,
      sourceSpaceCandidatePath: job.outputs.denseCandidate,
      alphaMatteBytes: inputs.matte.bytes,
      alphaMattePath: job.outputs.alphaMatte,
      alphaMatteReview: inputs.review.value,
      authorization: inputs.authorization.value,
      masteredAt,
    });
    assert(
      preflight.status === 'alpha-mastered-awaiting-frame-finisher' &&
        preflight.report.output.createOnly === true &&
        preflight.report.gates.cloudinaryUploadAllowed === false &&
        preflight.report.gates.runtimeActivationAllowed === false,
      'EVA_DENSE_MASTERING_ALPHA_PREFLIGHT_INVALID',
    );
    prepared.push(Object.freeze({
      job,
      mode: 'execute-frame',
      inputs,
      expected: Object.freeze({
        alphaMasteringSha256: preflight.report.alphaMasteringSha256,
        alphaMasterSha256: preflight.report.output.sha256,
        materializationSha256: preflight.materializationReceipt.materializationSha256,
        finisherRequestSha256: preflight.finisherRequest.finisherRequestSha256,
      }),
    }));
  }
  assert(prepared.length === 10, 'EVA_DENSE_MASTERING_CAMPAIGN_FRAME_COUNT_INVALID');
  const planBody = {
    schema: EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PLAN_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PROTOCOL_VERSION,
    status: 'ready-for-ten-frame-deterministic-mastering',
    programSha256: program.programSha256,
    masteredAt,
    finishedAt,
    frames: Object.freeze(prepared.map((entry) => Object.freeze({
      ordinal: entry.job.ordinal,
      frameId: entry.job.frameId,
      mode: entry.mode,
      ...(entry.expected ? { expected: entry.expected } : {
        existingFrameReceiptSha256: entry.completed.frameReceiptSha256,
      }),
    }))),
    policy: Object.freeze({
      allPendingFramesAlphaPreflightBeforeFirstWrite: true,
      sequential: true,
      stopOnFirstFailure: true,
      createOnly: true,
      completedFrameBoundaryResumeSupported: true,
      midFramePartialStateRejected: true,
      technicalInspectionRequiredAfterCampaign: true,
      creativeApprovalRequiredAfterCampaign: true,
      partialPromotionAllowed: false,
      cloudinaryUploadAllowed: false,
      sequenceReleaseAllowed: false,
      runtimeActivationAllowed: false,
    }),
    authority: authority(),
  };
  return Object.freeze({
    program,
    root,
    masteredAt,
    finishedAt,
    campaignReceiptPath,
    existingCampaignReceipt: null,
    prepared: Object.freeze(prepared),
    plan: deepFreeze({ ...planBody, campaignPlanSha256: sha256Document(planBody) }),
  });
}

export async function compileEvaDenseMotionMasteringCampaignPlan(input) {
  const prepared = await prepareCampaign(input);
  if (prepared.existingCampaignReceipt) {
    return deepFreeze({
      schema: EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PLAN_SCHEMA,
      protocolVersion: EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PROTOCOL_VERSION,
      status: 'campaign-already-complete',
      programSha256: prepared.program.programSha256,
      campaignReceiptSha256: prepared.existingCampaignReceipt.campaignReceiptSha256,
      authority: authority(),
    });
  }
  return prepared.plan;
}

function buildFrameReceipt(program, job, mastered, finished, recordedAt) {
  const body = {
    schema: EVA_DENSE_MOTION_MASTERING_FRAME_RECEIPT_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PROTOCOL_VERSION,
    status: 'frame-finished-awaiting-technical-and-creative-review',
    recordedAt,
    programSha256: program.programSha256,
    jobId: job.jobId,
    ordinal: job.ordinal,
    frameId: job.frameId,
    alphaMasteringSha256: mastered.alphaMasteringSha256,
    materializationSha256: mastered.materializationSha256,
    finisherRequestSha256: mastered.finisherRequestSha256,
    frameFinisherSha256: finished.report.frameFinisherSha256,
    reviewRequestSha256: finished.reviewRequest.reviewRequestSha256,
    finishedFrame: Object.freeze({
      path: finished.report.output.path,
      sha256: finished.report.output.sha256,
      bytes: finished.report.output.bytes,
      width: finished.report.output.width,
      height: finished.report.output.height,
      visibleBounds: finished.report.output.visibleBounds,
      hiddenRgbTransparentPixels: finished.report.output.hiddenRgbTransparentPixels,
    }),
    nextRequiredEvidence: Object.freeze({
      technicalInspection: job.outputs.technicalInspection,
      creativeApproval: job.outputs.creativeApproval,
      cloudinaryUploadReceipt: job.outputs.cloudinaryUploadReceipt,
      runtimeFrameEvidence: job.outputs.runtimeFrameEvidence,
    }),
    approvals: Object.freeze({
      technical: false,
      creative: false,
      continuity: false,
      loop: false,
      runtime: false,
    }),
    effects: Object.freeze({
      alphaMasters: 1,
      frameFinisherBundles: 1,
      technicalInspections: 0,
      creativeApprovals: 0,
      cloudinaryUploads: 0,
      runtimeActivations: 0,
    }),
    authority: authority(),
  };
  return deepFreeze({ ...body, frameReceiptSha256: sha256Document(body) });
}

export async function runEvaDenseMotionMasteringCampaign({
  masterFrame = masterEvaDenseMotionAlphaFiles,
  preflightFrameFinisher = preflightAvatarFinalPassProviderFrameFiles,
  finishFrame = finishAvatarFinalPassProviderFrameFiles,
  ...input
}) {
  assert(typeof masterFrame === 'function', 'EVA_DENSE_MASTERING_MASTER_EXECUTOR_INVALID');
  assert(typeof preflightFrameFinisher === 'function', 'EVA_DENSE_MASTERING_FINISHER_PREFLIGHT_INVALID');
  assert(typeof finishFrame === 'function', 'EVA_DENSE_MASTERING_FINISHER_EXECUTOR_INVALID');
  const prepared = await prepareCampaign(input);
  if (prepared.existingCampaignReceipt) {
    return deepFreeze({
      status: prepared.existingCampaignReceipt.status,
      reused: true,
      receiptPath: prepared.campaignReceiptPath,
      receipt: prepared.existingCampaignReceipt,
    });
  }

  const frameReceipts = [];
  for (const entry of prepared.prepared) {
    if (entry.mode === 'reuse-completed-frame') {
      frameReceipts.push(entry.completed);
      continue;
    }
    const mastered = await masterFrame({
      tenMasterProgram: prepared.program,
      ordinal: entry.job.ordinal,
      workspaceRoot: prepared.root,
      candidateAssurancePath: entry.inputs.assurance.absolute,
      alphaMatteReviewPath: entry.inputs.review.absolute,
      authorizationPath: entry.inputs.authorization.absolute,
      masteredAt: prepared.masteredAt,
    });
    assert(
      mastered.alphaMasteringSha256 === entry.expected.alphaMasteringSha256 &&
        mastered.materializationSha256 === entry.expected.materializationSha256 &&
        mastered.finisherRequestSha256 === entry.expected.finisherRequestSha256,
      'EVA_DENSE_MASTERING_EXECUTION_HASH_MISMATCH',
    );
    const finisherPreflight = await preflightFrameFinisher({
      workspaceRoot: prepared.root,
      materializationReceiptPath: mastered.paths.materialization,
      finisherRequestPath: mastered.paths.finisherRequest,
      finishedAt: prepared.finishedAt,
    });
    assert(
      finisherPreflight.status === 'frame-finisher-preflight-ready' &&
        finisherPreflight.frameId === entry.job.frameId,
      'EVA_DENSE_MASTERING_FINISHER_PREFLIGHT_RESULT_INVALID',
    );
    const finished = await finishFrame({
      workspaceRoot: prepared.root,
      materializationReceiptPath: mastered.paths.materialization,
      finisherRequestPath: mastered.paths.finisherRequest,
      finishedAt: prepared.finishedAt,
    });
    assert(
      finished.status === 'frame-finished-awaiting-human-review' &&
        finished.report?.frameId === entry.job.frameId &&
        finished.report?.output?.hiddenRgbTransparentPixels === 0 &&
        finished.report?.preservation?.visiblePixelsUnchanged === true &&
        finished.report?.preservation?.alphaUnchanged === true &&
        finished.reviewRequest?.sequenceReleaseAllowed === false &&
        finished.reviewRequest?.runtimeActivationAllowed === false,
      'EVA_DENSE_MASTERING_FINISHER_RESULT_INVALID',
    );
    const receipt = buildFrameReceipt(
      prepared.program,
      entry.job,
      mastered,
      finished,
      prepared.finishedAt,
    );
    const semanticReceiptPath = resolveRelative(
      prepared.root,
      entry.job.outputs.frameFinisherReceipt,
      'frameFinisherReceipt',
    );
    writeJsonCreateOnly(semanticReceiptPath, receipt);
    frameReceipts.push(receipt);
  }

  assert(frameReceipts.length === 10, 'EVA_DENSE_MASTERING_CAMPAIGN_FRAME_COUNT_INVALID');
  const receiptBody = {
    schema: EVA_DENSE_MOTION_MASTERING_CAMPAIGN_RECEIPT_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PROTOCOL_VERSION,
    status: 'succeeded-awaiting-technical-and-creative-review',
    completedAt: prepared.finishedAt,
    programSha256: prepared.program.programSha256,
    frames: Object.freeze(frameReceipts.map((receipt) => Object.freeze({
      ordinal: receipt.ordinal,
      frameId: receipt.frameId,
      frameReceiptSha256: receipt.frameReceiptSha256,
      alphaMasteringSha256: receipt.alphaMasteringSha256,
      frameFinisherSha256: receipt.frameFinisherSha256,
      finishedFrameSha256: receipt.finishedFrame.sha256,
    }))),
    effects: Object.freeze({
      alphaMastersProduced: 10,
      frameFinisherBundlesProduced: 10,
      frameExecutionReceiptsCreated: 10,
      technicalInspectionsCreated: 0,
      creativeApprovalsCreated: 0,
      cloudinaryUploadsPerformed: 0,
      sequencesReleased: 0,
      runtimeActivationsPerformed: 0,
    }),
    nextRequiredStages: Object.freeze([
      'independent-technical-inspection-all-ten-frames',
      'named-human-creative-review-all-ten-frames',
      'ten-edge-continuity-review-including-10-to-1',
      'immutable-cloudinary-publication-only-after-review',
      'runtime-frame-evidence-assembly',
      'atomic-sequence-release-and-browser-reverification',
    ]),
    authority: authority(),
  };
  const receipt = deepFreeze({
    ...receiptBody,
    campaignReceiptSha256: sha256Document(receiptBody),
  });
  writeJsonCreateOnly(prepared.campaignReceiptPath, receipt);
  return deepFreeze({
    status: receipt.status,
    reused: false,
    receiptPath: prepared.campaignReceiptPath,
    receipt,
  });
}

export function evaDenseMotionMasteringCampaignCapabilities() {
  return deepFreeze({
    schema: EVA_DENSE_MOTION_MASTERING_CAMPAIGN_CAPABILITIES_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_MASTERING_CAMPAIGN_PROTOCOL_VERSION,
    exactTenFrameCampaign: true,
    allPendingFramesAlphaPreflightBeforeFirstWrite: true,
    sequential: true,
    stopOnFirstFailure: true,
    completedFrameBoundaryResumeSupported: true,
    midFramePartialStateRejected: true,
    deterministicAlphaMastering: true,
    genericFrameFinisherReused: true,
    technicalInspectionExecution: false,
    creativeReviewExecution: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    publication: false,
    runtimeActivation: false,
    authority: authority(),
  });
}
