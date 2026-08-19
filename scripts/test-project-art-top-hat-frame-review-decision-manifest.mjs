#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compileTopHatPoseBankFrameReviewDecisionManifest,
} from './compile-project-art-top-hat-pose-bank-frame-review-decision-manifest.mjs';
import {
  verifySelfHash,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './project-art/top-hat-pose-slot-provider-runtime-foundation.mjs';

async function withRoot(callback) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'top-hat-review-manifest-'));
  try {
    return await callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('hashes exactly six externally supplied decision files without authoring their content', async () => {
  await withRoot(async (decisionRoot) => {
    mkdirSync(decisionRoot, { recursive: true });
    const originalBodies = new Map();
    for (const slotId of TOP_HAT_RUNTIME_EXPECTED_SLOTS) {
      const body = `${JSON.stringify({ externallySuppliedFixture: slotId })}\n`;
      originalBodies.set(slotId, body);
      writeFileSync(
        path.join(decisionRoot, `${slotId}.frame-review-decision.json`),
        body,
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
      );
    }
    const manifest = compileTopHatPoseBankFrameReviewDecisionManifest({
      decisionRoot,
    });
    assert.equal(manifest.slots.length, 6);
    assert.deepEqual(
      manifest.slots.map((entry) => entry.slotId),
      TOP_HAT_RUNTIME_EXPECTED_SLOTS,
    );
    assert.equal(manifest.policy.decisionsExternallyAuthored, true);
    assert.equal(manifest.policy.namedHumanRequired, true);
    assert.equal(manifest.policy.automaticDecisionCreationAllowed, false);
    assert.equal(
      verifySelfHash(
        manifest,
        'decisionManifestSha256',
        'fixture decision manifest',
      ).decisionManifestSha256,
      manifest.decisionManifestSha256,
    );
    for (const slotId of TOP_HAT_RUNTIME_EXPECTED_SLOTS) {
      const filePath = path.join(
        decisionRoot,
        `${slotId}.frame-review-decision.json`,
      );
      const current = await import('node:fs').then(({ readFileSync }) =>
        readFileSync(filePath, 'utf8'),
      );
      assert.equal(current, originalBodies.get(slotId));
    }
  });
});

console.log('Project Art Top Hat human-review decision-manifest regression passed.');
