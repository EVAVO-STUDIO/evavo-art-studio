import assert from "node:assert/strict";
import test from "node:test";

import { compileRally25DArtHandoff } from "./rally-25d-handoff.mjs";

test("vehicle handoffs compile the complete governed 2D-to-3D reference package deterministically", async () => {
  const input = {
    assetFamily: "vehicle",
    assetId: "falcon-rally-production-v1",
    subjectId: "falcon-rally",
    creativeIntent: "Create the canonical player rally car with a compact aggressive silhouette, generous suspension travel, readable detachable panels and restrained 1990s arcade styling.",
    referenceBindings: { style: "working/rally/style", gameplayCamera: "working/rally/style/isometric-camera" },
  };
  const before = JSON.stringify(input);
  const first = await compileRally25DArtHandoff(input);
  const second = await compileRally25DArtHandoff(input);

  assert.equal(first.schema, "evavo.rally-art-handoff.v1");
  assert.equal(first.assetFamily, "vehicle");
  assert.equal(first.sourceProductionProtocolVersion, "2026-08-14.2");
  assert.equal(first.artOrders.length, 4);
  assert.deepEqual(first.artOrders.map((entry) => entry.role), [
    "shape-language",
    "modeling-reference",
    "uv-material-reference",
    "rig-damage-reference",
  ]);
  assert.ok(first.artOrders.every((entry) => entry.renderingContract.model === "high-definition-stylized-raster"));
  assert.ok(first.artOrders.every((entry) => entry.renderingContract.textureFiltering === "linear"));
  assert.ok(first.artOrders.every((entry) => entry.renderingContract.authoringScalePolicy === "uniform"));
  assert.equal(first.downstream.compilerProfile, "rally-vehicle-rig-v1");
  assert.equal(first.downstream.runtimeBundleScheme, "evavo.rally-runtime-asset-bundle.v1");
  assert.equal(first.authority.downstreamRepositoryMutation, false);
  assert.equal(first.authority.runtimeRepositoryMutation, false);
  assert.equal(first.handoffSha256, second.handoffSha256);
  assert.equal(JSON.stringify(input), before);
});

test("environment and effect handoffs preserve family-specific production grammar", async () => {
  const environment = await compileRally25DArtHandoff({
    assetFamily: "environment",
    assetId: "forest-stage-production-v1",
    subjectId: "forest-stage",
    creativeIntent: "Author a readable forest rally stage with dirt, gravel, bridges, foliage layers and safe isometric sight lines for high-speed play.",
  });
  const effect = await compileRally25DArtHandoff({
    assetFamily: "vfx",
    assetId: "glass-burst-production-v1",
    subjectId: "glass-burst",
    creativeIntent: "Author a directional glass burst that separates bright shards, tiny fragments and short-lived sparkle without obscuring the vehicle silhouette.",
  });

  assert.equal(environment.artOrders.length, 3);
  assert.equal(environment.downstream.compilerProfile, "rally-environment-kit-v1");
  assert.equal(effect.artOrders.length, 2);
  assert.equal(effect.downstream.compilerProfile, "rally-vfx-v1");
  assert.ok(environment.artOrders.every((entry) => entry.providerPrompt.includes("OUTPUT EXACTLY ONE SEPARATE ASSET")));
});

test("handoffs reject undeclared subjects and unsupported families", async () => {
  await assert.rejects(() => compileRally25DArtHandoff({
    assetFamily: "vehicle",
    assetId: "unknown-production-v1",
    subjectId: "unknown-car",
    creativeIntent: "This intent is long enough to reach the governed validation boundary.",
  }), /not declared/u);
  await assert.rejects(() => compileRally25DArtHandoff({
    assetFamily: "spaceship",
    assetId: "unknown-production-v1",
    subjectId: "falcon-rally",
    creativeIntent: "This intent is long enough to reach the governed validation boundary.",
  }), /not supported/u);
});
