import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import {
  SpriteAtlasInputError,
  atlasPackageFingerprint,
  buildSpriteAtlasPackage,
  createAtlasLayout,
  validateSpriteAtlasManifest,
} from "../dist/index.js";

async function sprite(filePath, colour, rect) {
  const width = 8;
  const height = 8;
  const data = Buffer.alloc(width * height * 4);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = colour[0];
      data[offset + 1] = colour[1];
      data[offset + 2] = colour[2];
      data[offset + 3] = 255;
    }
  }
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(filePath);
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-atlas-"));
  const source = path.join(root, "source");
  await mkdir(source);
  await sprite(path.join(source, "red.png"), [255, 0, 0], {
    x: 2,
    y: 1,
    width: 3,
    height: 5,
  });
  await sprite(path.join(source, "green.png"), [0, 255, 0], {
    x: 1,
    y: 2,
    width: 5,
    height: 3,
  });
  const manifest = {
    schemaVersion: "1.0",
    atlasId: "hero",
    frames: [
      { id: "red", path: "source/red.png", pivot: { x: 4, y: 7 } },
      { id: "green", path: "source/green.png", pivot: { x: 4, y: 7 } },
    ],
    animations: [
      {
        name: "idle",
        loopMode: "linear",
        frames: [
          { frameId: "red", durationMs: 125 },
          { frameId: "green", durationMs: 250 },
          { frameId: "red", durationMs: 375 },
        ],
      },
    ],
    settings: {
      maximumWidth: 64,
      maximumHeight: 64,
      padding: 1,
      extrusion: 1,
      trim: true,
      powerOfTwo: "required",
      textureFiltering: "nearest",
    },
  };
  const manifestPath = path.join(root, "atlas.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return { root, manifestPath };
}

test("validates source ids and animation references", () => {
  assert.throws(
    () =>
      validateSpriteAtlasManifest({
        schemaVersion: "1.0",
        atlasId: "broken",
        frames: [{ id: "a", path: "a.png" }],
        animations: [
          {
            name: "idle",
            loopMode: "linear",
            frames: [{ frameId: "missing", durationMs: 100 }],
          },
        ],
      }),
    (error) =>
      error instanceof SpriteAtlasInputError &&
      error.code === "SPRITE_ATLAS_MANIFEST_INVALID",
  );
});

test("packs deterministically and keeps exact timing", async () => {
  const { root, manifestPath } = await fixture();
  const first = await buildSpriteAtlasPackage(
    manifestPath,
    path.join(root, "build-a"),
    { allowedRoots: [root] },
  );
  const second = await buildSpriteAtlasPackage(
    manifestPath,
    path.join(root, "build-b"),
    { allowedRoots: [root] },
  );
  assert.equal(first.packageData.atlasImage.sha256, second.packageData.atlasImage.sha256);
  assert.equal(atlasPackageFingerprint(first.packageData), atlasPackageFingerprint(second.packageData));
  assert.equal(first.packageData.width, 16);
  assert.equal(first.packageData.height, 16);
  assert.equal(first.packageData.frames.length, 2, "reused source frame is packed once");
  const animation = first.packageData.animations[0];
  assert.equal(animation.durationQuantumMs, 125);
  assert.equal(animation.framesPerSecond, 8);
  assert.deepEqual(
    animation.frames.map((frame) => frame.relativeDuration),
    [1, 2, 3],
  );
});

test("trims frames and preserves transparent padding plus extrusion", async () => {
  const { root, manifestPath } = await fixture();
  const result = await buildSpriteAtlasPackage(
    manifestPath,
    path.join(root, "build"),
    { allowedRoots: [root] },
  );
  const red = result.packageData.frames.find((frame) => frame.id === "red");
  assert.deepEqual(red.trim, { x: 2, y: 1, width: 3, height: 5 });
  assert.deepEqual(red.trimmedPivot, { x: 2, y: 6 });

  const { data, info } = await sharp(result.imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [
    ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
  ];
  assert.deepEqual(
    pixel(red.outer.x, red.outer.y),
    [0, 0, 0, 0],
    "outer padding remains transparent",
  );
  assert.deepEqual(
    pixel(red.region.x - 1, red.region.y),
    [255, 0, 0, 255],
    "extrusion copies the subject edge",
  );
  assert.deepEqual(
    pixel(red.region.x, red.region.y),
    [255, 0, 0, 255],
    "region begins with source pixels",
  );
});

test("rejects input paths that escape allowed roots", async () => {
  const { root, manifestPath } = await fixture();
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.frames[0].path = "../outside.png";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(
    () =>
      buildSpriteAtlasPackage(manifestPath, path.join(root, "build"), {
        allowedRoots: [root],
      }),
    (error) =>
      error instanceof SpriteAtlasInputError &&
      error.code === "SPRITE_ATLAS_PATH_OUTSIDE_ALLOWED_ROOTS",
  );
});

test("MaxRects never rotates directional frames", () => {
  const layout = createAtlasLayout(
    [
      { id: "tall", width: 4, height: 9 },
      { id: "wide", width: 9, height: 4 },
    ],
    32,
    32,
    "not-required",
  );
  const tall = layout.placements.find((entry) => entry.id === "tall");
  const wide = layout.placements.find((entry) => entry.id === "wide");
  assert.equal(tall.width, 4);
  assert.equal(tall.height, 9);
  assert.equal(wide.width, 9);
  assert.equal(wide.height, 4);
});
