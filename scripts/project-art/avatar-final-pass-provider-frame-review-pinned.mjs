import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
  reviewAvatarFinalPassProviderFrame,
  sha256FrameFinisherBytes,
} from './avatar-final-pass-provider-frame-finisher.mjs';
import {
  assert,
  stableJsonFile,
} from './avatar-final-pass-provider-runtime-common.mjs';

function stableInput(value, label) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'AVATAR_FRAME_REVIEW_PINNED_INPUT_INVALID',
    `${label} must be an absolute path.`,
  );
  const absolute = path.normalize(value);
  const before = lstatSync(absolute);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      realpathSync(absolute) === absolute,
    'AVATAR_FRAME_REVIEW_PINNED_INPUT_INVALID',
    `${label} must be a single-link ordinary file.`,
  );
  const record = stableJsonFile(absolute, label);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'AVATAR_FRAME_REVIEW_PINNED_INPUT_CHANGED',
      `${label} changed while being read.`,
    );
  }
  return Object.freeze({
    value: record.value,
    fileSha256: sha256FrameFinisherBytes(record.bytes),
  });
}

export function reviewAvatarFinalPassProviderFrameFilesPinned({
  workspaceRoot,
  frameFinisherReportPath,
  frameReviewRequestPath,
  frameReviewDecisionPath,
  expectedDecisionFileSha256,
  reviewedAt,
}) {
  const report = stableInput(frameFinisherReportPath, 'frame-finisher report');
  const request = stableInput(frameReviewRequestPath, 'frame-review request');
  const decision = stableInput(frameReviewDecisionPath, 'frame-review decision');
  assert(
    decision.fileSha256 === expectedDecisionFileSha256,
    'AVATAR_FRAME_REVIEW_PINNED_DECISION_CHANGED',
    'The human review decision changed after shadow preflight.',
  );
  return reviewAvatarFinalPassProviderFrame({
    workspaceRoot,
    frameFinisherReport: report.value,
    frameReviewRequest: request.value,
    frameReviewDecision: decision.value,
    ...(reviewedAt ? { reviewedAt } : {}),
  });
}
