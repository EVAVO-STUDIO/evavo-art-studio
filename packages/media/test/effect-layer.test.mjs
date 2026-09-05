import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import {
  composeRasterLayers,
  createRasterEffectLayer,
} from "../dist/index.js";

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

async function alphaRange(encoded) {
  const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.channels, 4);
  let minimum = 255;
  let maximum = 0;
  let nonZero = 0;
  let nonOpaque = 0;
  for (let index = 3; index < decoded.data.length; index += 4) {
    const alpha = decoded.data[index];
    minimum = Math.min(minimum, alpha);
    maximum = Math.max(maximum, alpha);
    if (alpha > 0) nonZero += 1;
    if (alpha > 0 && alpha < 255) nonOpaque += 1;
  }
  return { minimum, maximum, nonZero, nonOpaque };
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
  assert.ok(result.evidence.operations.includes("materialize-shifted-alpha-source"));
  assert.ok(result.evidence.operations.includes("extract-source-alpha"));
  assert.ok(result.evidence.operations.includes("spread:2"));
  assert.ok(result.evidence.operations.includes("blur:8"));
  assert.ok(result.evidence.operations.includes("opacity:0.55"));

  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.hasAlpha, true);
  assert.equal(metadata.width, result.evidence.outputWidth);
  assert.equal(metadata.height, result.evidence.outputHeight);

  const alpha = await alphaRange(result.buffer);
  assert.equal(alpha.minimum, 0);
  assert.ok(alpha.maximum > 0);
  assert.ok(alpha.nonZero > 0);
  assert.ok(alpha.nonOpaque > 0);
});

test("composes a generated shadow behind its subject using returned anchor evidence", async () => {
  const subject = await transparentSubject();
  const shadow = await createRasterEffectLayer(subject, {
    kind: "drop-shadow",
    blurSigma: 6,
    spread: 1,
    offsetX: 6,
    offsetY: 7,
    opacity: 0.45,
  });

  const finished = await composeRasterLayers(shadow.buffer, {
    layers: [
      {
        name: "subject",
        input: subject,
        left: shadow.evidence.subjectAnchorLeft,
        top: shadow.evidence.subjectAnchorTop,
      },
    ],
    format: "png",
  });

  assert.equal(finished.evidence.canvasWidth, shadow.evidence.outputWidth);
  assert.equal(finished.evidence.canvasHeight, shadow.evidence.outputHeight);
  assert.equal(
    finished.evidence.layers[0].placement,
    `left:${shadow.evidence.subjectAnchorLeft},top:${shadow.evidence.subjectAnchorTop}`,
  );
  const raw = await sharp(finished.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const subjectPixel =
    ((shadow.evidence.subjectAnchorTop + 18) * raw.info.width +
      (shadow.evidence.subjectAnchorLeft + 22)) *
    4;
  assert.ok(raw.data[subjectPixel] > 200);
  assert.ok(raw.data[subjectPixel + 3] > 200);
});

test("creates an outer glow with zero offset and meaningful transparent falloff", async () => {
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
  const alpha = await alphaRange(result.buffer);
  assert.equal(alpha.minimum, 0);
  assert.ok(alpha.maximum > 0);
  assert.ok(alpha.nonZero > 0);
  assert.ok(alpha.nonOpaque > 0);
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
