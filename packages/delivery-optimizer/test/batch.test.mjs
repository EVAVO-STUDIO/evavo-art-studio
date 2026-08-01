import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  DELIVERY_OPTIMIZER_SCHEMA,
  executeDeliveryBatch,
  validateDeliveryBatchManifest,
} from "../dist/index.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-batch-"));
  const sourceRoot = path.join(root, "source");
  const outputRoot = path.join(root, "output");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(sourceRoot));
  const source = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 256,
            height: 420,
            channels: 4,
            background: { r: 210, g: 210, b: 210, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
        left: 128,
        top: 46,
      },
    ])
    .png({ compressionLevel: 0 })
    .toBuffer();
  await writeFile(path.join(sourceRoot, "portrait.png"), source);
  const manifest = validateDeliveryBatchManifest({
    schema: DELIVERY_OPTIMIZER_SCHEMA,
    batchId: "test-batch",
    project: {
      id: "test-project",
      title: "Test project",
      engine: "Godot",
      engineVersion: "4.6.2",
      viewport: { width: 1280, height: 720 },
      rendering: "engraved-monochrome",
    },
    items: [
      {
        id: "portrait",
        sourcePath: "portrait.png",
        targetPath: "assets/art/portrait.png",
        sourceSha256: sha256(source),
        sourceBytes: source.length,
        profileId: "retro-dialogue-portrait-384",
        background: { mode: "preserve" },
      },
    ],
  });
  return { root, sourceRoot, outputRoot, manifest };
}

test("dry-run computes exact outputs without mutation", async () => {
  const current = await fixture();
  try {
    const receipt = await executeDeliveryBatch({
      manifest: current.manifest,
      sourceRoot: current.sourceRoot,
      outputRoot: current.outputRoot,
      apply: false,
    });
    assert.equal(receipt.mutationPerformed, false);
    assert.equal(receipt.items.length, 1);
    await assert.rejects(access(current.outputRoot));
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test("apply publishes one atomic create-only bundle with receipt", async () => {
  const current = await fixture();
  try {
    const receipt = await executeDeliveryBatch({
      manifest: current.manifest,
      sourceRoot: current.sourceRoot,
      outputRoot: current.outputRoot,
      apply: true,
    });
    assert.equal(receipt.mutationPerformed, true);
    const output = await readFile(
      path.join(current.outputRoot, "assets/art/portrait.png"),
    );
    const stored = JSON.parse(
      await readFile(
        path.join(current.outputRoot, "optimization-receipt.json"),
        "utf8",
      ),
    );
    assert.equal(sha256(output), receipt.items[0].outputSha256);
    assert.equal(stored.batchSha256, receipt.batchSha256);
    await assert.rejects(
      executeDeliveryBatch({
        manifest: current.manifest,
        sourceRoot: current.sourceRoot,
        outputRoot: current.outputRoot,
        apply: true,
      }),
      /already exists/i,
    );
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test("rejects case-insensitive target collisions", () => {
  const source = {
    id: "first",
    sourcePath: "one.png",
    targetPath: "assets/UI/Icon.png",
    sourceSha256: "a".repeat(64),
    sourceBytes: 1,
    profileId: "retro-ui-icon-256",
    background: { mode: "preserve" },
  };
  assert.throws(
    () =>
      validateDeliveryBatchManifest({
        schema: DELIVERY_OPTIMIZER_SCHEMA,
        batchId: "collision",
        project: { id: "test", title: "Test" },
        items: [
          source,
          {
            ...source,
            id: "second",
            sourcePath: "two.png",
            targetPath: "assets/ui/icon.png",
          },
        ],
      }),
    /collision/i,
  );
});
