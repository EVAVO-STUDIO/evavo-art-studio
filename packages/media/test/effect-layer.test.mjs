import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import { createRasterEffectLayer } from "../dist/index.js";

async function transparentSubject() {
  return sharp({
    create: {
      width: 80,
      height: 60,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 36,
            height: 24,
            channels: 4,
            background: { r: 255, g: 36, b: 78, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
        left: 22,
        top: 18,
      },
    ])
    .png()
    .toBuffer();
}

test("creates a padded drop-shadow layer with deterministic anchor evidence", async () => {
  const subject = await transparentSubject();
  const result = await createRasterEffectLayer(subject, {
    kind: "drop-shadow",
    color: "#000000",
    opacity: 0.55,
    blurSigma: 8,
    spread: 2,
    offsetX: 7,
    offsetY: 9,
  });

  assert.equal(result.evidence.kind, "drop-shadow");
  assert.equal(result.evidence.sourceWidth, 80);
  assert.equal(result.evidence.sourceHeight, 60);
  assert.equal(result.evidence.offsetX, 7);
  assert.equal(result.evidence.offsetY, 9);
  assert.equal(result.evidence.opacity, 0.55);
  assert.ok(result.evidence.padding >= 35);
  assert.equal(result.evidence.subjectAnchorLeft, result.evidence.padding);
  assert.equal(result.evidence.subjectAnchorTop, result.evidence.padding);
  assert.ok(result.evidence.operations.includes("extract-source-alpha"));
  assert.ok(result.evidence.operations.includes("spread:2"));
  assert.ok(result.evidence.operations.includes("blur:8"));
  assert.ok(result.evidence.operations.includes("opacity:0.55"));

  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.hasAlpha, true);
  assert.equal(metadata.width, result.evidence.outputWidth);
  assert.equal(metadata.height, result.evidence.outputHeight);

  const alpha = await sharp(result.buffer).ensureAlpha().extractChannel(3).stats();
  assert.ok(alpha.channels[0].max > 0);
  assert.ok(alpha.channels[0].min < alpha.channels[0].max);
});

test("creates an outer glow with zero offset and keeps a separate transparent effect layer", async () => {
  const subject = await transparentSubject();
  const result = await createRasterEffectLayer(subject, {
    kind: "outer-glow",
    color: "#ff244e",
    opacity: 0.7,
    blurSigma: 10,
    spread: 3,
    offsetX: 99,
    offsetY: -99,
  });

  assert.equal(result.evidence.kind, "outer-glow");
  assert.equal(result.evidence.offsetX, 0);
  assert.equal(result.evidence.offsetY, 0);
  assert.equal(result.evidence.color, "#ff244e");
  assert.equal(result.evidence.subjectAnchorLeft, result.evidence.padding);
  assert.equal(result.evidence.subjectAnchorTop, result.evidence.padding);

  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.hasAlpha, true);
  assert.ok((metadata.width ?? 0) > 80);
  assert.ok((metadata.height ?? 0) > 60);
});

test("rejects unsafe padding and invalid effect ranges before rendering", async () => {
  const subject = await transparentSubject();

  await assert.rejects(
    () =>
      createRasterEffectLayer(subject, {
        kind: "drop-shadow",
        blurSigma: 12,
        spread: 3,
        offsetX: 10,
        offsetY: 10,
        padding: 4,
      }),
    /too small.*minimum safe padding/i,
  );

  await assert.rejects(
    () => createRasterEffectLayer(subject, { kind: "drop-shadow", opacity: 1.1 }),
    /opacity must be between 0 and 1/i,
  );

  await assert.rejects(
    () => createRasterEffectLayer(subject, { kind: "outer-glow", spread: 300 }),
    /spread must be an integer between 0 and 256/i,
  );
});
