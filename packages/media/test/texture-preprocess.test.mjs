import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { composeOpacityIntoAlbedoAlpha, convertTangentNormalYConvention } from "../dist/index.js";

async function rgba(width, height, bytes) {
  return sharp(Buffer.from(bytes), { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("converts DirectX/OpenGL normal Y by changing only green", async () => {
  const sourceBytes = [
    100, 40, 240, 255,
    120, 80, 250, 128,
  ];
  const source = await rgba(2, 1, sourceBytes);
  const result = await convertTangentNormalYConvention(source, {
    sourceConvention: "directx",
    targetConvention: "opengl",
  });
  const decoded = await sharp(result.png).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [
    100, 215, 240, 255,
    120, 175, 250, 128,
  ]);
  assert.equal(result.evidence.transformation, "G=255-G");
  assert.deepEqual(result.evidence.preservedChannels, ["r", "b", "a"]);
  assert.equal(result.evidence.sourceMutationAllowed, false);
});

test("normal convention conversion refuses a no-op declaration", async () => {
  const source = await rgba(1, 1, [128, 128, 255, 255]);
  await assert.rejects(
    convertTangentNormalYConvention(source, { sourceConvention: "opengl", targetConvention: "opengl" }),
    /requires different source and target conventions/,
  );
});

test("composes opacity into alpha while preserving albedo RGB exactly", async () => {
  const albedoBytes = [
    10, 20, 30, 40,
    50, 60, 70, 80,
  ];
  const opacityBytes = [
    5, 5, 5, 255,
    200, 200, 200, 255,
  ];
  const result = await composeOpacityIntoAlbedoAlpha(
    await rgba(2, 1, albedoBytes),
    await rgba(2, 1, opacityBytes),
  );
  const decoded = await sharp(result.png).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [
    10, 20, 30, 5,
    50, 60, 70, 200,
  ]);
  assert.equal(result.evidence.albedoRgbPreservedExactly, true);
  assert.equal(result.evidence.alphaReplaced, true);
});

test("supports explicit opacity channel selection and inversion", async () => {
  const result = await composeOpacityIntoAlbedoAlpha(
    await rgba(1, 1, [10, 20, 30, 255]),
    await rgba(1, 1, [1, 2, 3, 4]),
    { sourceChannel: "a", invertOpacity: true, strictOpacityValidation: false },
  );
  const decoded = await sharp(result.png).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [10, 20, 30, 251]);
});

test("refuses opacity/albedo dimension mismatch", async () => {
  await assert.rejects(
    composeOpacityIntoAlbedoAlpha(
      await rgba(2, 1, [1, 2, 3, 255, 4, 5, 6, 255]),
      await rgba(1, 1, [255, 255, 255, 255]),
    ),
    /Opacity dimensions must match albedo exactly/,
  );
});

test("strict opacity validation rejects chromatic scalar contamination", async () => {
  await assert.rejects(
    composeOpacityIntoAlbedoAlpha(
      await rgba(1, 1, [1, 2, 3, 255]),
      await rgba(1, 1, [0, 128, 255, 255]),
    ),
    /failed scalar validation/,
  );
});
