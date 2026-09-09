import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "../packages/media/node_modules/sharp/dist/index.mjs";

const serverPath = fileURLToPath(new URL("./image_finishing_packet_mcp.mjs", import.meta.url));

async function call(root, name, args = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, EVAVO_IMAGE_FINISHING_PACKET_ALLOWED_ROOTS: root },
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

async function patterned(filePath, offset = 0) {
  const width = 128;
  const height = 128;
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

test("capabilities expose single and batch read-only finishing decisions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finishing-packet-capabilities-"));
  const response = await call(root, "evavo_image_finishing_packet_capabilities");
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.guarantees.sourceMutationAllowed, false);
  assert.equal(response.structuredContent.guarantees.writesFiles, false);
  assert.equal(response.structuredContent.guarantees.automaticPromotionAllowed, false);
  assert.equal(response.structuredContent.guarantees.claimsAiOriginDetection, false);
  assert.equal(response.structuredContent.maximumBatchSize, 128);
  assert.equal(response.structuredContent.batchReferenceModelShared, true);
  assert.equal(response.structuredContent.batchResponsesCompactByDefault, true);
  assert.ok(response.structuredContent.tools.includes("evavo_review_image_finishing_batch"));
  assert.ok(response.structuredContent.combines.includes("generated-detail repetition and detail-density triage"));
});

test("packet combines candidate review with approved reference evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finishing-packet-"));
  const candidatePath = path.join(root, "candidate.png");
  const referencePath = path.join(root, "approved.png");
  await patterned(candidatePath, 0);
  await patterned(referencePath, 2);
  const response = await call(root, "evavo_review_image_finishing_packet", {
    inputPath: candidatePath,
    profile: "illustration",
    approvedReferences: [{ id: "approved", path: referencePath }],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.sourceModified, false);
  assert.equal(response.structuredContent.bytesReturned, false);
  assert.equal(response.structuredContent.packet.automaticPromotionAllowed, false);
  assert.ok(response.structuredContent.packet.referenceConsistency);
  assert.equal(response.structuredContent.packet.referenceConsistency.referenceCount, 1);
  assert.ok(response.structuredContent.packet.recommendedNextTools.includes("human-visual-review"));
});

test("semantic findings become a semantic repair packet rather than a filter suggestion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finishing-semantic-"));
  const candidatePath = path.join(root, "candidate.png");
  const referencePath = path.join(root, "approved.png");
  await patterned(candidatePath, 0);
  await patterned(referencePath, 0);
  const response = await call(root, "evavo_review_image_finishing_packet", {
    inputPath: candidatePath,
    approvedReferences: [{ id: "approved", path: referencePath }],
    visualFindings: ["broken-anatomy", "identity-drift"],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.packet.disposition, "semantic-repair");
  assert.equal(response.structuredContent.packet.repairDecision.requiresMask, true);
  assert.equal(response.structuredContent.packet.repairDecision.requiresReference, true);
  assert.ok(response.structuredContent.packet.recommendedNextTools.includes("governed-provider-edit-or-inpaint"));
});

test("batch review returns compact prioritized per-image packets with shared reference evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finishing-batch-"));
  const referencePath = path.join(root, "approved.png");
  const firstPath = path.join(root, "first.png");
  const secondPath = path.join(root, "second.png");
  await patterned(referencePath, 0);
  await patterned(firstPath, 2);
  await patterned(secondPath, 80);

  const response = await call(root, "evavo_review_image_finishing_batch", {
    profile: "illustration",
    candidates: [
      { id: "first", path: firstPath },
      { id: "second", path: secondPath, visualFindings: ["malformed-text"] },
    ],
    approvedReferences: [{ id: "approved", path: referencePath }],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.itemCount, 2);
  assert.equal(response.structuredContent.referenceCount, 1);
  assert.equal(response.structuredContent.referenceCoherence.state, "coherent");
  assert.equal(response.structuredContent.items.length, 2);
  assert.equal(response.structuredContent.reviewPriority.length, 2);
  assert.equal(response.structuredContent.automaticPromotionAllowed, false);
  assert.equal(response.structuredContent.sourcesModified, false);
  assert.equal(response.structuredContent.bytesReturned, false);
  const semantic = response.structuredContent.items.find((item) => item.id === "second");
  assert.equal(semantic.packet.disposition, "semantic-repair");
  assert.equal("defectReview" in semantic.packet.technicalReview, false);
  assert.ok(semantic.packet.technicalReview.quality.score >= 0);
});

test("batch review rejects duplicate candidate ids before returning ambiguous decisions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finishing-batch-duplicate-"));
  const imagePath = path.join(root, "image.png");
  await patterned(imagePath, 0);
  const response = await call(root, "evavo_review_image_finishing_batch", {
    candidates: [
      { id: "same", path: imagePath },
      { id: "same", path: imagePath },
    ],
  });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /Duplicate candidate id/);
});

test("packet reference paths remain confined to configured roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finishing-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "evavo-finishing-outside-"));
  const candidatePath = path.join(root, "candidate.png");
  const referencePath = path.join(outside, "approved.png");
  await patterned(candidatePath, 0);
  await patterned(referencePath, 0);
  const response = await call(root, "evavo_review_image_finishing_packet", {
    inputPath: candidatePath,
    approvedReferences: [{ id: "approved", path: referencePath }],
  });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /outside configured image finishing packet roots/);
});
