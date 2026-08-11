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

test("proof assembly cannot smuggle non-proof or approved source claims", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const expanded = assemblyRequest();
  const marketUnit = unitById(plan, "market-building");
  const marketHash = digest("source:market-building");
  expanded.sources.push({
    unitId: "market-building",
    artifactId: `artifact_${marketHash}`,
    sha256: marketHash,
    bytes: 2048,
    width: marketUnit.dimensions.width,
    height: marketUnit.dimensions.height,
    alpha: marketUnit.alpha,
    status: "candidate",
  });
  assert.throws(
    () => compileLayeredAssemblyManifest(plan, expanded),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_ASSEMBLY_STYLE_PROOF_BOUNDARY",
  );

  const falseApproval = assemblyRequest();
  falseApproval.sources[0].status = "approved";
  falseApproval.sources[0].approvalReceiptSha256 = digest("not-real-approval");
  falseApproval.sources[0].approvalReceiptArtifactId =
    `artifact_${digest("not-real-approval")}`;
  assert.throws(
    () => compileLayeredAssemblyManifest(plan, falseApproval),
    /must remain candidate evidence/,
  );

  const pendingWithAnimations = compileLayeredProductionPlan(
    addCompleteRuntimeAnimations(productionRequest()),
  );
  const approved = approvePlan(pendingWithAnimations).plan;
  const mismatchedReceipt = runtimeAssemblyRequest(approved);
  mismatchedReceipt.sources[0].approvalReceiptArtifactId =
    `artifact_${digest("different-receipt")}`;
  assert.throws(
    () => compileLayeredAssemblyManifest(approved, mismatchedReceipt),
    /must equal artifact_<sha256>/,
  );
});

test("rejects disconnected routes, duplicate edges and out-of-bounds placement", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const disconnected = assemblyRequest();
  disconnected.routeGraph.edges = disconnected.routeGraph.edges.filter(
    (edge) =>
      edge.id !== "edge-north-north-east" &&
      edge.id !== "edge-north-east-east",
  );
  assert.throws(
    () => compileLayeredAssemblyManifest(plan, disconnected),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_ASSEMBLY_ROUTE_DISCONNECTED",
  );

  const duplicate = assemblyRequest();
  duplicate.routeGraph.edges.push({
    id: "duplicate-west-link",
    from: "west-walk",
    to: "west-gate",
    direction: "bidirectional",
    travelCost: 1,
  });
  assert.throws(
    () => compileLayeredAssemblyManifest(plan, duplicate),
    /duplicates route connection/,
  );

  const escaped = assemblyRequest();
  const cafe = escaped.placements.find(
    (placement) => placement.id === "cafe-placement",
  );
  assert.ok(cafe);
  cafe.position = { x: 250, y: 150 };
  assert.throws(
    () => compileLayeredAssemblyManifest(plan, escaped),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_ASSEMBLY_GEOMETRY_INVALID",
  );
});

test("route-linked destinations and the followed start actor remain explicit", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const wrongDestination = assemblyRequest();
  const cafe = wrongDestination.placements.find(
    (placement) => placement.id === "cafe-placement",
  );
  assert.ok(cafe);
  cafe.routeNodeId = "market-center";
  assert.throws(
    () => compileLayeredAssemblyManifest(plan, wrongDestination),
    /must be bound to route node cafe-node/,
  );

  const missingFollowStart = assemblyRequest();
  const player = missingFollowStart.placements.find(
    (placement) => placement.id === "player-placement",
  );
  assert.ok(player);
  player.routeNodeId = "west-walk";
  assert.throws(
    () => compileLayeredAssemblyManifest(plan, missingFollowStart),
    /dynamic followed actor placement on the route start node/,
  );
});

test("camera and output paths remain pixel-safe and repository-relative", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const filteredOverview = assemblyRequest();
  filteredOverview.camera.overview.zoom = 2;
  assert.throws(
    () => compileLayeredAssemblyManifest(plan, filteredOverview),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_ASSEMBLY_CAMERA_INVALID",
  );

  const escapedOutput = assemblyRequest();
  escapedOutput.outputs.routeGraphPath = "../jonez-route.json";
  assert.throws(
    () => compileLayeredAssemblyManifest(plan, escapedOutput),
    (error) => error instanceof ArtDirectionError,
  );
});

test("approved production can compile only with complete animation sets and source receipts", () => {
  const pending = compileLayeredProductionPlan(
    addCompleteRuntimeAnimations(productionRequest()),
  );
  const approved = approvePlan(pending).plan;
  const request = runtimeAssemblyRequest(approved);
  const manifest = compileLayeredAssemblyManifest(approved, request);
  assert.equal(manifest.scope, "runtime-candidate");
  assert.equal(manifest.readiness.runtimeReady, true);
  assert.equal(manifest.readiness.candidateOnly, false);
  assert.equal(manifest.totals.candidateSources, 0);
  assert.equal(manifest.totals.approvedSources, request.sources.length);
  assert.equal(manifest.animationSets.length, 2);
  assert.ok(
    manifest.animationSets.every(
      (animationSet) =>
        animationSet.completeness === "complete" &&
        animationSet.clips.every((clip) => clip.complete),
    ),
  );
  assert.equal(verifyLayeredAssemblyManifest(manifest, approved), true);

  const incomplete = runtimeAssemblyRequest(approved);
  incomplete.animationSets[0].unitIds.pop();
  incomplete.sources = incomplete.sources.filter(
    (source) => source.unitId !== "player-walk-se-f004",
  );
  assert.throws(
    () => compileLayeredAssemblyManifest(approved, incomplete),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_ASSEMBLY_ANIMATION_INCOMPLETE",
  );

  const directFrame = runtimeAssemblyRequest(approved);
  const playerPlacement = directFrame.placements.find(
    (placement) => placement.id === "player-placement",
  );
  assert.ok(playerPlacement);
  playerPlacement.source = { kind: "unit", id: "player-idle-se" };
  directFrame.animationSets = [];
  directFrame.sources = directFrame.sources.filter(
    (source) =>
      !source.unitId.startsWith("player-") || source.unitId === "player-idle-se",
  );
  assert.throws(
    () => compileLayeredAssemblyManifest(approved, directFrame),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_ASSEMBLY_ANIMATION_INCOMPLETE",
  );
});

test("occlusion contracts cannot point at ordinary buildings", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const invalid = assemblyRequest();
  invalid.occlusionGroups = [
    {
      id: "bad-occlusion",
      foregroundPlacementId: "cafe-placement",
      baselineY: 80,
      occludedRoles: ["player-character"],
    },
  ];
  assert.throws(
    () => compileLayeredAssemblyManifest(plan, invalid),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_ASSEMBLY_OCCLUSION_INVALID",
  );
});

test("assembly protocol exposes the logical-world and no-authority boundary", () => {
  const protocol = layeredAssemblyProtocolSummary();
  assert.equal(protocol.protocolVersion, "2026-08-11.1");
  assert.ok(
    protocol.rules.some((rule) => rule.includes("route nodes")),
  );
  assert.ok(
    protocol.rules.some((rule) => rule.includes("flattened concept image")),
  );
  assert.ok(
    protocol.rules.some((rule) => rule.includes("journey-follow")),
  );
  assert.equal(protocol.authority.providerExecution, false);
  assert.equal(protocol.authority.automaticAssembly, false);
  assert.equal(protocol.authority.targetRepositoryMutation, false);
});
