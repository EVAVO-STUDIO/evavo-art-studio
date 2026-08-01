import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import sharp from "sharp";

import {
  SpriteAtlasInputError,
  buildSpriteAtlasPackageFromEncodedFrames,
  buildSpriteAtlasPagesFromEncodedFrames,
} from "../dist/index.js";

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

async function frame(id, colour, width = 8, height = 8) {
  return {
    id,
    sourceReference: `artifact://${id}`,
    bytes: await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { ...colour, alpha: 1 },
      },
    })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer(),
  };
}

function manifest(frameIds, maximumWidth = 16, maximumHeight = 16) {
  return {
    schemaVersion: "1.0",
    atlasId: "artifact-native-atlas",
    frames: frameIds.map((id) => ({
      id,
      path: `artifacts/${id}.png`,
      pivot: { x: 4, y: 7 },
    })),
    animations: [
      {
        name: "idle/south",
        loopMode: "linear",
        frames: frameIds.map((frameId, index) => ({
          frameId,
          durationMs: index % 2 ? 125 : 250,
        })),
      },
    ],
    settings: {
      maximumWidth,
      maximumHeight,
      padding: 1,
      extrusion: 1,
      trim: false,
      powerOfTwo: "not-required",
      textureFiltering: "nearest",
      pngCompressionLevel: 9,
    },
    output: {
      imageFileName: "family.png",
      dataFileName: "family.json",
      evidenceFileName: "family.evidence.json",
    },
  };
}

test("builds deterministic multi-page atlases directly from encoded frames", async () => {
  const frames = await Promise.all([
    frame("frame-a", { r: 255, g: 0, b: 0 }),
    frame("frame-b", { r: 0, g: 255, b: 0 }),
    frame("frame-c", { r: 0, g: 0, b: 255 }),
    frame("frame-d", { r: 255, g: 255, b: 0 }),
  ]);
  const result = await buildSpriteAtlasPagesFromEncodedFrames(
    manifest(frames.map((entry) => entry.id)),
    frames,
    { maximumPages: 8, decodeConcurrency: 2 },
  );
  assert.equal(result.pages.length, 4);
  assert.equal(result.animations.length, 1);
  assert.deepEqual(
    Object.keys(result.framePageById).sort(),
    frames.map((entry) => entry.id).sort(),
  );
  for (const page of result.pages) {
    assert.equal(page.pageCount, 4);
    assert.equal(page.frameIds.length, 1);
    assert.equal(page.atlasDataSha256, sha256(page.dataJson));
    assert.equal(page.evidence.atlasDataSha256, page.atlasDataSha256);
    assert.equal(page.evidence.atlasImageSha256, sha256(page.atlasImage));
    assert.match(page.packageData.atlasImage.fileName, /page-00[1-4]\.png$/);
  }
  const repeated = await buildSpriteAtlasPagesFromEncodedFrames(
    manifest(frames.map((entry) => entry.id)),
    frames,
    { maximumPages: 8, decodeConcurrency: 4 },
  );
  assert.deepEqual(
    repeated.pages.map((page) => sha256(page.atlasImage)),
    result.pages.map((page) => sha256(page.atlasImage)),
  );
});

test("single-page wrapper binds animation JSON and evidence hashes exactly", async () => {
  const frames = await Promise.all([
    frame("frame-a", { r: 255, g: 0, b: 0 }),
    frame("frame-b", { r: 0, g: 0, b: 255 }),
  ]);
  const result = await buildSpriteAtlasPackageFromEncodedFrames(
    manifest(frames.map((entry) => entry.id), 32, 16),
    frames,
  );
  assert.equal(result.packageData.animations.length, 1);
  assert.equal(result.atlasDataSha256, sha256(result.dataJson));
  assert.equal(result.evidence.atlasDataSha256, result.atlasDataSha256);
  assert.equal(result.evidence.atlasImageSha256, sha256(result.atlasImage));
});

test("rejects missing, duplicate, and undeclared encoded frames", async () => {
  const a = await frame("frame-a", { r: 255, g: 0, b: 0 });
  await assert.rejects(
    () =>
      buildSpriteAtlasPagesFromEncodedFrames(
        manifest(["frame-a", "frame-b"]),
        [a, a],
      ),
    (error) =>
      error instanceof SpriteAtlasInputError &&
      error.code === "SPRITE_ATLAS_FRAME_SET_INVALID",
  );
});
