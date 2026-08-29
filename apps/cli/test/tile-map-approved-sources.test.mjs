import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compileApprovedSourcesManifest } from "../dist/tile-map-approved-sources.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");

async function fixture({ duplicate = false, wrongPackage = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-approved-"));
  const a = Buffer.from("approved-source-a");
  const b = duplicate ? a : Buffer.from("approved-source-b");
  await writeFile(path.join(root, "a.png"), a);
  await writeFile(path.join(root, "b.png"), b);
  const packagePayload = {
    schema_version: 1,
    source_plan_sha256: "a".repeat(64),
    source_plan_fingerprint: "b".repeat(64),
    map_id: "epochbound:bellweather:verdant",
    consumer_adapter: "epochbound",
    production_profile: "snes-topdown-rpg",
    projection: "orthogonal",
    tasks: [
      {
        task_id: "tile-map-tile-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        task_kind: "tile-family",
        projection: "orthogonal",
        dimensions: { width: 16, height: 16 },
        required_approved_variants: 2,
        candidate_count: 4,
        alpha_required: false,
        semantic_source_ids: ["grass"],
        immutable_semantic_rules: ["Preserve gameplay semantics."],
        creative_direction: ["SNES-era authored terrain."],
        topology: null,
        feature_kind: null,
        output_contract: {},
        gates: {},
      },
    ],
    authority: {},
    promotion_policy: {},
    status: "ready-for-candidate-authoring",
    package_fingerprint: "c".repeat(64),
  };
  const packagePath = path.join(root, "source-package.json");
  await writeFile(packagePath, JSON.stringify(packagePayload));
  const approval = {
    schema_version: 1,
    source_package_fingerprint: wrongPackage ? "d".repeat(64) : "c".repeat(64),
    creative_approval: {
      decision: "approved",
      approved_by: "EVAVO creative review",
      approved_at: "2026-08-30T00:00:00Z",
    },
    tasks: [
      {
        task_id: "tile-map-tile-grass",
        approved_sources: [
          { path: "a.png", sha256: sha(a) },
          { path: "b.png", sha256: sha(b) },
        ],
      },
    ],
  };
  const approvalPath = path.join(root, "approval.json");
  await writeFile(approvalPath, JSON.stringify(approval));
  return { packagePath, approvalPath, root };
}

test("exports only exact-hash creatively approved sources for Sprite Studio", async () => {
  const input = await fixture();
  const result = await compileApprovedSourcesManifest(input.packagePath, input.approvalPath);
  assert.equal(result.eligible_for_sprite_studio, true);
  assert.equal(result.authority.semantic_authority, "tile-map-studio");
  assert.equal(result.authority.creative_approval_authority, "art-studio");
  assert.equal(result.tasks[0].approved_sources.length, 2);
  assert.notEqual(result.tasks[0].approved_sources[0].sha256, result.tasks[0].approved_sources[1].sha256);
  assert.match(result.manifest_fingerprint, /^[0-9a-f]{64}$/u);
});

test("rejects approval targeting a different source package", async () => {
  const input = await fixture({ wrongPackage: true });
  await assert.rejects(
    () => compileApprovedSourcesManifest(input.packagePath, input.approvalPath),
    /does not target this exact source package fingerprint/u,
  );
});

test("duplicate approved bytes cannot satisfy multiple required variants", async () => {
  const input = await fixture({ duplicate: true });
  await assert.rejects(
    () => compileApprovedSourcesManifest(input.packagePath, input.approvalPath),
    /duplicate image bytes/u,
  );
});

test("changed approved source bytes invalidate approval", async () => {
  const input = await fixture();
  await writeFile(path.join(input.root, "a.png"), Buffer.from("tampered"));
  await assert.rejects(
    () => compileApprovedSourcesManifest(input.packagePath, input.approvalPath),
    /approved source hash changed/u,
  );
});
