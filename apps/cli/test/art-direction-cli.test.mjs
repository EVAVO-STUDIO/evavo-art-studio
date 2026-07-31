import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = new URL("..", import.meta.url);

function run(args) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

test("CLI exposes governed art-direction presets and protocol", () => {
  const result = run(["art-direction-protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.protocolVersion, "2026-07-31.1");
  assert.ok(body.presets.some((entry) => entry.id === "isometric-rpg-1997"));
  assert.ok(
    body.outputProfiles.some(
      (entry) => entry.id === "godot-4.6.2-isometric-character",
    ),
  );
  assert.match(body.executionBoundary, /provider/i);
});

test("CLI compiles one deterministic isometric style contract and control job", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-art-direction-cli-"));
  const input = path.join(root, "art-direction.json");
  await writeFile(
    input,
    JSON.stringify({
      schemaVersion: "1.0",
      contractId: "cli-isometric-contract",
      presetId: "isometric-rpg-1997",
      project: {
        projectId: "cli-game",
        title: "CLI Game",
        engine: "Godot",
        engineVersion: "4.6.2",
        worldScale: { tileWidthPixels: 64, tileHeightPixels: 32 },
      },
      style: {
        references: [
          {
            id: "canonical",
            role: "identity",
            uri: "artifact:canonical",
            rights: "project-owned",
          },
        ],
      },
      asset: {
        assetId: "hero",
        family: "character",
        purpose: "Eight-direction hero idle.",
        dimensions: { width: 128, height: 128 },
        transparency: "required",
        animated: true,
        frameCount: 8,
        directionCount: 8,
        asymmetric: true,
        independentShadow: true,
        needsCollision: true,
      },
      outputProfileIds: ["godot-4.6.2-isometric-character"],
    }),
  );
  const result = run(["art-direction-compile", "--input", input]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.compiledContract.style.projection, "isometric-2:1");
  assert.equal(body.compiledContract.production.directionNames.length, 8);
  assert.equal(body.compiledJob.runtimeJob.kind, "art.direction.compile");
  assert.equal(body.compiledJob.runtimeJob.queue, "control");
  assert.deepEqual(body.compiledJob.runtimeJob.requiredCapabilities, [
    "art-direction.compile",
    "style.preset.resolve",
    "output-profile.compile",
    "evidence.bundle",
  ]);
});
