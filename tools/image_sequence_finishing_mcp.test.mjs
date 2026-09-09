import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "../packages/media/node_modules/sharp/lib/index.js";

const serverPath = fileURLToPath(new URL("./image_sequence_finishing_mcp.mjs", import.meta.url));

async function call(root, name, args = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, EVAVO_IMAGE_SEQUENCE_ALLOWED_ROOTS: root },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })}\n`);
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 0, Buffer.concat(stderr).toString("utf8"));
  return JSON.parse(Buffer.concat(stdout).toString("utf8").trim()).result;
}

async function patterned(filePath, offset = 0, width = 128, height = 128) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (x * 5 + y * 7 + offset) % 256;
      const i = (y * width + x) * 4;
      raw[i] = value;
      raw[i + 1] = (value * 3 + 40) % 256;
      raw[i + 2] = (value * 5 + 80) % 256;
      raw[i + 3] = 255;
    }
  }
  await writeFile(filePath, await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer());
}

test("capabilities expose read-only actionable sequence finishing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-sequence-capabilities-"));
  const response = await call(root, "evavo_image_sequence_finishing_capabilities");
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.maximumFrames, 128);
  assert.equal(response.structuredContent.maximumApprovedReferences, 32);
  assert.equal(response.structuredContent.sourceMutationAllowed, false);
  assert.ok(response.structuredContent.combines.includes("per-frame finishing disposition and repair routing"));
  assert.ok(response.structuredContent.boundaries.some((item) => /intentional holds/.test(item)));
  assert.ok(response.structuredContent.boundaries.some((item) => /image-origin detection is not claimed/.test(item)));
});

test("sequence review combines per-frame decisions with technical continuity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-sequence-review-"));
  const referencePath = path.join(root, "approved.png");
  const f1 = path.join(root, "f1.png");
  const f2 = path.join(root, "f2.png");
  const f3 = path.join(root, "f3.png");
  await patterned(referencePath, 0);
  await patterned(f1, 1);
  await patterned(f2, 2);
  await patterned(f3, 3);

  const response = await call(root, "evavo_review_image_sequence_finishing", {
    profile: "cel-animation-frame",
    frames: [
      { id: "f1", path: f1, durationMs: 83 },
      { id: "f2", path: f2, durationMs: 83 },
      { id: "f3", path: f3, durationMs: 83 },
    ],
    approvedReferences: [{ id: "approved", path: referencePath }],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.frameCount, 3);
  assert.equal(response.structuredContent.referenceCount, 1);
  assert.equal(response.structuredContent.frames.length, 3);
  assert.equal(response.structuredContent.neighbors.length, 2);
  assert.equal(response.structuredContent.reviewPriority.length, 3);
  assert.equal(response.structuredContent.visualReviewRequired, true);
  assert.equal(response.structuredContent.automaticPromotionAllowed, false);
  assert.equal(response.structuredContent.sourcesModified, false);
  assert.equal(response.structuredContent.bytesReturned, false);
});

test("sequence review flags canvas drift and preserves per-frame semantic repair", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-sequence-outlier-"));
  const f1 = path.join(root, "f1.png");
  const f2 = path.join(root, "f2.png");
  const f3 = path.join(root, "f3.png");
  await patterned(f1, 1, 128, 128);
  await patterned(f2, 2, 160, 128);
  await patterned(f3, 3, 128, 128);

  const response = await call(root, "evavo_review_image_sequence_finishing", {
    profile: "cel-animation-frame",
    frames: [
      { id: "f1", path: f1 },
      { id: "bad", path: f2, visualFindings: ["identity-drift"] },
      { id: "f3", path: f3 },
    ],
  });
  assert.equal(response.isError, false);
  const bad = response.structuredContent.frames.find((item) => item.id === "bad");
  assert.ok(bad.flags.includes("canvas-size-outlier"));
  assert.equal(bad.packet.disposition, "semantic-repair");
  assert.equal(bad.packet.repairDecision.requiresReference, true);
  assert.equal(response.structuredContent.reviewPriority[0], "bad");
  assert.notEqual(response.structuredContent.sequenceDecision, "pass-to-visual-review");
});

test("identical neighboring frames are surfaced as possible holds rather than auto-rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-sequence-hold-"));
  const held = path.join(root, "held.png");
  await patterned(held, 5);
  const response = await call(root, "evavo_review_image_sequence_finishing", {
    profile: "cel-animation-frame",
    frames: [
      { id: "hold-a", path: held, durationMs: 100 },
      { id: "hold-b", path: held, durationMs: 100 },
    ],
  });
  assert.equal(response.isError, false);
  assert.ok(response.structuredContent.neighbors[0].flags.includes("exact-or-effectively-duplicate-neighbor"));
  assert.ok(response.structuredContent.setWarnings.some((warning) => /intentional animation holds/.test(warning)));
  assert.notEqual(response.structuredContent.sequenceDecision, "reject");
});

test("sequence and reference paths remain confined to configured roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-sequence-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "evavo-sequence-outside-"));
  const f1 = path.join(root, "f1.png");
  const f2 = path.join(outside, "f2.png");
  await patterned(f1, 1);
  await patterned(f2, 2);
  const response = await call(root, "evavo_review_image_sequence_finishing", {
    frames: [
      { id: "f1", path: f1 },
      { id: "f2", path: f2 },
    ],
  });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /outside configured image sequence finishing roots/);
});
