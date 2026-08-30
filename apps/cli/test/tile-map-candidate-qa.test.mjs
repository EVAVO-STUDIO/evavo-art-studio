import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { compileTileMapCandidateQa } from "../dist/tile-map-candidate-qa.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");

function rgbaTile({
  width = 16,
  height = 16,
  border = [24, 112, 58, 255],
  interior = [40, 138, 72, 255],
  transparent = false,
  onePixelChange = false,
} = {}) {
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const edge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      const colour = transparent ? [0, 0, 0, 0] : edge ? border : interior;
      buffer[offset] = colour[0];
      buffer[offset + 1] = colour[1];
      buffer[offset + 2] = colour[2];
      buffer[offset + 3] = colour[3];
    }
  }
  if (onePixelChange && !transparent) {
    const offset = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
    buffer[offset] = Math.min(255, buffer[offset] + 1);
  }
  return sharp(buffer, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function fixture({ mode = "pass" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-candidate-qa-"));
  const candidateRoot = path.join(root, "provider-results");
  await mkdir(path.join(candidateRoot, "candidates", "grass"), { recursive: true });

  let first;
  let second;
  if (mode === "blank") {
    first = await rgbaTile({ transparent: true });
    second = await rgbaTile({ interior: [72, 102, 42, 255] });
  } else if (mode === "near-duplicate") {
    first = await rgbaTile();
    second = await rgbaTile({ onePixelChange: true });
  } else if (mode === "seam-failure") {
    first = await rgbaTile({ border: [220, 30, 30, 255] });
    const raw = Buffer.alloc(16 * 16 * 4);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const offset = (y * 16 + x) * 4;
        const colour = x === 0
          ? [230, 20, 20, 255]
          : x === 15
            ? [20, 20, 230, 255]
            : y === 0 || y === 15
              ? [40, 100, 55, 255]
              : [60, 145, 75, 255];
        raw[offset] = colour[0];
        raw[offset + 1] = colour[1];
        raw[offset + 2] = colour[2];
        raw[offset + 3] = colour[3];
      }
    }
    second = await sharp(raw, { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer();
  } else {
    first = await rgbaTile({ interior: [40, 138, 72, 255] });
    second = await rgbaTile({ interior: [90, 94, 42, 255] });
  }

  const candidateRows = [];
  for (const [index, bytes] of [first, second].entries()) {
    const relative = `candidates/grass/${String(index + 1).padStart(2, "0")}.png`;
    const absolute = path.join(candidateRoot, ...relative.split("/"));
    await writeFile(absolute, bytes);
    candidateRows.push({
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

  const packagePayload = {
    schema_version: 1,
    source_plan_sha256: "1".repeat(64),
    source_plan_fingerprint: "2".repeat(64),
    source_map_fingerprint: "3".repeat(64),
    map_id: "epochbound:bellweather:verdant",
    consumer_adapter: "epochbound",
    production_profile: "snes-topdown-rpg",
    projection: "orthogonal",
    tasks: [
      {
        task_id: "task-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        task_kind: "tile-family",
        projection: "orthogonal",
        dimensions: { width: 16, height: 16 },
        required_approved_variants: 2,
        candidate_count: 4,
        alpha_required: mode === "blank",
        topology: {
          continuous_material: true,
          seamless_edges: true,
          edge_signatures: [],
        },
      },
    ],
    authority: {},
    promotion_policy: {},
    status: "ready-for-candidate-authoring",
    package_fingerprint: "4".repeat(64),
  };
  const packagePath = path.join(root, "source-package.json");
  await writeFile(packagePath, JSON.stringify(packagePayload));

  const providerResults = {
    schema_version: 1,
    source_batch_fingerprint: "5".repeat(64),
    source_provider_batch_fingerprint: "6".repeat(64),
    source_execution_sha256: "7".repeat(64),
    source_map_fingerprint: "3".repeat(64),
    authority: {
      provider_output_authority: "intermediate-only",
      review_required: true,
      approval_authority: false,
    },
    candidates: candidateRows.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      path: candidate.path,
      sha256: candidate.sha256,
    })),
  };
  const resultsPath = path.join(candidateRoot, "provider-results.json");
  await writeFile(resultsPath, JSON.stringify(providerResults));
  const resultsBytes = await readFile(resultsPath);

  const reviewPayload = {
    schema_version: 1,
    source_batch_sha256: "8".repeat(64),
    source_batch_fingerprint: "5".repeat(64),
    source_package_fingerprint: "4".repeat(64),
    source_provider_batch_fingerprint: "6".repeat(64),
    source_execution_sha256: "7".repeat(64),
    source_map_fingerprint: "3".repeat(64),
    provider_results_path: resultsPath,
    provider_results_sha256: sha(resultsBytes),
    candidate_root: candidateRoot,
    map_id: "epochbound:bellweather:verdant",
    projection: "orthogonal",
    candidates: candidateRows,
    authority: {
      semantic_authority: "tile-map-studio",
      review_authority: "art-studio",
      provider_authority: "intermediate-only",
      execution_evidence_required: true,
    },
    status: "awaiting-review",
    review_fingerprint: "9".repeat(64),
  };
  const reviewPath = path.join(root, "review.json");
  await writeFile(reviewPath, JSON.stringify(reviewPayload));
  return { packagePath, reviewPath, resultsPath };
}

test("candidate QA passes technically sound distinct seamless tiles without granting approval", async () => {
  const input = await fixture();
  const report = await compileTileMapCandidateQa(input.packagePath, input.reviewPath);
  assert.equal(report.status, "passed");
  assert.equal(report.summary.candidate_errors, 0);
  assert.equal(report.summary.family_errors, 0);
  assert.equal(report.families[0].effective_visual_variants, 2);
  assert.equal(report.authority.creative_approval, false);
  assert.equal(report.candidates[0].creative_approval, false);
  assert.match(report.qa_fingerprint, /^[0-9a-f]{64}$/u);
});

test("seam mismatch blocks continuous material candidate", async () => {
  const input = await fixture({ mode: "seam-failure" });
  const report = await compileTileMapCandidateQa(input.packagePath, input.reviewPath);
  assert.equal(report.status, "blocked");
  assert.ok(
    report.candidates.some((candidate) =>
      candidate.findings.some((finding) => finding.code === "TILE_MAP_QA_SEAM_FAILURE"),
    ),
  );
});

test("transparent near-blank candidate is blocked", async () => {
  const input = await fixture({ mode: "blank" });
  const report = await compileTileMapCandidateQa(input.packagePath, input.reviewPath);
  assert.equal(report.status, "blocked");
  assert.ok(
    report.candidates.some((candidate) =>
      candidate.findings.some((finding) => finding.code === "TILE_MAP_QA_NEAR_BLANK"),
    ),
  );
});

test("near-identical candidates cannot satisfy required visual diversity", async () => {
  const input = await fixture({ mode: "near-duplicate" });
  const report = await compileTileMapCandidateQa(input.packagePath, input.reviewPath);
  assert.equal(report.status, "blocked");
  assert.equal(report.families[0].effective_visual_variants, 1);
  assert.ok(
    report.families[0].findings.some(
      (finding) => finding.code === "TILE_MAP_QA_EFFECTIVE_VARIANTS",
    ),
  );
});

test("retained provider-results tampering invalidates candidate QA", async () => {
  const input = await fixture();
  await writeFile(input.resultsPath, JSON.stringify({ tampered: true }));
  await assert.rejects(
    () => compileTileMapCandidateQa(input.packagePath, input.reviewPath),
    /retained provider-results bytes changed/u,
  );
});
