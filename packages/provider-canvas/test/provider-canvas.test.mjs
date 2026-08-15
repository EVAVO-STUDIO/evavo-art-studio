import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  ProviderCanvasError,
  deriveProviderCanvasSize,
  normalizePixelArtProviderCanvasOptions,
  preparePixelArtProviderCanvas,
  restorePixelArtProviderCanvas,
} from "../dist/index.js";

async function sourceFixture({ partialMask = false } = {}) {
  const width = 8;
  const height = 8;
  const base = Buffer.alloc(width * height * 4);
  const mask = Buffer.alloc(width * height * 4, 255);
  for (let y = 1; y < 7; y += 1) {
    for (let x = 1; x < 7; x += 1) {
      const offset = (y * width + x) * 4;
      base[offset] = 220;
      base[offset + 1] = 40;
      base[offset + 2] = 50;
      base[offset + 3] = 255;
    }
  }
  const blue = (6 * width + 6) * 4;
  base[blue] = 30;
  base[blue + 1] = 80;
  base[blue + 2] = 220;
  base[blue + 3] = 255;
  const editable = (3 * width + 3) * 4;
  mask[editable + 3] = partialMask ? 128 : 0;
  const encode = (data) =>
    sharp(data, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();
  return {
    width,
    height,
    editable: { x: 3, y: 3 },
    protected: { x: 2, y: 2 },
    basePng: await encode(base),
    maskPng: await encode(mask),
    originalRgba: base,
  };
}

async function rawPng(input) {
  return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

test("derives a valid integer provider canvas without resampling the pixel grid", () => {
  const options = normalizePixelArtProviderCanvasOptions({
    matteColour: "#ff00ff",
  });
  const layout = deriveProviderCanvasSize(128, 64, options);
  assert.equal(layout.width % 16, 0);
  assert.equal(layout.height % 16, 0);
  assert.ok(layout.width * layout.height >= 655360);
  assert.ok(layout.width * layout.height <= 8294400);
  assert.ok(layout.scale >= 1);
  assert.equal(layout.offsetX, Math.floor((layout.width - 128 * layout.scale) / 2));
  assert.equal(layout.offsetY, Math.floor((layout.height - 64 * layout.scale) / 2));
});

test("prepares an opaque matte base and matching binary mask at an integer scale", async () => {
  const fixture = await sourceFixture();
  const prepared = await preparePixelArtProviderCanvas(
    fixture.basePng,
    fixture.maskPng,
    {
      matteColour: "#ff00ff",
      providerWidth: 1024,
      providerHeight: 1024,
      contentMarginPixels: 64,
      paletteMode: "source",
    },
  );
  assert.equal(prepared.manifest.provider.scale, 112);
  assert.equal(prepared.manifest.provider.offsetX, 64);
  assert.equal(prepared.manifest.provider.offsetY, 64);
  assert.equal(prepared.manifest.mask.binary, true);
  assert.equal(prepared.manifest.mask.editablePixels, 1);
  assert.equal(prepared.manifest.restoration.palette.length, 2);
  const [base, mask] = await Promise.all([
    rawPng(prepared.basePng),
    rawPng(prepared.maskPng),
  ]);
  assert.equal(base.info.width, 1024);
  assert.equal(base.info.height, 1024);
  const outside = 0;
  assert.deepEqual([...base.data.subarray(outside, outside + 4)], [255, 0, 255, 255]);
  assert.deepEqual([...mask.data.subarray(outside, outside + 4)], [255, 255, 255, 255]);
  const editableX =
    prepared.manifest.provider.offsetX +
    fixture.editable.x * prepared.manifest.provider.scale +
    1;
  const editableY =
    prepared.manifest.provider.offsetY +
    fixture.editable.y * prepared.manifest.provider.scale +
    1;
  const editableOffset = (editableY * 1024 + editableX) * 4;
  assert.equal(mask.data[editableOffset + 3], 0);
});

test("restoration changes only editable source pixels and maps them to the source palette", async () => {
  const fixture = await sourceFixture();
  const prepared = await preparePixelArtProviderCanvas(
    fixture.basePng,
    fixture.maskPng,
    {
      matteColour: "#ff00ff",
      providerWidth: 1024,
      providerHeight: 1024,
      paletteMode: "source",
      restorationSampling: "nearest-center",
    },
  );
  const candidate = await rawPng(prepared.basePng);
  const paintBlock = (sourceX, sourceY, rgba) => {
    const startX =
      prepared.manifest.provider.offsetX +
      sourceX * prepared.manifest.provider.scale;
    const startY =
      prepared.manifest.provider.offsetY +
      sourceY * prepared.manifest.provider.scale;
    for (let y = 0; y < prepared.manifest.provider.scale; y += 1) {
      for (let x = 0; x < prepared.manifest.provider.scale; x += 1) {
        const offset =
          ((startY + y) * prepared.manifest.provider.width + startX + x) * 4;
        candidate.data[offset] = rgba[0];
        candidate.data[offset + 1] = rgba[1];
        candidate.data[offset + 2] = rgba[2];
        candidate.data[offset + 3] = rgba[3];
      }
    }
  };
  paintBlock(fixture.editable.x, fixture.editable.y, [30, 80, 220, 255]);
  paintBlock(fixture.protected.x, fixture.protected.y, [0, 255, 0, 255]);
  const candidatePng = await sharp(candidate.data, {
    raw: {
      width: candidate.info.width,
      height: candidate.info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  const restored = await restorePixelArtProviderCanvas(
    fixture.basePng,
    fixture.maskPng,
    candidatePng,
    prepared.manifest,
  );
  const output = await rawPng(restored.png);
  const editableOffset =
    (fixture.editable.y * fixture.width + fixture.editable.x) * 4;
  const protectedOffset =
    (fixture.protected.y * fixture.width + fixture.protected.x) * 4;
  assert.deepEqual(
    [...output.data.subarray(editableOffset, editableOffset + 4)],
    [30, 80, 220, 255],
  );
  assert.deepEqual(
    [...output.data.subarray(protectedOffset, protectedOffset + 4)],
    [...fixture.originalRgba.subarray(protectedOffset, protectedOffset + 4)],
  );
  assert.equal(restored.evidence.protectedExact, true);
  assert.equal(restored.evidence.protectedChannelMismatches, 0);
  assert.equal(restored.evidence.editablePixels, 1);
});

test("block-average restoration reports provider variation while preserving crisp output", async () => {
  const fixture = await sourceFixture();
  const prepared = await preparePixelArtProviderCanvas(
    fixture.basePng,
    fixture.maskPng,
    {
      matteColour: "#ff00ff",
      providerWidth: 1024,
      providerHeight: 1024,
      paletteMode: "none",
      restorationSampling: "block-average",
    },
  );
  const candidate = await rawPng(prepared.basePng);
  const startX =
    prepared.manifest.provider.offsetX +
    fixture.editable.x * prepared.manifest.provider.scale;
  const startY =
    prepared.manifest.provider.offsetY +
    fixture.editable.y * prepared.manifest.provider.scale;
  for (let y = 0; y < prepared.manifest.provider.scale; y += 1) {
    for (let x = 0; x < prepared.manifest.provider.scale; x += 1) {
      const offset =
        ((startY + y) * prepared.manifest.provider.width + startX + x) * 4;
      candidate.data[offset] = x % 2 === 0 ? 20 : 220;
      candidate.data[offset + 1] = 60;
      candidate.data[offset + 2] = 100;
      candidate.data[offset + 3] = 255;
    }
  }
  const candidatePng = await sharp(candidate.data, {
    raw: {
      width: 1024,
      height: 1024,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  const restored = await restorePixelArtProviderCanvas(
    fixture.basePng,
    fixture.maskPng,
    candidatePng,
    prepared.manifest,
  );
  assert.ok(restored.evidence.averageEditableBlockDeviation > 0);
  assert.ok(restored.evidence.maximumEditableBlockDeviation > 0);
  const output = await rawPng(restored.png);
  const offset = (fixture.editable.y * 8 + fixture.editable.x) * 4;
  assert.deepEqual([...output.data.subarray(offset, offset + 4)], [120, 60, 100, 255]);
});

test("partial masks and invalid provider canvases fail closed", async () => {
  const fixture = await sourceFixture({ partialMask: true });
  await assert.rejects(
    () =>
      preparePixelArtProviderCanvas(fixture.basePng, fixture.maskPng, {
        matteColour: "#ff00ff",
        providerWidth: 1024,
        providerHeight: 1024,
      }),
    (error) =>
      error instanceof ProviderCanvasError &&
      error.code === "PROVIDER_CANVAS_MASK_NOT_BINARY",
  );
  assert.throws(
    () =>
      normalizePixelArtProviderCanvasOptions({
        matteColour: "#ff00ff",
        providerWidth: 1000,
        providerHeight: 1000,
      }),
    (error) =>
      error instanceof ProviderCanvasError &&
      error.code === "PROVIDER_CANVAS_SIZE_INVALID",
  );
  assert.throws(
    () =>
      normalizePixelArtProviderCanvasOptions({
        matteColour: "#808080",
        providerWidth: 1024,
        providerHeight: 1024,
      }),
    (error) =>
      error instanceof ProviderCanvasError &&
      error.code === "PROVIDER_CANVAS_MATTE_UNSAFE",
  );
});

test("restoration rejects source bytes that differ from the preparation manifest", async () => {
  const fixture = await sourceFixture();
  const prepared = await preparePixelArtProviderCanvas(
    fixture.basePng,
    fixture.maskPng,
    {
      matteColour: "#ff00ff",
      providerWidth: 1024,
      providerHeight: 1024,
    },
  );
  const changed = Buffer.from(fixture.basePng);
  changed[changed.length - 1] ^= 1;
  await assert.rejects(
    () =>
      restorePixelArtProviderCanvas(
        changed,
        fixture.maskPng,
        prepared.basePng,
        prepared.manifest,
      ),
    (error) =>
      error instanceof ProviderCanvasError &&
      [
        "PROVIDER_CANVAS_DECODE_FAILED",
        "PROVIDER_CANVAS_SOURCE_HASH_MISMATCH",
      ].includes(error.code),
  );
});
