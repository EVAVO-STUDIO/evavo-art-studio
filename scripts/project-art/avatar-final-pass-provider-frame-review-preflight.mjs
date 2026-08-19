import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  reviewAvatarFinalPassProviderFrameFiles,
  sha256FrameFinisherBytes,
} from './avatar-final-pass-provider-frame-finisher.mjs';

const MAXIMUM_DOCUMENT_BYTES = 8 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export class AvatarProviderFrameReviewPreflightError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'AvatarProviderFrameReviewPreflightError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new AvatarProviderFrameReviewPreflightError(code, message);
}

function assert(condition, code, message = code) {
  if (!condition) fail(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreezeJson(value) {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreezeJson(entry);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    for (const entry of Object.values(value)) deepFreezeJson(entry);
    return Object.freeze(value);
  }
  return value;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function realDirectory(value, label) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'AVATAR_FRAME_REVIEW_PREFLIGHT_ROOT_INVALID',
    `${label} must be an absolute path.`,
  );
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(normalized) === normalized,
    'AVATAR_FRAME_REVIEW_PREFLIGHT_ROOT_INVALID',
    `${label} must be a real ordinary directory.`,
  );
  return normalized;
}

function canonicalRelativePath(value, label) {
  assert(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 1024 &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      !value.startsWith('/') &&
      !value.startsWith('../') &&
      !value.includes('/../') &&
      !value.includes('//') &&
      !/^[A-Za-z]:/u.test(value) &&
      path.posix.normalize(value) === value &&
      value !== '.' &&
      value !== '..',
    'AVATAR_FRAME_REVIEW_PREFLIGHT_PATH_INVALID',
    `${label} must be a canonical relative path.`,
  );
  return value;
}

function stableJson(filePath, label) {
  assert(
    typeof filePath === 'string' && path.isAbsolute(filePath),
    'AVATAR_FRAME_REVIEW_PREFLIGHT_INPUT_INVALID',
    `${label} must be an absolute path.`,
  );
  const absolute = path.normalize(filePath);
  const before = lstatSync(absolute);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= 2 &&
      before.size <= MAXIMUM_DOCUMENT_BYTES &&
      realpathSync(absolute) === absolute,
    'AVATAR_FRAME_REVIEW_PREFLIGHT_INPUT_INVALID',
    `${label} must be a bounded single-link ordinary file.`,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'AVATAR_FRAME_REVIEW_PREFLIGHT_INPUT_CHANGED',
      `${label} changed while being read.`,
    );
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(
      'AVATAR_FRAME_REVIEW_PREFLIGHT_JSON_INVALID',
      `${label} must contain valid UTF-8 JSON.`,
    );
  }
  return Object.freeze({
    absolute,
    bytes,
    fileSha256: sha256FrameFinisherBytes(bytes),
    value: deepFreezeJson(value),
  });
}

function stableFinishedFrame(workspaceRoot, relativePath) {
  const relative = canonicalRelativePath(relativePath, 'finishedFrame.path');
  const absolute = path.join(workspaceRoot, ...relative.split('/'));
  assert(isInside(workspaceRoot, absolute), 'AVATAR_FRAME_REVIEW_PREFLIGHT_PATH_ESCAPE');
  const before = lstatSync(absolute);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1,
    'AVATAR_FRAME_REVIEW_PREFLIGHT_FINISHED_FRAME_INVALID',
  );
  const resolved = realpathSync(absolute);
  assert(isInside(workspaceRoot, resolved), 'AVATAR_FRAME_REVIEW_PREFLIGHT_PATH_ESCAPE');
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'AVATAR_FRAME_REVIEW_PREFLIGHT_FINISHED_FRAME_CHANGED',
    );
  }
  return Object.freeze({
    relative,
    absolute,
    bytes,
    sha256: sha256FrameFinisherBytes(bytes),
  });
}

function reviewOutcomeRelativePath(sourceCandidatePath) {
  const source = canonicalRelativePath(sourceCandidatePath, 'sourceCandidate.path');
  assert(
    source.endsWith('.png'),
    'AVATAR_FRAME_REVIEW_PREFLIGHT_PATH_INVALID',
  );
  return `${source.slice(0, -4)}.frame-review-outcome.json`;
}

