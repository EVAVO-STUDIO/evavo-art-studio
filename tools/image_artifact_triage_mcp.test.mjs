import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "../packages/media/node_modules/sharp/lib/index.js";

const serverPath = fileURLToPath(new URL("./image_artifact_triage_mcp.mjs", import.meta.url));

async function call(root, name, args = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, EVAVO_IMAGE_ARTIFACT_ALLOWED_ROOTS: root },
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

async function repeatingImage(filePath) {
  const width = 96;
  const height = 96;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const localX = x % 8;
      const localY = y % 8;
      const value = ((localX < 4) !== (localY < 4)) ? 220 : 35;
      const i = (y * width + x) * 4;
      raw[i] = value;
      raw[i + 1] = Math.min(255, value + 15);
      raw[i + 2] = Math.max(0, value - 10);
      raw[i + 3] = 255;
    }
  }
  await writeFile(filePath, await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer());
}

test("artifact triage capabilities explicitly reject AI-origin inference", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-artifact-capabilities-"));
  const response = await call(root, "evavo_image_artifact_triage_capabilities");
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.aiOriginDetection, "not claimed");
  assert.equal(response.structuredContent.sourceMutationAllowed, false);
  assert.ok(response.structuredContent.signals.includes("repeated-nontrivial-local-patterns"));
  assert.ok(response.structuredContent.semanticOnlyChecks.includes("anatomy and hands"));
});

test("artifact triage exposes generated-detail repetition as advisory evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-artifact-repeat-"));
  const inputPath = path.join(root, "repeating.png");
  await repeatingImage(inputPath);
  const response = await call(root, "evavo_review_image_artifact_risk", {
    inputPath,
    profile: "illustration",
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.sourceModified, false);
  assert.equal(response.structuredContent.bytesReturned, false);
  assert.equal(response.structuredContent.generatedDetailRisk.repeatedDetailRisk, true);
  assert.equal(response.structuredContent.generatedDetailRisk.advisoryOnly, true);
  assert.equal(response.structuredContent.generatedDetailRisk.aiOriginDetection, "not-claimed");
  assert.equal(response.structuredContent.originAssessment.aiGenerated, "not-determined");
  assert.match(response.structuredContent.originAssessment.reason, /cannot reliably prove authorship/);
});

test("texture profile suppresses repetition as an automatic generated-detail warning", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-artifact-texture-"));
  const inputPath = path.join(root, "tile.png");
  await repeatingImage(inputPath);
  const response = await call(root, "evavo_review_image_artifact_risk", {
    inputPath,
    profile: "texture",
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.generatedDetailRisk.repetitionSuppressedForProfile, true);
  assert.equal(response.structuredContent.generatedDetailRisk.repeatedDetailRisk, false);
});

test("artifact triage paths remain inside configured roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-artifact-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "evavo-artifact-outside-"));
  const inputPath = path.join(outside, "image.png");
  await repeatingImage(inputPath);
  const response = await call(root, "evavo_review_image_artifact_risk", { inputPath });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /outside configured image artifact triage roots/);
});
