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
  finishAvatarFinalPassProviderFrameFiles,
  sha256FrameFinisherBytes,
} from './avatar-final-pass-provider-frame-finisher.mjs';

const MAXIMUM_DOCUMENT_BYTES = 8 * 1024 * 1024;

export class AvatarProviderFrameFinisherPreflightError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'AvatarProviderFrameFinisherPreflightError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new AvatarProviderFrameFinisherPreflightError(code, message);
}

function assert(condition, code, message = code) {
  if (!condition) fail(code, message);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function realDirectory(value, label) {
  const absolute = realpathSync(path.resolve(value));
  const metadata = lstatSync(absolute);
  assert(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    'AVATAR_FRAME_FINISHER_PREFLIGHT_ROOT_INVALID',
    `${label} must be a real directory.`,
  );
  return absolute;
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
    'AVATAR_FRAME_FINISHER_PREFLIGHT_PATH_INVALID',
    `${label} must be a canonical relative path.`,
  );
  return value;
}

function stableJson(filePath, label) {
  const absolute = realpathSync(path.resolve(filePath));
  const before = lstatSync(absolute);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= 2 &&
      before.size <= MAXIMUM_DOCUMENT_BYTES,
    'AVATAR_FRAME_FINISHER_PREFLIGHT_INPUT_INVALID',
    `${label} must be a bounded single-link regular file.`,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'AVATAR_FRAME_FINISHER_PREFLIGHT_INPUT_CHANGED',
      `${label} changed while being read.`,
    );
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(
      'AVATAR_FRAME_FINISHER_PREFLIGHT_JSON_INVALID',
      `${label} is not canonical UTF-8 JSON input.`,
    );
  }
  return Object.freeze({ absolute, value });
}

function stableSourceBytes(workspaceRoot, sourceRelativePath) {
  const source = path.join(
    workspaceRoot,
    ...canonicalRelativePath(sourceRelativePath, 'sourceCandidate.path').split('/'),
  );
  assert(isInside(workspaceRoot, source), 'AVATAR_FRAME_FINISHER_PREFLIGHT_PATH_ESCAPE');
  const before = lstatSync(source);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1,
    'AVATAR_FRAME_FINISHER_PREFLIGHT_SOURCE_INVALID',
  );
  const resolved = realpathSync(source);
  assert(isInside(workspaceRoot, resolved), 'AVATAR_FRAME_FINISHER_PREFLIGHT_PATH_ESCAPE');
  const bytes = readFileSync(source);
  const after = lstatSync(source);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'AVATAR_FRAME_FINISHER_PREFLIGHT_SOURCE_CHANGED',
    );
  }
  return Object.freeze({ source, bytes, sha256: sha256FrameFinisherBytes(bytes) });
}

function outputPaths(workspaceRoot, sourceRelativePath) {
  const stem = sourceRelativePath.slice(0, -4);
  assert(
    sourceRelativePath.endsWith('.png'),
    'AVATAR_FRAME_FINISHER_PREFLIGHT_PATH_INVALID',
  );
  const relative = Object.freeze({
    finished: `${stem}.finished.png`,
    report: `${stem}.frame-finisher.json`,
    reviewRequest: `${stem}.frame-review-request.json`,
    reviewOutcome: `${stem}.frame-review-outcome.json`,
  });
  const absolute = Object.fromEntries(
    Object.entries(relative).map(([key, value]) => {
      const target = path.join(workspaceRoot, ...value.split('/'));
      assert(isInside(workspaceRoot, target), 'AVATAR_FRAME_FINISHER_PREFLIGHT_PATH_ESCAPE');
      return [key, target];
    }),
  );
  return Object.freeze({ relative, absolute: Object.freeze(absolute) });
}

