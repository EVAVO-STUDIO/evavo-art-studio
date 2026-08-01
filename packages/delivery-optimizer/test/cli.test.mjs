import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

const cli = new URL("../dist/cli.js", import.meta.url);

function run(arguments_) {
  return spawnSync(process.execPath, [cli.pathname, ...arguments_], {
    encoding: "utf8",
    windowsHide: true,
  });
}

test("CLI lists the governed delivery profiles as JSON", () => {
  const result = run(["profiles"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema, "evavo.art-delivery-profile-catalog.v1");
  assert.ok(
    payload.profiles.some(
      (profile) => profile.id === "retro-scene-720p" && profile.maxHeight === 720,
    ),
  );
});

test("CLI image dry-run performs no write", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-cli-"));
  try {
    const inputPath = path.join(root, "portrait.png");
    const input = await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    await writeFile(inputPath, input);
    const result = run([
      "image",
      "--input",
      inputPath,
      "--profile",
      "retro-dialogue-portrait-384",
      "--background",
      "preserve",
      "--dry-run",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, "dry-run-ready");
    assert.equal(payload.mutationPerformed, false);
    assert.equal(payload.evidence.prepared.height, 384);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI rejects an ambiguous mutation mode", () => {
  const result = run([
    "image",
    "--input",
    "missing.png",
    "--profile",
    "retro-ui-icon-256",
    "--background",
    "black",
    "--dry-run",
    "--apply",
  ]);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.error.code, "DELIVERY_CLI_MODE_INVALID");
});