export function preflightAvatarFinalPassProviderFrameReviewFiles({
  workspaceRoot: workspaceRootInput,
  frameFinisherReportPath,
  frameReviewRequestPath,
  frameReviewDecisionPath,
  reviewedAt,
}) {
  const workspaceRoot = realDirectory(workspaceRootInput, 'workspaceRoot');
  const report = stableJson(frameFinisherReportPath, 'frame-finisher report');
  const request = stableJson(frameReviewRequestPath, 'frame-review request');
  const decision = stableJson(frameReviewDecisionPath, 'frame-review decision');

  assert(
    isRecord(report.value) &&
      isRecord(request.value) &&
      isRecord(decision.value) &&
      report.value.frameId === request.value.frameId &&
      report.value.frameId === decision.value.frameId &&
      report.value.frameFinisherSha256 === request.value.frameFinisherSha256 &&
      request.value.reviewRequestSha256 === decision.value.reviewRequestSha256 &&
      decision.value.reviewer?.actorClass === 'human' &&
      typeof decision.value.decisionSha256 === 'string' &&
      SHA256_PATTERN.test(decision.value.decisionSha256),
    'AVATAR_FRAME_REVIEW_PREFLIGHT_BINDING_INVALID',
  );

  const finished = stableFinishedFrame(workspaceRoot, report.value.output?.path);
  assert(
    finished.sha256 === report.value.output?.sha256 &&
      request.value.finishedFrame?.sha256 === finished.sha256,
    'AVATAR_FRAME_REVIEW_PREFLIGHT_FINISHED_FRAME_MISMATCH',
  );
  const outcomeRelative = reviewOutcomeRelativePath(report.value.source?.path);
  const outcomeAbsolute = path.join(workspaceRoot, ...outcomeRelative.split('/'));
  assert(
    isInside(workspaceRoot, outcomeAbsolute) && !existsSync(outcomeAbsolute),
    'AVATAR_FRAME_REVIEW_PREFLIGHT_OUTCOME_ALREADY_EXISTS',
    'A frame-review outcome already exists; human-review intake is create-only.',
  );

  const shadowRoot = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), 'evavo-frame-review-preflight-')),
  );
  try {
    const shadowFinished = path.join(shadowRoot, ...finished.relative.split('/'));
    mkdirSync(path.dirname(shadowFinished), { recursive: true, mode: 0o700 });
    copyFileSync(finished.absolute, shadowFinished);
    const shadow = reviewAvatarFinalPassProviderFrameFiles({
      workspaceRoot: shadowRoot,
      frameFinisherReportPath: report.absolute,
      frameReviewRequestPath: request.absolute,
      frameReviewDecisionPath: decision.absolute,
      ...(reviewedAt ? { reviewedAt } : {}),
    });
    assert(
      shadow?.reused === false &&
        ['final-frame-admitted', 'frame-repair-required', 'frame-rejected'].includes(
          shadow?.status,
        ) &&
        shadow.outcome?.frameId === report.value.frameId &&
        shadow.outcome?.frameFinisherSha256 === report.value.frameFinisherSha256 &&
        shadow.outcome?.reviewRequestSha256 === request.value.reviewRequestSha256 &&
        shadow.outcome?.reviewDecisionSha256 === decision.value.decisionSha256 &&
        shadow.outcome?.reviewer?.actorClass === 'human' &&
        shadow.outcome?.sequenceReleaseAllowed === false &&
        shadow.outcome?.runtimeActivationAllowed === false &&
        shadow.outcome?.authority?.candidatePromotion === false &&
        shadow.outcome?.authority?.sequenceRelease === false &&
        shadow.outcome?.authority?.publication === false &&
        shadow.outcome?.authority?.runtimeActivation === false,
      'AVATAR_FRAME_REVIEW_PREFLIGHT_RESULT_INVALID',
    );
    const finishedRecheck = stableFinishedFrame(workspaceRoot, finished.relative);
    assert(
      finishedRecheck.sha256 === finished.sha256 &&
        finishedRecheck.bytes.length === finished.bytes.length,
      'AVATAR_FRAME_REVIEW_PREFLIGHT_FINISHED_FRAME_CHANGED',
    );
    return Object.freeze({
      status: 'frame-review-preflight-ready',
      frameId: shadow.outcome.frameId,
      decision: decision.value.decision,
      reviewer: Object.freeze({
        actorClass: 'human',
        actorId: decision.value.reviewer.actorId,
        occurredAt: decision.value.reviewer.occurredAt,
        evidenceSha256: decision.value.reviewer.evidenceSha256,
      }),
      decisionFileSha256: decision.fileSha256,
      decisionSha256: decision.value.decisionSha256,
      frameFinisherSha256: shadow.outcome.frameFinisherSha256,
      reviewRequestSha256: shadow.outcome.reviewRequestSha256,
      finishedFrameSha256: finished.sha256,
      expectedOutcome: Object.freeze({
        status: shadow.outcome.status,
        reviewOutcomeSha256: shadow.outcome.reviewOutcomeSha256,
        finalFrameSha256: shadow.outcome.finalFrameSha256,
        dependentInbetweenEndpointAllowed:
          shadow.outcome.dependentInbetweenEndpointAllowed,
        sequenceDraftUseAllowed: shadow.outcome.sequenceDraftUseAllowed,
        sequenceReleaseAllowed: false,
        runtimeActivationAllowed: false,
      }),
      outcomePath: Object.freeze({
        relative: outcomeRelative,
        absolute: outcomeAbsolute,
      }),
      validatedInputs: Object.freeze({
        frameFinisherReport: report.value,
        frameReviewRequest: request.value,
        frameReviewDecision: decision.value,
      }),
    });
  } finally {
    rmSync(shadowRoot, { recursive: true, force: true });
  }
}
