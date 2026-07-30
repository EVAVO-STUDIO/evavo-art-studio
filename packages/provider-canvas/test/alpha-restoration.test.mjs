import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  preparePixelArtProviderCanvas,
  restorePixelArtProviderCanvas,
} from "../dist/index.js";

async function pngFromRaw(data, width, height) {
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

async function raw(input) {
  return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function fixture(alphaMode = "source") {
  const width = 4;
  const height = 4;
  const base = Buffer.alloc(width * height * 4);
  const mask = Buffer.alloc(width * height * 4, 255);
  const editableOffset = (1 * width + 1) * 4;
  base[editableOffset] = 210;
  base[editableOffset + 1] = 50;
  base[editableOffset + 2] = 70;
  base[editableOffset + 3] = 96;
  mask[editableOffset + 3] = 0;
  const basePng = await pngFromRaw(base, width, height);
  const maskPng = await pngFromRaw(mask, width, height);
  const prepared = await preparePixelArtProviderCanvas(basePng, maskPng, {
    matteColour: "#ff00ff",
    providerWidth: 1024,
    providerHeight: 1024,
    paletteMode: "none",
    alphaMode,
  });
  return { width, editableOffset, basePng, maskPng, prepared };
}

function paintEditableBlock(candidate, manifest, rgba) {
  const startX = manifest.provider.offsetX + manifest.provider.scale;
  const startY = manifest.provider.offsetY + manifest.provider.scale;
  for (let y = 0; y < manifest.provider.scale; y += 1) {
    for (let x = 0; x < manifest.provider.scale; x += 1) {
      const offset =
        ((startY + y) * manifest.provider.width + startX + x) * 4;
      candidate.data[offset] = rgba[0];
      candidate.data[offset + 1] = rgba[1];
      candidate.data[offset + 2] = rgba[2];
      candidate.data[offset + 3] = rgba[3];
    }
  }
}

test("source alpha is retained by default when an opaque provider edits RGB", async () => {
  const data = await fixture();
  assert.equal(data.prepared.manifest.restoration.alphaMode, "source");
  const candidate = await raw(data.prepared.basePng);
  paintEditableBlock(candidate, data.prepared.manifest, [20, 100, 230, 255]);
  const candidatePng = await pngFromRaw(
    candidate.data,
    candidate.info.width,
    candidate.info.height,
  );
  const restored = await restorePixelArtProviderCanvas(
    data.basePng,
    data.maskPng,
    candidatePng,
    data.prepared.manifest,
  );
  const output = await raw(restored.png);
  assert.deepEqual(
    [...output.data.subarray(data.editableOffset, data.editableOffset + 4)],
    [20, 100, 230, 96],
  );
  assert.equal(restored.evidence.alphaMode, "source");
  assert.equal(restored.evidence.editableAlphaChangesFromSource, 0);
});

test("candidate alpha must be opted into explicitly", async () => {
  const data = await fixture("candidate");
  const candidate = await raw(data.prepared.basePng);
  paintEditableBlock(candidate, data.prepared.manifest, [20, 100, 230, 255]);
  const candidatePng = await pngFromRaw(
    candidate.data,
    candidate.info.width,
    candidate.info.height,
  );
  const restored = await restorePixelArtProviderCanvas(
    data.basePng,
    data.maskPng,
    candidatePng,
    data.prepared.manifest,
  );
  const output = await raw(restored.png);
  assert.equal(output.data[data.editableOffset + 3], 255);
  assert.equal(restored.evidence.alphaMode, "candidate");
  assert.equal(restored.evidence.editableAlphaChangesFromSource, 1);
});
