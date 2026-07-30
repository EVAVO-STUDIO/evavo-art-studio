import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = new URL("..", import.meta.url);
const artifact = (character) => `artifact_${character.repeat(64)}`;

function run(args) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

test("CLI prints the layered sprite family protocol", () => {
  const result = run(["sprite-family-protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.ok(body.layerRoles.includes("identity-core"));
  assert.ok(body.sourcePolicies.includes("linked-cel"));
  assert.ok(body.rules.some((entry) => entry.includes("unapproved composites")));
});

test("CLI compiles a family manifest into a complete durable job", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-family-cli-"));
  const input = path.join(root, "family.json");
  await writeFile(
    input,
    JSON.stringify({
      schemaVersion: "1.0",
      familyId: "cli-family",
      canvas: { width: 16, height: 16 },
      layerDefinitions: [
        {
          id: "body",
          role: "identity-core",
          sourcePolicy: "per-frame",
          required: true,
          contributesToComposite: true,
          contributesToIdentity: true,
          zIndex: 0,
        },
      ],
      frames: [
        {
          id: "idle-down-000",
          animation: "idle",
          direction: "down",
          frameIndex: 0,
          globalFrameIndex: 0,
          durationMs: 125,
          pivot: { x: 8, y: 12 },
          declaredCompositeArtifactId: artifact("2"),
          layers: [{ layerId: "body", artifactId: artifact("1") }],
        },
      ],
      policy: { identityReferenceFrameId: "idle-down-000" },
    }),
  );
  const result = run(["sprite-family-compile", "--input", input]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.runtimeJob.queue, "selection");
  assert.equal(body.runtimeJob.kind, "sprite.family.verify");
  assert.deepEqual(body.runtimeJob.inputArtifacts, [artifact("1"), artifact("2")]);
  assert.deepEqual(body.runtimeJob.requiredCapabilities, [
    "sprite.family.verify",
    "media.layer-compose",
    "selection.compare",
    "evidence.bundle",
  ]);
  assert.equal(body.manifestSha256.length, 64);
});