export function preflightAvatarFinalPassProviderFrameFiles({
  workspaceRoot: workspaceRootInput,
  materializationReceiptPath,
  finisherRequestPath,
  finishedAt,
}) {
  const workspaceRoot = realDirectory(workspaceRootInput, 'workspaceRoot');
  const requestRecord = stableJson(finisherRequestPath, 'candidate finisher request');
  const sourceRelativePath = canonicalRelativePath(
    requestRecord.value?.sourceCandidate?.path,
    'sourceCandidate.path',
  );
  const source = stableSourceBytes(workspaceRoot, sourceRelativePath);
  const targets = outputPaths(workspaceRoot, sourceRelativePath);
  for (const [kind, target] of Object.entries(targets.absolute)) {
    assert(
      !existsSync(target),
      'AVATAR_FRAME_FINISHER_PREFLIGHT_OUTPUT_ALREADY_EXISTS',
      `${kind} output already exists.`,
    );
  }

  const shadowRoot = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), 'evavo-frame-finisher-preflight-')),
  );
  try {
    const shadowSource = path.join(
      shadowRoot,
      ...sourceRelativePath.split('/'),
    );
    mkdirSync(path.dirname(shadowSource), { recursive: true, mode: 0o700 });
    copyFileSync(source.source, shadowSource);
    const shadow = finishAvatarFinalPassProviderFrameFiles({
      workspaceRoot: shadowRoot,
      materializationReceiptPath,
      finisherRequestPath,
      ...(finishedAt ? { finishedAt } : {}),
    });
    assert(
      shadow?.reused === false &&
        shadow?.status === 'frame-finished-awaiting-human-review' &&
        shadow.report?.output?.approvalState === 'unapproved' &&
        shadow.report?.preservation?.visiblePixelsUnchanged === true &&
        shadow.report?.preservation?.alphaUnchanged === true &&
        shadow.report?.preservation?.canvasUnchanged === true &&
        shadow.report?.preservation?.visibleBoundsUnchanged === true &&
        shadow.report?.authority?.creativeReview === false &&
        shadow.report?.authority?.candidateApproval === false &&
        shadow.report?.authority?.candidatePromotion === false &&
        shadow.report?.authority?.sequenceRelease === false &&
        shadow.report?.authority?.publication === false &&
        shadow.report?.authority?.runtimeActivation === false &&
        shadow.reviewRequest?.sequenceReleaseAllowed === false &&
        shadow.reviewRequest?.runtimeActivationAllowed === false,
      'AVATAR_FRAME_FINISHER_PREFLIGHT_RESULT_INVALID',
    );
    const sourceRecheck = stableSourceBytes(workspaceRoot, sourceRelativePath);
    assert(
      sourceRecheck.sha256 === source.sha256 &&
        sourceRecheck.bytes.length === source.bytes.length,
      'AVATAR_FRAME_FINISHER_PREFLIGHT_SOURCE_CHANGED',
    );
    return Object.freeze({
      status: 'frame-finisher-preflight-ready',
      frameId: shadow.report.frameId,
      characterId: shadow.report.characterId,
      materializationSha256: shadow.report.source.materializationSha256,
      finisherRequestSha256: shadow.report.source.finisherRequestSha256,
      sourceCandidate: Object.freeze({
        path: sourceRelativePath,
        sha256: source.sha256,
        bytes: source.bytes.length,
      }),
      expectedFinishedFrame: Object.freeze({
        path: targets.relative.finished,
        sha256: shadow.report.output.sha256,
        bytes: shadow.report.output.bytes,
        width: shadow.report.output.width,
        height: shadow.report.output.height,
        visibleBounds: shadow.report.output.visibleBounds,
        visiblePixelSha256: shadow.report.output.visiblePixelSha256,
        alphaSha256: shadow.report.output.alphaSha256,
      }),
      expectedFrameFinisherSha256: shadow.report.frameFinisherSha256,
      expectedReviewRequestSha256: shadow.reviewRequest.reviewRequestSha256,
      outputs: targets,
    });
  } finally {
    rmSync(shadowRoot, { recursive: true, force: true });
  }
}
