import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compileTileMapProviderRuntimeBatch } from "../dist/tile-map-provider-batch.js";

async function fixture({ alphaRequired = true, providerAuthority = "intermediate-only" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-provider-"));
  const batch = {
    schema_version: 1,
    source_package_sha256: "1".repeat(64),
    source_package_fingerprint: "2".repeat(64),
    source_map_fingerprint: "3".repeat(64),
    map_id: "transport:first-slice",
    consumer_adapter: "transport-empire",
    projection: "isometric",
    jobs: [
      {
        candidate_id: "tile-map-candidate-0123456789abcdefabcd",
        task_id: "tile-map-tile-rail-ew",
        visual_family: "transport:rail:ew",
        task_kind: "tile-family",
        candidate_index: 0,
        projection: "isometric",
        dimensions: { width: 64, height: 32 },
        alpha_required: alphaRequired,
        semantic_source_ids: ["transport:rail:ew"],
        immutable_semantic_rules: [
          "Rail topology is simulation-owned.",
          "Preserve east-west edge signature.",
        ],
        creative_direction: ["Late-1990s transport-management pixel art."],
        topology: {
          terrains: ["rail"],
          edge_signatures: ["ew"],
          continuous_material: false,
          seamless_edges: false,
        },
        feature_kind: null,
        output_path: "candidates/transport-rail-ew/01.png",
        provider_authority: providerAuthority,
      },
    ],
    authority: {
      semantic_authority: "tile-map-studio",
      creative_authority: "art-studio",
      provider_authority: "candidate-generation-only",
    },
    status: "ready-for-provider-candidates",
    batch_fingerprint: "4".repeat(64),
  };
  const input = path.join(root, "candidate-batch.json");
  await writeFile(input, JSON.stringify(batch));
  return input;
}

test("compiles Tile Map candidate into canonical Art Studio provider runtime job", async () => {
  const input = await fixture();
  const result = await compileTileMapProviderRuntimeBatch(input);
  assert.equal(result.status, "ready-for-provider-runtime");
  assert.equal(result.source_map_fingerprint, "3".repeat(64));
  assert.equal(result.jobs.length, 1);
  const job = result.jobs[0];
  assert.match(job.request_sha256, /^[0-9a-f]{64}$/u);
  assert.match(job.prompt_sha256, /^[0-9a-f]{64}$/u);
  assert.match(job.runtime_job_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(job.runtime_job.queue, "provider");
  assert.equal(job.runtime_job.kind, "art.candidate.generate");
  assert.equal(job.runtime_job.idempotencyKey, "provider:tile-map-candidate-0123456789abcdefabcd");
  assert.equal(job.runtime_job.payload.target.width, 64);
  assert.equal(job.runtime_job.payload.target.height, 32);
  assert.equal(job.runtime_job.payload.background.strategy, "native-alpha");
  assert.equal(job.runtime_job.payload.selection.requireSeed, true);
  assert.equal(job.runtime_job.payload.metadata.sourceMapFingerprint, "3".repeat(64));
  assert.equal(job.runtime_job.payload.metadata.approvalAuthority, false);
  assert.deepEqual(job.runtime_job.payload.metadata.immutableSemanticRules, [
    "Rail topology is simulation-owned.",
    "Preserve east-west edge signature.",
  ]);
});

test("non-alpha family uses provider-auto rather than implicit chroma key", async () => {
  const input = await fixture({ alphaRequired: false });
  const result = await compileTileMapProviderRuntimeBatch(input);
  assert.equal(result.jobs[0].runtime_job.payload.background.strategy, "provider-auto");
  assert.equal(result.jobs[0].runtime_job.payload.target.transparency, "preferred");
});

test("provider authority cannot be weakened before runtime compilation", async () => {
  const input = await fixture({ providerAuthority: "approved" });
  await assert.rejects(
    () => compileTileMapProviderRuntimeBatch(input),
    /provider_authority must remain intermediate-only/u,
  );
});
