import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { buildSpriteAtlasPackage } from "@evavo/art-media";
import {
  GODOT_SPRITE_FRAMES_IMPORTER,
  GodotSpritePackageError,
  toGodotResourcePath,
  writeGodotSpriteFramesImporter,
} from "../dist/index.js";

async function fixture() {
  const project = await mkdtemp(path.join(os.tmpdir(), "evavo-godot-"));
  await writeFile(path.join(project, "project.godot"), '[application]\nconfig/name="Atlas Test"\n');
  const source = path.join(project, "art", "source");
  const build = path.join(project, "art", "generated");
  await mkdir(source, { recursive: true });
  const rgba = Buffer.alloc(8 * 8 * 4);
  for (let y = 1; y < 7; y += 1) {
    for (let x = 2; x < 6; x += 1) {
      const offset = (y * 8 + x) * 4;
      rgba[offset] = 255;
      rgba[offset + 1] = 255;
      rgba[offset + 2] = 255;
      rgba[offset + 3] = 255;
    }
  }
  await sharp(rgba, { raw: { width: 8, height: 8, channels: 4 } })
    .png()
    .toFile(path.join(source, "idle.png"));
  const manifestPath = path.join(project, "art", "atlas.json");
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1.0",
      atlasId: "hero",
      frames: [{ id: "idle", path: "source/idle.png", pivot: { x: 4, y: 7 } }],
      animations: [
        {
          name: "idle",
          loopMode: "ping-pong",
          frames: [
            { frameId: "idle", durationMs: 125 },
            { frameId: "idle", durationMs: 250 },
          ],
        },
      ],
      settings: { maximumWidth: 64, maximumHeight: 64, padding: 1, extrusion: 1 },
    }),
  );
  const atlas = await buildSpriteAtlasPackage(manifestPath, build, {
    allowedRoots: [project],
  });
  return { project, atlas };
}

test("writes a Godot 4.6.2 descriptor and headless importer", async () => {
  const { project, atlas } = await fixture();
  const result = await writeGodotSpriteFramesImporter(atlas, project);
  await access(result.descriptorPath);
  await access(result.importerPath);
  const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
  assert.equal(descriptor.targetEngine, "Godot 4.6.2");
  assert.equal(descriptor.atlasTexturePath, "res://art/generated/hero.png");
  assert.equal(descriptor.outputResourcePath, "res://art/generated/hero.sprite_frames.tres");
  assert.equal(descriptor.animations[0].loopModeValue, 2);
  assert.equal(descriptor.animations[0].framesPerSecond, 8);
  assert.deepEqual(
    descriptor.animations[0].frames.map((frame) => frame.relativeDuration),
    [1, 2],
  );
  assert.deepEqual(result.headlessCommand.slice(0, 5), [
    "godot",
    "--headless",
    "--path",
    project,
    "--script",
  ]);
});

test("importer uses public SpriteFrames APIs and retains EVAVO runtime telemetry metadata", () => {
  for (const token of [
    "AtlasTexture.new()",
    "texture.region = Rect2(",
    "texture.margin = Rect2(",
    "texture.filter_clip = true",
    "sprite_frames.set_animation_speed",
    "sprite_frames.set_animation_loop_mode",
    "sprite_frames.add_frame",
    "ResourceSaver.save",
    'set_meta("evavo_frame_metadata"',
    'set_meta("evavo_animation_metadata"',
    '"frame_ids": ordered_frame_ids',
    '"duration_micros": duration_micros',
    '"frames_per_second": float(animation["framesPerSecond"])',
    '"loop_mode": String(animation["loopMode"])',
  ]) {
    assert.ok(GODOT_SPRITE_FRAMES_IMPORTER.includes(token), `missing ${token}`);
  }
});

test("rejects outputs outside the project root", async () => {
  const { project } = await fixture();
  assert.throws(
    () => toGodotResourcePath(project, path.join(project, "..", "outside.tres")),
    (error) =>
      error instanceof GodotSpritePackageError &&
      error.code === "GODOT_OUTPUT_OUTSIDE_PROJECT",
  );
});
