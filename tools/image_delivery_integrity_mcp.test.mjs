import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "../packages/media/node_modules/sharp/lib/index.js";

const serverPath = fileURLToPath(new URL("./image_delivery_integrity_mcp.mjs", import.meta.url));

async function call(root, name, args = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, EVAVO_IMAGE_DELIVERY_ALLOWED_ROOTS: root },
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

async function makePng(filePath, { width = 256, height = 256, alpha = 1 } = {}) {
  await writeFile(filePath, await sharp({
    create: { width, height, channels: 4, background: { r: 120, g: 80, b: 40, alpha } },
  }).png().toBuffer());
}

test("capabilities expose bounded read-only delivery preflight", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-capabilities-"));
  const response = await call(root, "evavo_image_delivery_integrity_capabilities");
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.sourceMutationAllowed, false);
  assert.equal(response.structuredContent.bytesReturned, false);
  assert.equal(response.structuredContent.maximumBatchSize, 128);
  assert.ok(response.structuredContent.targets.includes("game-data-map"));
  assert.ok(response.structuredContent.checks.includes("effective-print-dpi-when-physical-size-is-known"));
  assert.ok(response.structuredContent.checks.includes("encoded-byte-budget"));
});

test("single review catches alpha-incompatible JPEG intent without changing the source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-single-"));
  const inputPath = path.join(root, "alpha.png");
  await makePng(inputPath, { alpha: 0.5 });
  const response = await call(root, "evavo_review_image_delivery_integrity", {
    inputPath,
    target: "web",
    intendedFormat: "jpeg",
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.sourceModified, false);
  assert.equal(response.structuredContent.bytesReturned, false);
  assert.equal(response.structuredContent.evidence.grade, "fail");
  assert.ok(response.structuredContent.evidence.blockers.includes("jpeg-delivery-cannot-preserve-alpha"));
  assert.ok(response.structuredContent.evidence.blockers.some((blocker) => blocker.startsWith("encoded-format-does-not-match-intent:")));
});

test("single review enforces encoded byte budgets against the actual file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-byte-budget-"));
  const inputPath = path.join(root, "candidate.png");
  await makePng(inputPath, { width: 512, height: 512 });
  const actualBytes = (await readFile(inputPath)).length;
  const response = await call(root, "evavo_review_image_delivery_integrity", {
    inputPath,
    target: "web",
    maximumBytes: Math.max(1, actualBytes - 1),
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.evidence.encodedBytes, actualBytes);
  assert.equal(response.structuredContent.evidence.grade, "fail");
  assert.ok(response.structuredContent.evidence.blockers.some((blocker) => blocker.startsWith("encoded-byte-budget-exceeded:")));
});

test("batch review ranks failures first and supports per-image print dimensions and byte budgets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-batch-"));
  const goodPath = path.join(root, "good.png");
  const lowDpiPath = path.join(root, "low-dpi.png");
  await makePng(goodPath, { width: 3000, height: 3000 });
  await makePng(lowDpiPath, { width: 1000, height: 1000 });
  const goodBytes = (await readFile(goodPath)).length;

  const response = await call(root, "evavo_review_image_delivery_batch", {
    target: "print",
    images: [
      { id: "good", path: goodPath, outputWidthMm: 200, outputHeightMm: 200, maximumBytes: goodBytes + 1000 },
      { id: "low", path: lowDpiPath, outputWidthMm: 254, outputHeightMm: 254 },
    ],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.itemCount, 2);
  assert.equal(response.structuredContent.summary.fail, 1);
  assert.equal(response.structuredContent.reviewPriority[0], "low");
  assert.equal(response.structuredContent.sourcesModified, false);
  const good = response.structuredContent.items.find((item) => item.id === "good");
  assert.equal(good.encodedBytes, goodBytes);
  const low = response.structuredContent.items.find((item) => item.id === "low");
  assert.ok(low.blockers.some((blocker) => blocker.startsWith("print-effective-dpi-below-minimum:")));
});

test("delivery paths stay confined to configured roots and duplicate batch ids fail closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "evavo-delivery-outside-"));
  const insidePath = path.join(root, "inside.png");
  const outsidePath = path.join(outside, "outside.png");
  await makePng(insidePath);
  await makePng(outsidePath);

  const escaped = await call(root, "evavo_review_image_delivery_integrity", {
    inputPath: outsidePath,
    target: "web",
  });
  assert.equal(escaped.isError, true);
  assert.match(escaped.structuredContent.message, /outside configured image delivery integrity roots/);

  const duplicate = await call(root, "evavo_review_image_delivery_batch", {
    target: "web",
    images: [
      { id: "same", path: insidePath },
      { id: "same", path: insidePath },
    ],
  });
  assert.equal(duplicate.isError, true);
  assert.match(duplicate.structuredContent.message, /Duplicate image id/);
});
