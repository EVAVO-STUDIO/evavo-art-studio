import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { LocalRuntimeRepository, RuntimeWorker } from "@evavo/art-runtime";

import { createBuiltinHandlers } from "../dist/index.js";

const spritePng =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==";

test("built-in worker turns a durable atlas job into verified artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-worker-"));
  const source = path.join(root, "source");
  const output = path.join(root, "generated");
  await mkdir(source);
  await writeFile(path.join(source, "frame.png"), Buffer.from(spritePng, "base64"));
  await writeFile(
    path.join(root, "project.godot"),
    '[application]\nconfig/name="Worker Fixture"\nconfig/features=PackedStringArray("4.6")\n',
  );
  const manifestPath = path.join(root, "atlas.json");
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1.0",
      atlasId: "worker-atlas",
      frames: [
        { id: "frame-001", path: "source/frame.png", pivot: { x: 4, y: 7 } },
      ],
      animations: [
        {
          name: "idle",
          loopMode: "linear",
          frames: [
            { frameId: "frame-001", durationMs: 125 },
            { frameId: "frame-001", durationMs: 250 },
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
    }),
  );

  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const job = await runtime.submit({
    queue: "media",
    kind: "sprite.atlas.build",
    idempotencyKey: "worker-atlas",
    payload: {
      manifestPath,
      outputDirectory: output,
      godotProjectPath: root,
    },
    requiredCapabilities: ["atlas.pack", "godot.export"],
    leaseDurationMs: 10_000,
    timeoutMs: 60_000,
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "worker-fixture",
      capabilities: ["atlas.pack", "media.raster", "godot.export", "evidence.bundle"],
      queues: ["media"],
    },
    handlers: createBuiltinHandlers([root]),
  });
  const result = await worker.runOnce();
  assert.equal(result.succeeded, 1);
  const completed = await runtime.get(job.id);
  assert.equal(completed.state, "succeeded");
  assert.ok(completed.outputArtifacts.length >= 6);
  for (const artifactId of completed.outputArtifacts) {
    assert.equal((await artifacts.verify(artifactId)).contentValid, true);
  }
  await access(path.join(output, "worker-atlas.png"));
  await access(path.join(output, "worker-atlas.atlas.json"));
  await access(path.join(output, "worker-atlas.evidence.json"));
  await access(path.join(output, "worker-atlas.godot.json"));
  await access(path.join(output, "worker-atlas.spriteframes.import.gd"));
});
