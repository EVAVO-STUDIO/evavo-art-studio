import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectRepository } from "../dist/index.js";

test("detects a Godot repository and art gaps", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-art-inspector-"));
  await writeFile(
    path.join(root, "project.godot"),
    `[application]
config/name="Demo"
config/features=PackedStringArray("4.6", "GL Compatibility")
[display]
display/window/size/viewport_width=1280
display/window/size/viewport_height=720
`,
  );
  await mkdir(path.join(root, "art", "characters"), { recursive: true });
  await writeFile(path.join(root, "art", "characters", "hero.png"), "not-a-real-png");
  const result = await inspectRepository(root);
  assert.equal(result.engine, "godot");
  assert.equal(result.engineVersionHint, "4.6");
  assert.deepEqual(result.viewport, { width: 1280, height: 720 });
  assert.ok(result.artFiles.some((entry) => entry.path === "art/characters/hero.png"));
  assert.ok(result.gaps.length > 0);
});
