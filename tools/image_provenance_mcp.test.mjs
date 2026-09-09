import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./image_provenance_mcp.mjs", import.meta.url));

async function call(root, name, args = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, EVAVO_IMAGE_PROVENANCE_ALLOWED_ROOTS: root },
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

async function fixture(root, name = "asset.bin") {
  const inputPath = path.join(root, name);
  const bytes = Buffer.from(`evavo-provenance:${name}`);
  await writeFile(inputPath, bytes);
  return { inputPath, sha256: createHash("sha256").update(bytes).digest("hex") };
}

test("provenance capabilities expose strict trust boundary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provenance-cap-"));
  const response = await call(root, "evavo_image_provenance_capabilities");
  assert.equal(response.isError, false);
  assert.deepEqual(response.structuredContent.packetStatuses, ["verified", "unverified", "absent", "invalid"]);
  assert.equal(response.structuredContent.trustBoundary.localSha256BindingPerformedByArtStudio, true);
  assert.equal(response.structuredContent.trustBoundary.externalCryptographicVerificationPerformedByThisTool, false);
  assert.equal(response.structuredContent.trustBoundary.pixelOriginDetectionClaimed, false);
  assert.equal(response.structuredContent.sourceMutationAllowed, false);
});

test("provenance review binds exact local bytes without inferring origin", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provenance-bind-"));
  const asset = await fixture(root);
  const response = await call(root, "evavo_review_image_provenance", {
    inputPath: asset.inputPath,
    evidence: [{ id: "candidate", kind: "source-binding", assetSha256: asset.sha256, relation: "candidate-review" }],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.status, "verified");
  assert.equal(response.structuredContent.asset.sha256, asset.sha256);
  assert.equal(response.structuredContent.originAssessment.aiGenerated, "not-determined");
  assert.equal(response.structuredContent.trustBoundary.externalCryptographicVerificationPerformedByThisTool, false);
  assert.equal(response.structuredContent.bytesReturned, false);
});

test("externally verified claim with wrong asset hash fails closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provenance-mismatch-"));
  const asset = await fixture(root);
  const otherSha = createHash("sha256").update(Buffer.from("other")).digest("hex");
  const response = await call(root, "evavo_review_image_provenance", {
    inputPath: asset.inputPath,
    evidence: [{
      id: "credential",
      kind: "content-credential",
      assetSha256: otherSha,
      verificationStatus: "verified",
      verifier: "c2pa-verifier",
      recordId: "manifest-1",
      reportedOrigin: "ai-generated",
    }],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.status, "invalid");
  assert.equal(response.structuredContent.summary.verifiedOriginClaims, 0);
});

test("verified external claim without verifier identity is rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provenance-verifier-"));
  const asset = await fixture(root);
  const response = await call(root, "evavo_review_image_provenance", {
    inputPath: asset.inputPath,
    evidence: [{
      id: "credential",
      kind: "content-credential",
      assetSha256: asset.sha256,
      verificationStatus: "verified",
      reportedOrigin: "human-authored",
    }],
  });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /without verifier and verification record id/);
});

test("existing enhancement manifest becomes hash-bound lineage but not authenticated origin", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provenance-enhancement-"));
  const asset = await fixture(root);
  const sourceSha = createHash("sha256").update(Buffer.from("source")).digest("hex");
  const response = await call(root, "evavo_review_image_provenance", {
    inputPath: asset.inputPath,
    evidence: [{
      id: "enhancement",
      kind: "evavo-record",
      record: {
        contract: "evavo.enhancement-art-review.v1",
        candidate_sha256: asset.sha256,
        source_sha256: sourceSha,
        learned_candidate: true,
      },
    }],
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.status, "verified");
  assert.equal(response.structuredContent.evidence[0].reportedOrigin, "machine-assisted");
  assert.equal(response.structuredContent.evidence[0].originClaimVerified, false);
  assert.equal(response.structuredContent.originAssessment.provenanceReportedOrigin, "not-determined");
});

test("provenance paths remain inside configured roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provenance-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "evavo-provenance-outside-"));
  const asset = await fixture(outside);
  const response = await call(root, "evavo_review_image_provenance", { inputPath: asset.inputPath });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /outside configured image provenance roots/);
});
