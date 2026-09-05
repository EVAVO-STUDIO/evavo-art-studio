import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import {
  TransparencyProofError,
  createTransparencyProofSheet,
} from "../dist/index.js";

async function sampleTransparentObject() {
  return sharp({
    create: {
      width: 72,
      height: 48,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 30,
            height: 22,
            channels: 4,
            background: { r: 255, g: 36, b: 78, alpha: 0.85 },
          },
        })
          .png()
          .toBuffer(),
        left: 21,
        top: 13,
      },
    ])
    .png()
    .toBuffer();
}

test("creates a deterministic transparency proof with green and alpha-mask tiles", async () => {
  const input = await sampleTransparentObject();
  const result = await createTransparencyProofSheet(input, {
    maximumPreviewDimension: 128,
  });

  assert.deepEqual(result.evidence.backgrounds, [
    "#000000",
    "#ffffff",
    "#808080",
    "#00ff00",
    "#ff00ff",
  ]);
  assert.equal(result.evidence.includesAlphaMask, true);
  assert.equal(result.evidence.checkerboardUsed, false);
  assert.equal(result.evidence.inputSha256.length, 64);
  assert.equal(result.evidence.outputSha256.length, 64);
  assert.notEqual(result.evidence.inputSha256, result.evidence.outputSha256);
  assert.ok(result.evidence.columns >= 1);
  assert.ok(result.evidence.rows >= 1);

  const metadata = await sharp(result.png).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, result.evidence.columns * result.evidence.cellWidth);
  assert.equal(metadata.height, result.evidence.rows * result.evidence.cellHeight);
});

test("supports explicit diagnostic backgrounds and rejects invalid proof requests", async () => {
  const input = await sampleTransparentObject();
  const result = await createTransparencyProofSheet(input, {
    backgrounds: ["#00ff00", "#101010"],
    nearest: true,
    maximumPreviewDimension: 96,
  });
  assert.deepEqual(result.evidence.backgrounds, ["#00ff00", "#101010"]);

  await assert.rejects(
    () => createTransparencyProofSheet(input, { backgrounds: ["green"] }),
    (error) =>
      error instanceof TransparencyProofError &&
      error.code === "TRANSPARENCY_PROOF_BACKGROUNDS_INVALID",
  );

  await assert.rejects(
    () => createTransparencyProofSheet(Buffer.alloc(0)),
    (error) =>
      error instanceof TransparencyProofError &&
      error.code === "TRANSPARENCY_PROOF_INPUT_INVALID",
  );
});
