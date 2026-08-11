import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtDirectionError,
  compileLayeredAssemblyManifest,
  compileLayeredProductionPlan,
  layeredAssemblyProtocolSummary,
  verifyLayeredAssemblyManifest,
} from "../dist/index.js";
import {
  ASSEMBLY_CONTRACT,
  addCompleteRuntimeAnimations,
  approvePlan,
  assemblyRequest,
  digest,
  productionRequest,
  runtimeAssemblyRequest,
  unitById,
} from "./layered-assembly-fixtures.mjs";

test("assembly contract keeps every execution and promotion authority disabled", () => {
  assert.equal(ASSEMBLY_CONTRACT.contract, "evavo.layered-production.assembly.v1");
  assert.equal(ASSEMBLY_CONTRACT.protocolVersion, "2026-08-11.1");
  assert.equal(Object.values(ASSEMBLY_CONTRACT.requirements).every(Boolean), true);
  assert.equal(
    Object.values(ASSEMBLY_CONTRACT.authority).every((value) => value === false),
    true,
  );
  assert.equal(ASSEMBLY_CONTRACT.assembly.reviewCompositeIsRuntimeSource, false);
});

test("compiles the JONEZ proof into separate bounded layers and a logical route graph", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const manifest = compileLayeredAssemblyManifest(plan, assemblyRequest());
  assert.equal(manifest.kind, "evavo.layered-production.assembly-manifest");
  assert.equal(manifest.protocolVersion, "2026-08-11.1");
  assert.equal(manifest.scope, "style-proof-review");
  assert.equal(manifest.readiness.runtimeReady, false);
  assert.equal(manifest.readiness.candidateOnly, true);
  assert.equal(manifest.readiness.reviewCompositeIsRuntimeSource, false);
  assert.equal(manifest.totals.sources, 6);
  assert.equal(manifest.totals.candidateSources, 6);
  assert.equal(manifest.totals.placements, 6);
  assert.equal(manifest.totals.animationSets, 1);
  assert.equal(manifest.totals.dynamicPlacements, 1);
  assert.equal(manifest.totals.routeNodes, 11);
  assert.equal(manifest.totals.routeEdges, 12);
  assert.equal(manifest.routeGraph.reachableNodeCount, 11);
  assert.equal(manifest.routeGraph.destinations[0]?.id, "cafe");
  const player = manifest.layers
    .flatMap((layer) => layer.placements)
    .find((placement) => placement.id === "player-placement");
  assert.ok(player);
  assert.equal(player.sortY, 143);
  assert.deepEqual(player.worldPosition, { x: 462, y: 310 });
  assert.equal(player.source.kind, "animation-set");
  assert.equal(manifest.animationSets[0]?.completeness, "proof-partial");
  assert.equal(manifest.animationSets[0]?.clips[0]?.complete, false);
  assert.equal(verifyLayeredAssemblyManifest(manifest, plan), true);
});

test("assembly compilation is deterministic and its self-hash fails closed", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const left = compileLayeredAssemblyManifest(plan, assemblyRequest());
  const right = compileLayeredAssemblyManifest(plan, assemblyRequest());
  assert.equal(left.requestSha256, right.requestSha256);
  assert.equal(left.manifestSha256, right.manifestSha256);
  const tampered = structuredClone(left);
  tampered.routeGraph.edges[0].travelCost += 1;
  assert.throws(
    () => verifyLayeredAssemblyManifest(tampered, plan),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_ASSEMBLY_MANIFEST_INVALID",
  );
});
