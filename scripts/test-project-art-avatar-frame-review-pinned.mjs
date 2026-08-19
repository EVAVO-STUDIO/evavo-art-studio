#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  reviewAvatarFinalPassProviderFrameFilesPinned,
} from './project-art/avatar-final-pass-provider-frame-review-pinned.mjs';
import {
  sha256FrameFinisherBytes,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

async function withWorkspace(callback) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'frame-review-pinned-test-'));
  try {
    return await callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('rejects decision bytes that no longer match the shadow-preflight file hash', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const reportPath = path.join(workspaceRoot, 'report.json');
    const requestPath = path.join(workspaceRoot, 'request.json');
    const decisionPath = path.join(workspaceRoot, 'decision.json');
    writeJson(reportPath, {});
    writeJson(requestPath, {});
    writeJson(decisionPath, { changedAfterPreflight: true });
    const actualDecisionFileSha256 = sha256FrameFinisherBytes(
      Buffer.from(`${JSON.stringify({ changedAfterPreflight: true })}\n`, 'utf8'),
    );
    const expectedDecisionFileSha256 =
      actualDecisionFileSha256 === 'f'.repeat(64)
        ? 'e'.repeat(64)
        : 'f'.repeat(64);
    assert.throws(
      () =>
        reviewAvatarFinalPassProviderFrameFilesPinned({
          workspaceRoot,
          frameFinisherReportPath: reportPath,
          frameReviewRequestPath: requestPath,
          frameReviewDecisionPath: decisionPath,
          expectedDecisionFileSha256,
          reviewedAt: '2026-08-19T00:45:00.000Z',
        }),
      (error) => error?.code === 'AVATAR_FRAME_REVIEW_PINNED_DECISION_CHANGED',
    );
  });
});

console.log('Project Art avatar pinned human-review decision regression passed.');
