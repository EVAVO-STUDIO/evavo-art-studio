import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { reviewWorkHeaderImage } from "../dist/index.js";

async function detailedImage(width = 2400, height = 1400) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#111"/><stop offset="1" stop-color="#eee"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    ${Array.from({ length: 28 }, (_, i) => `<rect x="${i * 83}" y="${(i % 7) * 170}" width="52" height="120" fill="${i % 2 ? '#ff244e' : '#171717'}"/>`).join('')}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test("work header review emits viewport proof and structured evidence", async () => {
  const result = await reviewWorkHeaderImage(await detailedImage(), {
    minimumSharpness: 1,
    viewports: [
      { name: "desktop", width: 1600, height: 800 },
      { name: "mobile", width: 720, height: 900 },
    ],
  });
  assert.equal(result.evidence.width, 2400);
  assert.equal(result.evidence.height, 1400);
  assert.equal(result.evidence.viewportEvidence.length, 2);
  assert.ok(result.evidence.score >= 0 && result.evidence.score <= 100);
  assert.ok(result.proofPng.length > 100);
  const proofMeta = await sharp(result.proofPng).metadata();
  assert.equal(proofMeta.format, "png");
});

test("work header review hard-fails an undersized candidate", async () => {
  const tiny = await detailedImage(320, 180);
  const result = await reviewWorkHeaderImage(tiny, {
    minimumSharpness: 0,
    viewports: [{ name: "desktop", width: 1920, height: 900 }],
  });
  assert.equal(result.evidence.grade, "fail");
  assert.ok(result.evidence.issues.some((issue) => issue.startsWith("undersized-for-desktop")));
});

test("work header review flags destructive aspect-ratio crops", async () => {
  const portrait = await detailedImage(900, 2200);
  const result = await reviewWorkHeaderImage(portrait, {
    minimumSharpness: 0,
    maximumUpscaleRatio: 8,
    minimumCropRetainedRatio: 0.6,
    viewports: [{ name: "desktop", width: 1920, height: 760 }],
  });
  assert.equal(result.evidence.grade, "fail");
  assert.ok(result.evidence.issues.some((issue) => issue.startsWith("destructive-desktop-crop")));
});
