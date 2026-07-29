import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildSpriteAtlasPackage } from "../dist/index.js";

const transparentFixture =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==";

test("rebuilds the same output and keeps source references portable", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-atlas-rebuild-"));
  const imagePath = path.join(root, "frame.png");
  const manifestPath = path.join(root, "atlas.json");
  const outputDirectory = path.join(root, "generated");
  await writeFile(imagePath, Buffer.from(transparentFixture, "base64"));
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1.0",
      atlasId: "repeat",
      frames: [
        { id: "frame", path: "frame.png", pivot: { x: 4, y: 7 } },
      ],
      animations: [
        {
          name: "idle",
          loopMode: "linear",
          frames: [{ frameId: "frame", durationMs: 125 }],
        },
      ],
      settings: {
        maximumWidth: 64,
        maximumHeight: 64,
        padding: 1,
        extrusion: 1,
      },
    }),
  );

  const first = await buildSpriteAtlasPackage(
    manifestPath,
    outputDirectory,
    { allowedRoots: [root] },
  );
  const second = await buildSpriteAtlasPackage(
    manifestPath,
    outputDirectory,
    { allowedRoots: [root] },
  );

  assert.equal(first.packageData.atlasImage.sha256, second.packageData.atlasImage.sha256);
  assert.equal(first.atlasDataSha256, second.atlasDataSha256);
  assert.equal(second.packageData.frames[0].sourcePath, "frame.png");
  assert.equal(
    second.packageData.frames[0].sourcePath.includes(root),
    false,
    "machine-specific roots must not enter atlas metadata",
  );

  const written = JSON.parse(await readFile(second.dataPath, "utf8"));
  assert.equal(written.frames[0].sourcePath, "frame.png");
  assert.equal(written.atlasImage.sha256, second.packageData.atlasImage.sha256);
});
