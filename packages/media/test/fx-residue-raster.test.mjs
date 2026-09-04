import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import { rasterizeFxResidueSvgCandidate } from "../dist/index.js";

const SVG = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><ellipse cx="512" cy="512" rx="120" ry="80" fill="white"/><circle cx="700" cy="440" r="22" fill="white" fill-opacity="0.5"/></svg>`;

test("rasterizes FX residue SVG to exact true-alpha PNG with hostile-background proof", async () => {
  const first = await rasterizeFxResidueSvgCandidate(SVG, 1024, 1024, 12);
  const second = await rasterizeFxResidueSvgCandidate(SVG, 1024, 1024, 12);
  assert.deepEqual(first.png, second.png);
  assert.deepEqual(first.transparencyProofPng, second.transparencyProofPng);
  assert.deepEqual(first.evidence, second.evidence);
  assert.equal(first.evidence.processorId, "sharp-exact-canvas-runtime");
  assert.equal(first.evidence.outputWidth, 1024);
  assert.equal(first.evidence.outputHeight, 1024);
  assert.equal(first.evidence.alphaMode, "straight");
  assert.equal(first.evidence.meaningfulTransparency, true);
  assert.equal(first.evidence.paintedCheckerboardDetected, false);
  assert.ok(first.evidence.transparentPixels > 0);
  assert.ok(first.evidence.visiblePixels > 0);
  assert.ok(first.evidence.partialAlphaPixels > 0);
  assert.match(first.evidence.pngSha256, /^[a-f0-9]{64}$/);
  assert.match(first.evidence.proofSha256, /^[a-f0-9]{64}$/);
  const decoded = await sharp(first.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 1024);
  assert.equal(decoded.info.height, 1024);
  const proof = await sharp(first.transparencyProofPng).metadata();
  assert.ok((proof.width ?? 0) > 0);
  assert.ok((proof.height ?? 0) > 0);
});

test("rejects empty residue SVG alpha", async () => {
  const empty = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"></svg>`;
  await assert.rejects(() => rasterizeFxResidueSvgCandidate(empty), /no visible pixels|meaningful transparency/i);
});
