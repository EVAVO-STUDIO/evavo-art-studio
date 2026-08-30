import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { compileTileMapCandidateBoundaryQa } from "../dist/tile-map-candidate-boundary-qa.js";

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

async function tile({
  left = [30, 100, 50, 255],
  right = left,
  top = [30, 100, 50, 255],
  bottom = top,
  interior = [55, 145, 75, 255],
  clearLeft = false,
} = {}) {
  const width = 16;
  const height = 16;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      let colour = interior;
      if (y === 0) colour = top;
      else if (y === height - 1) colour = bottom;
      else if (x === 0) colour = clearLeft ? [0, 0, 0, 0] : left;
      else if (x === width - 1) colour = right;
      rgba[offset] = colour[0];
      rgba[offset + 1] = colour[1];
      rgba[offset + 2] = colour[2];
      rgba[offset + 3] = colour[3];
    }
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function fixture({ mode = "seamless-pass" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-boundary-"));
  const candidateRoot = path.join(root, "provider-results");
  await mkdir(path.join(candidateRoot, "candidates", "family"), { recursive: true });

  let first;
  let second;
  let topology;
  if (mode === "seamless-fail") {
    first = await tile({
      left: [220, 30, 30, 255],
      right: [220, 30, 30, 255],
      top: [40, 100, 55, 255],
      bottom: [40, 100, 55, 255],
      interior: [65, 135, 70, 255],
    });
    second = await tile({
      left: [20, 20, 220, 255],
      right: [20, 20, 220, 255],
      top: [40, 100, 55, 255],
      bottom: [40, 100, 55, 255],
      interior: [85, 120, 65, 255],
    });
    topology = { continuous_material: true, seamless_edges: true, edge_signatures: [] };
  } else if (mode === "topology-fail") {
    first = await tile({ interior: [60, 135, 70, 255] });
    second = await tile({ clearLeft: true, interior: [90, 110, 55, 255] });
    topology = { continuous_material: false, seamless_edges: false, edge_signatures: ["ew"] };
  } else {
    first = await tile({ interior: [60, 135, 70, 255] });
    second = await tile({ interior: [95, 105, 55, 255] });
    topology = { continuous_material: true, seamless_edges: true, edge_signatures: [] };
  }

  const candidates = [];
  for (const [index, bytes] of [first, second].entries()) {
    const relative = `candidates/family/${String(index + 1).padStart(2, "0")}.png`;
    await writeFile(path.join(candidateRoot, ...relative.split("/")), bytes);
    candidates.push({
      candidate_id: `candidate-${index + 1}`,
      task_id: "task-family",
      visual_family: "test:terrain:family",
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

  const sourcePackage = {
    schema_version: 1,
    source_map_fingerprint: "1".repeat(64),
    map_id: "map",
    projection: "orthogonal",
    tasks: [
      {
        task_id: "task-family",
        visual_family: "test:terrain:family",
        task_kind: "tile-family",
        dimensions: { width: 16, height: 16 },
        required_approved_variants: 2,
        alpha_required: mode === "topology-fail",
        topology,
      },
    ],
    status: "ready-for-candidate-authoring",
    package_fingerprint: "2".repeat(64),
  };
  const packagePath = path.join(root, "package.json");
  await writeFile(packagePath, JSON.stringify(sourcePackage));

  const review = {
    schema_version: 1,
    source_package_fingerprint: "2".repeat(64),
    source_provider_batch_fingerprint: "3".repeat(64),
    source_execution_sha256: "4".repeat(64),
    source_map_fingerprint: "1".repeat(64),
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
    source_package_fingerprint: "2".repeat(64),
    source_review_fingerprint: "5".repeat(64),
    source_provider_batch_fingerprint: "3".repeat(64),
    source_execution_sha256: "4".repeat(64),
    source_map_fingerprint: "1".repeat(64),
    map_id: "map",
    projection: "orthogonal",
    candidates: candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      task_id: candidate.task_id,
      visual_family: candidate.visual_family,
      technically_clear: true,
      findings: [],
      metrics: {},
    })),
    families: [],
    authority: {},
    status: "passed",
  };
  const qa = { ...qaBase, qa_fingerprint: fingerprint(qaBase) };
  const qaPath = path.join(root, "qa.json");
  await writeFile(qaPath, JSON.stringify(qa));
  return { packagePath, reviewPath, qaPath, candidateRoot, candidates };
}

test("pairwise boundary QA accepts stable seamless borders with useful interior variation", async () => {
  const input = await fixture();
  const result = await compileTileMapCandidateBoundaryQa(
    input.packagePath,
    input.reviewPath,
    input.qaPath,
  );
  assert.equal(result.status, "passed");
  assert.equal(result.summary.errors, 0);
  assert.equal(result.families[0].seamless_material, true);
  assert.ok(result.families[0].cross_edge_comparisons.length >= 4);
  assert.equal(result.authority.creative_approval, false);
});

test("mixed variants with incompatible seamless borders are blocked", async () => {
  const input = await fixture({ mode: "seamless-fail" });
  const result = await compileTileMapCandidateBoundaryQa(
    input.packagePath,
    input.reviewPath,
    input.qaPath,
  );
  assert.equal(result.status, "blocked");
  assert.ok(
    result.families[0].findings.some(
      (finding) => finding.code === "TILE_MAP_BOUNDARY_SEAM_PAIR",
    ),
  );
});

test("required topology edge alpha drift is blocked", async () => {
  const input = await fixture({ mode: "topology-fail" });
  const result = await compileTileMapCandidateBoundaryQa(
    input.packagePath,
    input.reviewPath,
    input.qaPath,
  );
  assert.equal(result.status, "blocked");
  assert.ok(
    result.families[0].findings.some(
      (finding) =>
        finding.code === "TILE_MAP_BOUNDARY_TOPOLOGY_DRIFT" ||
        finding.code === "TILE_MAP_BOUNDARY_VARIANT_EDGE_DRIFT",
    ),
  );
});

test("candidate byte drift after base QA invalidates boundary QA", async () => {
  const input = await fixture();
  const target = path.join(
    input.candidateRoot,
    ...input.candidates[0].path.split("/"),
  );
  await writeFile(target, Buffer.from("tampered"));
  await assert.rejects(
    () =>
      compileTileMapCandidateBoundaryQa(
        input.packagePath,
        input.reviewPath,
        input.qaPath,
      ),
    /candidate bytes changed/u,
  );
});
