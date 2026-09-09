import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "../packages/media/node_modules/sharp/lib/index.js";

const serverPath = fileURLToPath(new URL("./image_finalization_mcp.mjs", import.meta.url));

async function call(root, name, args = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, EVAVO_IMAGE_FINALIZATION_ALLOWED_ROOTS: root },
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

async function detailedPng(filePath, { offset = 0, alpha = 1 } = {}) {
  const width = 192;
  const height = 128;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const value = (x * 17 + y * 31 + ((x * y + offset) % 47)) % 256;
      raw[i] = value;
      raw[i + 1] = (value * 3 + x * 5 + offset) % 256;
      raw[i + 2] = (value * 7 + y * 3 + offset) % 256;
      raw[i + 3] = Math.round(alpha * 255);
    }
  }
  await writeFile(filePath, await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer());
}

test("capabilities expose read-only final admission rather than approval authority", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finalization-capabilities-"));
  const response = await call(root, "evavo_image_finalization_capabilities");
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.guarantees.writesFiles, false);
  assert.equal(response.structuredContent.guarantees.automaticPromotionAllowed, false);
  assert.equal(response.structuredContent.guarantees.readyMeansReadyForApprovalReviewNotApproved, true);
  assert.ok(response.structuredContent.decisions.includes("ready-for-approval-review"));
});

test("clean web candidate reaches approval review without automatic promotion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finalization-clean-"));
  const inputPath = path.join(root, "candidate.png");
  await detailedPng(inputPath);
  const response = await call(root, "evavo_review_image_finalization", {
    inputPath,
    profile: "illustration",
    target: "web",
    intendedFormat: "png",
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.decision, "ready-for-approval-review");
  assert.equal(response.structuredContent.delivery.grade, "pass");
  assert.equal(response.structuredContent.automaticPromotionAllowed, false);
  assert.equal(response.structuredContent.sourceModified, false);
  assert.equal(response.structuredContent.bytesReturned, false);
});

test("semantic findings and delivery blockers remain distinct finalization failures", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finalization-blocked-"));
  const semanticPath = path.join(root, "semantic.png");
  const alphaPath = path.join(root, "alpha.png");
  await detailedPng(semanticPath);
  await detailedPng(alphaPath, { alpha: 0.5 });

  const semantic = await call(root, "evavo_review_image_finalization", {
    inputPath: semanticPath,
    profile: "illustration",
    target: "web",
    intendedFormat: "png",
    visualFindings: ["broken-anatomy"],
  });
  assert.equal(semantic.isError, false);
  assert.equal(semantic.structuredContent.decision, "needs-image-finishing");
  assert.equal(semantic.structuredContent.finishing.disposition, "semantic-repair");
  assert.ok(semantic.structuredContent.recommendedNextTools.includes("governed-provider-edit-or-inpaint"));

  const delivery = await call(root, "evavo_review_image_finalization", {
    inputPath: alphaPath,
    profile: "illustration",
    target: "web",
    intendedFormat: "jpeg",
  });
  assert.equal(delivery.isError, false);
  assert.equal(delivery.structuredContent.decision, "blocked");
  assert.ok(delivery.structuredContent.blockers.some((item) => item.includes("jpeg-delivery-cannot-preserve-alpha")));
  assert.ok(delivery.structuredContent.recommendedNextTools.includes("create-deliberate-delivery-derivative"));
});

test("approved reference paths remain confined to finalization roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finalization-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "evavo-finalization-outside-"));
  const inputPath = path.join(root, "candidate.png");
  const referencePath = path.join(outside, "approved.png");
  await detailedPng(inputPath);
  await detailedPng(referencePath);
  const response = await call(root, "evavo_review_image_finalization", {
    inputPath,
    target: "web",
    approvedReferences: [{ id: "approved", path: referencePath }],
  });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /outside configured image finalization roots/);
});
