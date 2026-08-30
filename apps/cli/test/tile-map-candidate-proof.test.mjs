import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { renderTileMapCandidateProofs } from "../dist/tile-map-candidate-proof.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
};
const fingerprint = (value) => sha(Buffer.from(canonical(value), "utf8"));

async function fixture({ wrongReview = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-proof-"));
  const candidateRoot = path.join(root, "provider-results");
  const outputRoot = path.join(root, "proof");
  await mkdir(path.join(candidateRoot, "candidates", "grass"), { recursive: true });

  const candidates = [];
  for (let index = 0; index < 2; index += 1) {
    const bytes = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: {
          r: 40 + index * 40,
          g: 125,
          b: 68,
          alpha: index === 0 ? 0.8 : 1,
        },
      },
    })
      .png()
      .toBuffer();
    const relative = `candidates/grass/${String(index + 1).padStart(2, "0")}.png`;
    await writeFile(path.join(candidateRoot, ...relative.split("/")), bytes);
    candidates.push({
      candidate_id: `candidate-${index + 1}`,
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      path: relative,
      sha256: sha(bytes),
      bytes: bytes.length,
      width: 16,
      height: 16,
      has_alpha: true,
      structural_review: "pending",
      visual_review: "pending",
      creative_review: "pending",
      promotion_eligible: false,
    });
  }

  const review = {
    schema_version: 1,
    source_package_fingerprint: "1".repeat(64),
    source_provider_batch_fingerprint: "2".repeat(64),
    source_execution_sha256: "3".repeat(64),
    source_map_fingerprint: "4".repeat(64),
    candidate_root: candidateRoot,
    map_id: "map",
    projection: "orthogonal",
    candidates,
    status: "awaiting-review",
    review_fingerprint: "5".repeat(64),
  };
  const reviewPath = path.join(root, "review.json");
  await writeFile(reviewPath, JSON.stringify(review));

  const qaBase = {
    schema_version: 1,
    source_package_fingerprint: "1".repeat(64),
    source_review_fingerprint: wrongReview ? "6".repeat(64) : "5".repeat(64),
    source_provider_batch_fingerprint: "2".repeat(64),
    source_execution_sha256: "3".repeat(64),
    source_map_fingerprint: "4".repeat(64),
    map_id: "map",
    projection: "orthogonal",
    candidates: candidates.map((candidate, index) => ({
      candidate_id: candidate.candidate_id,
      task_id: candidate.task_id,
      visual_family: candidate.visual_family,
      technically_clear: index === 0,
      findings: [],
      metrics: {},
      creative_approval: false,
    })),
    families: [],
    authority: {
      semantic_authority: "tile-map-studio",
      automated_technical_qa: true,
      structural_review_decision: false,
      visual_review_decision: false,
      creative_approval: false,
      provider_execution: false,
      candidate_promotion: false,
    },
    status: "blocked",
  };
  const qa = { ...qaBase, qa_fingerprint: fingerprint(qaBase) };
  const qaPath = path.join(root, "qa.json");
  await writeFile(qaPath, JSON.stringify(qa));
  return { root, candidateRoot, outputRoot, reviewPath, qaPath, candidates };
}

test("renders content-addressed native and nearest-neighbour family proofs", async () => {
  const input = await fixture();
  const receipt = await renderTileMapCandidateProofs(
    input.reviewPath,
    input.qaPath,
    input.outputRoot,
  );
  assert.equal(receipt.status, "review-proof-only");
  assert.equal(receipt.authority.creative_approval, false);
  assert.equal(receipt.proof_files.length, 1);
  const proof = receipt.proof_files[0];
  assert.equal(proof.candidates.length, 2);
  assert.equal(proof.candidates[0].magnified.nearest_neighbour_scale, 8);
  assert.match(proof.sha256, /^[0-9a-f]{64}$/u);
  const proofBytes = await readFile(path.join(input.outputRoot, proof.file));
  assert.equal(sha(proofBytes), proof.sha256);
  const metadata = await sharp(proofBytes).metadata();
  assert.equal(metadata.width, proof.width);
  assert.equal(metadata.height, proof.height);
  const receiptBytes = await readFile(
    path.join(input.outputRoot, "candidate-proof.receipt.json"),
  );
  assert.ok(receiptBytes.length > 100);
});

test("proof renderer rejects QA from another review", async () => {
  const input = await fixture({ wrongReview: true });
  await assert.rejects(
    () => renderTileMapCandidateProofs(input.reviewPath, input.qaPath, input.outputRoot),
    /does not target the exact candidate review/u,
  );
});

test("proof renderer rejects candidate bytes changed after QA", async () => {
  const input = await fixture();
  const target = path.join(input.candidateRoot, ...input.candidates[0].path.split("/"));
  await writeFile(target, Buffer.from("tampered"));
  await assert.rejects(
    () => renderTileMapCandidateProofs(input.reviewPath, input.qaPath, input.outputRoot),
    /candidate bytes changed/u,
  );
});

test("proof output directory is create-only", async () => {
  const input = await fixture();
  await mkdir(input.outputRoot, { recursive: true });
  await writeFile(path.join(input.outputRoot, "existing.txt"), "do not overwrite");
  await assert.rejects(
    () => renderTileMapCandidateProofs(input.reviewPath, input.qaPath, input.outputRoot),
    /must be new or empty/u,
  );
});
