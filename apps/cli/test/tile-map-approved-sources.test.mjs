import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { compileApprovedSourcesManifest } from "../dist/tile-map-approved-sources.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");

async function png(width, height, rgba) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: rgba,
    },
  }).png().toBuffer();
}

async function fixture({ duplicate = false, wrongPackage = false, size = 16 } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-approved-"));
  const a = await png(size, size, { r: 40, g: 140, b: 70, alpha: 1 });
  const b = duplicate
    ? a
    : await png(size, size, { r: 55, g: 155, b: 80, alpha: 1 });
  await writeFile(path.join(root, "a.png"), a);
  await writeFile(path.join(root, "b.png"), b);
  const packagePayload = {
    schema_version: 1,
    source_plan_sha256: "a".repeat(64),
    source_plan_fingerprint: "b".repeat(64),
    source_map_fingerprint: "e".repeat(64),
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

test("exports only exact-hash creatively approved PNG sources for Sprite Studio", async () => {
  const input = await fixture();
  const result = await compileApprovedSourcesManifest(input.packagePath, input.approvalPath);
  assert.equal(result.eligible_for_sprite_studio, true);
  assert.equal(result.authority.semantic_authority, "tile-map-studio");
  assert.equal(result.authority.creative_approval_authority, "art-studio");
  assert.equal(result.source_map_fingerprint, "e".repeat(64));
  assert.equal(result.tasks[0].approved_sources.length, 2);
  assert.equal(result.tasks[0].approved_sources[0].format, "png");
  assert.equal(result.tasks[0].approved_sources[0].width, 16);
  assert.equal(result.tasks[0].approved_sources[0].height, 16);
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

test("wrong tile canvas cannot be creatively approved", async () => {
  const input = await fixture({ size: 17 });
  await assert.rejects(
    () => compileApprovedSourcesManifest(input.packagePath, input.approvalPath),
    /approved tile .* is 17x17; expected 16x16/u,
  );
});

test("non-PNG source cannot be approved even when named PNG", async () => {
  const input = await fixture();
  const bad = Buffer.from("not-a-png");
  await writeFile(path.join(input.root, "a.png"), bad);
  const approval = JSON.parse(await readFile(input.approvalPath, "utf8"));
  approval.tasks[0].approved_sources[0].sha256 = sha(bad);
  await writeFile(input.approvalPath, JSON.stringify(approval));
  await assert.rejects(
    () => compileApprovedSourcesManifest(input.packagePath, input.approvalPath),
  );
});
