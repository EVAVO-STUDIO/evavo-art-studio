#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import { validateLocalComputeSmokeReceipt } from './run-local-sdxl-style-smoke-entry.mjs';

const hash = 'a'.repeat(64);
function validReceipt() {
  return {
    schemaVersion: 1,
    kind: 'evavo-local-image-style-smoke-v1',
    ok: true,
    hostedFallbackUsed: false,
    artifactProofVerified: true,
    stylesCompleted: 3,
    postflight: { readyForGeneration: true, modelSha256Verified: true },
    generation: {
      ok: true,
      hostedFallbackUsed: false,
      results: [
        { styleId: 'cel-animation', filename: 'EVAVO_STYLE_CEL_00001_.png', bytes: 101, sha256: hash, durationSeconds: 8.1 },
        { styleId: 'game-sprite-90s', filename: 'EVAVO_STYLE_SPRITE90S_00001_.png', bytes: 102, sha256: hash, durationSeconds: 8.2 },
        { styleId: 'realistic', filename: 'EVAVO_STYLE_REALISTIC_00001_.png', bytes: 103, sha256: hash, durationSeconds: 8.3 },
      ],
    },
  };
}

test('accepts a complete local-only three-style physical receipt', () => {
  const value = validateLocalComputeSmokeReceipt(validReceipt());
  assert.equal(value.styles.length, 3);
  assert.deepEqual(value.styles.map((row) => row.styleId), ['cel-animation', 'game-sprite-90s', 'realistic']);
  assert.equal(value.styles[0].sha256, hash);
});

test('rejects hosted fallback evidence', () => {
  const receipt = validReceipt();
  receipt.hostedFallbackUsed = true;
  assert.throws(() => validateLocalComputeSmokeReceipt(receipt), /hosted fallback/u);
});

test('rejects missing artifact proof', () => {
  const receipt = validReceipt();
  receipt.artifactProofVerified = false;
  assert.throws(() => validateLocalComputeSmokeReceipt(receipt), /artifact evidence/u);
});

test('rejects malformed or insufficient PNG evidence', () => {
  const receipt = validReceipt();
  receipt.generation.results[1].sha256 = 'bad';
  assert.throws(() => validateLocalComputeSmokeReceipt(receipt), /artifact evidence is malformed/u);

  const shortReceipt = validReceipt();
  shortReceipt.generation.results.pop();
  assert.throws(() => validateLocalComputeSmokeReceipt(shortReceipt), /insufficient style results/u);
});
