import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { verifyTileMapCandidateProof } from "../dist/tile-map-candidate-proof-verify.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
};

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-proof-verify-"));
  const outputRoot = path.join(root, "proof");
  await mkdir(outputRoot);
  const sourcePackage = {
    package_fingerprint: "1".repeat(64),
    source_map_fingerprint: "2".repeat(64),
  };
  const review = {
    review_fingerprint: "3".repeat(64),
    source_map_fingerprint: "2".repeat(64),
  };
  const qaBody = {
    schema_version: 1,
    policy_version: "2026-08-30.1",
    source_map_fingerprint: "2".repeat(64),
    status: "passed",
  };
  const qa = {
    ...qaBody,
    qa_fingerprint: sha(Buffer.from(canonical(qaBody))),
  };
  const packagePath = path.join(root, "source-package.json");
  const reviewPath = path.join(root, "review.json");
  const qaPath = path.join(root, "technical-qa.json");
  await writeFile(packagePath, JSON.stringify(sourcePackage));
  await writeFile(reviewPath, JSON.stringify(review));
  await writeFile(qaPath, JSON.stringify(qa));

  const board = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 20, g: 30, b: 40, alpha: 1 },
    },
  }).png().toBuffer();
  const boardName = "family.proof.png";
  const boardPath = path.join(outputRoot, boardName);
  await writeFile(boardPath, board);

  const body = {
    schema_version: 1,
    source_package_path: packagePath,
    source_package_sha256: sha(Buffer.from(JSON.stringify(sourcePackage))),
    source_package_fingerprint: "1".repeat(64),
    source_review_path: reviewPath,
    source_review_sha256: sha(Buffer.from(JSON.stringify(review))),
    source_review_fingerprint: "3".repeat(64),
    source_technical_qa_path: qaPath,
    source_technical_qa_sha256: sha(Buffer.from(JSON.stringify(qa))),
    source_technical_qa_fingerprint: qa.qa_fingerprint,
    source_map_fingerprint: "2".repeat(64),
    map_id: "map",
    projection: "orthogonal",
    candidate_root: path.join(root, "candidate-root"),
    output_root: outputRoot,
    board_contract: {},
    artifacts: [{
      visual_family: "family",
      file: boardName,
      sha256: sha(board),
      bytes: board.length,
      width: 32,
      height: 32,
      candidates: [{ candidate_id: "candidate-1" }],
    }],
    authority: {
      creative_approval_authority: false,
      promotion_authority: false,
    },
    status: "ready-for-human-review",
  };
  const manifest = {
    ...body,
    proof_fingerprint: sha(Buffer.from(canonical(body))),
  };
  const manifestPath = path.join(outputRoot, "candidate-proof.manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { manifestPath, boardPath, outputRoot };
}

test("verifies exact source and proof-board evidence", async () => {
  const input = await fixture();
  const result = await verifyTileMapCandidateProof(input.manifestPath);
  assert.equal(result.status, "valid");
  assert.equal(result.family_boards, 1);
  assert.equal(result.candidates, 1);
  assert.match(result.aggregate_artifact_digest, /^[0-9a-f]{64}$/u);
});

test("detects changed proof-board bytes", async () => {
  const input = await fixture();
  await writeFile(input.boardPath, Buffer.from("tampered"));
  await assert.rejects(
    () => verifyTileMapCandidateProof(input.manifestPath),
    /proof board hash changed/u,
  );
});

test("detects unreceipted files in proof output", async () => {
  const input = await fixture();
  await writeFile(path.join(input.outputRoot, "unreceipted.txt"), "extra");
  await assert.rejects(
    () => verifyTileMapCandidateProof(input.manifestPath),
    /unreceipted entry/u,
  );
});
