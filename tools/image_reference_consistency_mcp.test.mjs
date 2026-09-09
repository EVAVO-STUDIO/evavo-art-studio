import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "../packages/media/node_modules/sharp/dist/index.mjs";

const serverPath = fileURLToPath(new URL("./image_reference_consistency_mcp.mjs", import.meta.url));

async function call(root, name, args = {}, { writes = false } = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      EVAVO_IMAGE_CONSISTENCY_ALLOWED_ROOTS: root,
      EVAVO_IMAGE_CONSISTENCY_ALLOW_WRITES: writes ? "true" : "false",
    },
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

async function solid(filePath, r, g, b) {
  await writeFile(filePath, await sharp({ create: { width: 64, height: 64, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer());
}

test("capabilities expose read-only review plus a disabled-by-default proof write boundary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-reference-capabilities-"));
  const response = await call(root, "evavo_image_reference_consistency_capabilities");
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.sourceMutationAllowed, false);
  assert.equal(response.structuredContent.maximumReferences, 32);
  assert.equal(response.structuredContent.maximumCandidates, 128);
  assert.equal(response.structuredContent.writesEnabled, false);
  assert.equal(response.structuredContent.proof.createOnly, true);
  assert.ok(response.structuredContent.tools.includes("evavo_create_image_reference_consistency_proof"));
  assert.ok(response.structuredContent.boundaries.some((item) => /does not detect AI authorship/.test(item)));
});

test("reviews one candidate against an approved local reference without returning image bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-reference-single-"));
  const referencePath = path.join(root, "approved.png");
  const candidatePath = path.join(root, "candidate.png");
  await solid(referencePath, 180, 40, 40);
  await solid(candidatePath, 185, 45, 45);

  const response = await call(root, "evavo_review_image_against_references", {
    candidatePath,
    references: [{ id: "approved", path: referencePath }],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.review.grade, "pass");
  assert.equal(response.structuredContent.review.decision, "consistent");
  assert.equal(response.structuredContent.bytesReturned, false);
  assert.equal(response.structuredContent.sourceModified, false);
  assert.equal("rgbHistogram" in response.structuredContent.review.candidate, false);
});

test("batch review ranks a strong palette outlier first", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-reference-batch-"));
  const referencePath = path.join(root, "approved.png");
  const closePath = path.join(root, "close.png");
  const differentPath = path.join(root, "different.png");
  await solid(referencePath, 180, 40, 40);
  await solid(closePath, 184, 44, 44);
  await solid(differentPath, 30, 40, 220);

  const response = await call(root, "evavo_review_image_batch_against_references", {
    candidates: [
      { id: "close", path: closePath },
      { id: "different", path: differentPath },
    ],
    references: [{ id: "approved", path: referencePath }],
  });
  assert.equal(response.isError, false);
  assert.deepEqual(response.structuredContent.reviewPriority, ["different", "close"]);
  assert.equal(response.structuredContent.results.find((item) => item.id === "different").review.grade, "warn");
  assert.equal(response.structuredContent.aiOriginDetection, "not-claimed");
});

test("visual consistency proof is write-gated, create-only and produces a diagnostic receipt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-reference-proof-"));
  const referencePath = path.join(root, "approved.png");
  const closePath = path.join(root, "close.png");
  const differentPath = path.join(root, "different.png");
  const outputPath = path.join(root, "consistency-proof.png");
  await solid(referencePath, 180, 40, 40);
  await solid(closePath, 184, 44, 44);
  await solid(differentPath, 30, 40, 220);
  const args = {
    candidates: [
      { id: "close", path: closePath },
      { id: "different", path: differentPath },
    ],
    references: [{ id: "approved", path: referencePath }],
    outputPath,
    tileSize: 96,
    columns: 2,
    confirmLocalWrite: true,
  };

  const denied = await call(root, "evavo_create_image_reference_consistency_proof", args, { writes: false });
  assert.equal(denied.isError, true);
  assert.match(denied.structuredContent.message, /writes are disabled/);

  const response = await call(root, "evavo_create_image_reference_consistency_proof", args, { writes: true });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.approvalState, "diagnostic-only");
  assert.deepEqual(response.structuredContent.evidence.displayedCandidateIds, ["different", "close"]);
  const metadata = await sharp(await readFile(outputPath)).metadata();
  assert.equal(metadata.format, "png");
  const receipt = JSON.parse(await readFile(`${outputPath}.receipt.json`, "utf8"));
  assert.equal(receipt.operation, "evavo-image-reference-consistency-proof");
  assert.equal(receipt.aiOriginDetection, "not-claimed");

  const repeated = await call(root, "evavo_create_image_reference_consistency_proof", args, { writes: true });
  assert.equal(repeated.isError, true);
  assert.match(repeated.structuredContent.message, /Create-only consistency proof target already exists/);
});

test("reference consistency paths remain confined to configured roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-reference-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "evavo-reference-outside-"));
  const candidatePath = path.join(root, "candidate.png");
  const referencePath = path.join(outside, "approved.png");
  await solid(candidatePath, 180, 40, 40);
  await solid(referencePath, 180, 40, 40);
  const response = await call(root, "evavo_review_image_against_references", {
    candidatePath,
    references: [{ id: "approved", path: referencePath }],
  });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /outside configured image reference consistency roots/);
});
