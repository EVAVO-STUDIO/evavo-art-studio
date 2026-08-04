import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectRepository } from "../dist/index.js";

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function rgbaPng(width, height, pixels) {
  assert.equal(pixels.length, width * height * 4);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  for (let row = 0; row < height; row += 1) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(pixels.slice(row * width * 4, (row + 1) * width * 4)));
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function writeAsset(root, relative, bytes) {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

test("audits alpha, duplicates, code demand and animation continuity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-art-audit-"));
  await writeFile(
    path.join(root, "project.godot"),
    `[application]\nconfig/name="Audit Demo"\nconfig/features=PackedStringArray("4.6")\n[display]\ndisplay/window/size/viewport_width=1280\ndisplay/window/size/viewport_height=720\n`,
  );

  const meaningfulAlpha = rgbaPng(2, 1, [255, 255, 255, 255, 255, 255, 255, 0]);
  const opaqueAlpha = rgbaPng(2, 1, [20, 20, 20, 255, 40, 40, 40, 255]);
  await writeAsset(root, "assets/art/ui/icons/cargo.png", meaningfulAlpha);
  await writeAsset(root, "RAW_ART/icons/cargo-copy.png", meaningfulAlpha);
  await writeAsset(root, "assets/art/portraits/dialogue/owner_idle.png", opaqueAlpha);
  await writeAsset(root, "assets/art/fx/weather/rain_sheet_01.png", meaningfulAlpha);
  await writeAsset(root, "assets/art/fx/weather/rain_sheet_03.png", meaningfulAlpha);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src", "media.gd"),
    `const ICON = preload("res://assets/art/ui/icons/cargo.png")\nconst MISSING = "res://assets/art/ui/icons/missing.png"\n`,
  );

  const result = await inspectRepository(root);
  assert.equal(result.analysisVersion, "1.0");
  assert.equal(result.engine, "godot");
  assert.equal(result.projectName, "Audit Demo");

  const icon = result.artFiles.find((entry) => entry.path.endsWith("cargo.png"));
  assert.ok(icon);
  assert.equal(icon.role, "ui-icon");
  assert.equal(icon.image?.alphaUsage, "meaningful");
  assert.equal(icon.referenceCount, 1);
  assert.equal(icon.transparencyPolicy, "require-meaningful-alpha");

  const dialogue = result.artFiles.find((entry) => entry.path.endsWith("owner_idle.png"));
  assert.ok(dialogue);
  assert.equal(dialogue.role, "dialogue-portrait");
  assert.equal(dialogue.image?.alphaUsage, "opaque-channel");
  assert.equal(dialogue.transparencyPolicy, "preserve-authored-black-stage");

  assert.equal(result.duplicateGroups.length, 1);
  assert.ok(result.duplicateGroups.some((group) => group.paths.includes("RAW_ART/icons/cargo-copy.png")));
  assert.deepEqual(result.missingAssetReferences, [
    {
      requestedPath: "assets/art/ui/icons/missing.png",
      referencedBy: ["src/media.gd"],
    },
  ]);

  const rain = result.animationFamilies.find((family) => family.id.endsWith("rain_sheet"));
  assert.ok(rain);
  assert.deepEqual(rain.missingFrameIndices, [2]);
  assert.equal(rain.recommendedFramesPerSecond, 10);
  assert.equal(rain.consistentDimensions, true);
  assert.ok(result.cleanupCandidates.every((candidate) => candidate.requiresHumanApproval));
});
