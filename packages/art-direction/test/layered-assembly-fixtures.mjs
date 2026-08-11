import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ArtDirectionError,
  applyLayeredProductionStyleProofApproval,
  compileLayeredAssemblyManifest,
  compileLayeredProductionPlan,
  compileLayeredProductionStyleProofApprovalReceipt,
  layeredAssemblyProtocolSummary,
  verifyLayeredAssemblyManifest,
} from "../dist/index.js";

const PRODUCTION_FIXTURE = new URL(
  "../../../config/jonez-layered-production-style-proof.v1.json",
  import.meta.url,
);
const ASSEMBLY_FIXTURE = new URL(
  "../../../config/jonez-layered-assembly-style-proof.v1.json",
  import.meta.url,
);
export const ASSEMBLY_CONTRACT_FIXTURE = new URL(
  "../../../config/layered-production-assembly.v1.json",
  import.meta.url,
);
export const PRODUCTION_REQUEST = JSON.parse(await readFile(PRODUCTION_FIXTURE, "utf8"));
export const ASSEMBLY_REQUEST = JSON.parse(await readFile(ASSEMBLY_FIXTURE, "utf8"));
export const ASSEMBLY_CONTRACT = JSON.parse(
  await readFile(ASSEMBLY_CONTRACT_FIXTURE, "utf8"),
);

export const digest = (value) => createHash("sha256").update(value).digest("hex");
export const productionRequest = () => structuredClone(PRODUCTION_REQUEST);
export const assemblyRequest = () => structuredClone(ASSEMBLY_REQUEST);

export function unitById(plan, unitId) {
  const unit = plan.layers
    .flatMap((layer) => layer.units)
    .find((entry) => entry.id === unitId);
  assert.ok(unit, `missing unit ${unitId}`);
  return unit;
}

export function approvalInput(plan) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.style-proof-approval.request",
    planId: plan.planId,
    pendingPlanSha256: plan.planSha256,
    styleFingerprintSha256: plan.styleFingerprintSha256,
    reviewer: "Greg Parker",
    reviewedAt: "2026-08-11T08:30:00.000Z",
    evidence: plan.styleProof.unitIds.map((unitId, index) => {
      const unit = unitById(plan, unitId);
      const sourceSha256 = digest(`style-proof-source:${unitId}`);
      const sealedReviewReceiptSha256 = digest(`sealed-review:${unitId}`);
      const reviewBundleSha256 = digest(`review-bundle:${unitId}`);
      return {
        unitId,
        sourceArtifactId: `artifact_${sourceSha256}`,
        sourceSha256,
        sourceBytes: 2048 + index,
        width: unit.dimensions.width,
        height: unit.dimensions.height,
        providerJobIdempotencyKey: unit.providerJob.idempotencyKey,
        providerRequestSha256: digest(`provider-request:${unitId}`),
        sealedReviewArtifactId: `artifact_${sealedReviewReceiptSha256}`,
        sealedReviewReceiptSha256,
        reviewBundleArtifactId: `artifact_${reviewBundleSha256}`,
        reviewBundleSha256,
        decision: "approved",
      };
    }),
    crossUnitReview: {
      decision: "approved",
      styleFingerprintSha256: plan.styleFingerprintSha256,
      cameraConsistency: "approved",
      lightingConsistency: "approved",
      paletteConsistency: "approved",
      pixelGrammarConsistency: "approved",
      layerSeparation: "approved",
      antiGenericQuality: "approved",
      evidenceArtifactId: `artifact_${digest("cross-unit-style-review")}`,
      evidenceSha256: digest("cross-unit-style-review"),
    },
  };
}

export function approvePlan(pendingPlan) {
  const receipt = compileLayeredProductionStyleProofApprovalReceipt(
    pendingPlan,
    approvalInput(pendingPlan),
  );
  return {
    receipt,
    plan: applyLayeredProductionStyleProofApproval(pendingPlan, receipt),
  };
}

export function addCompleteRuntimeAnimations(request) {
  const playerLayer = request.layers.find((layer) => layer.id === "player");
  assert.ok(playerLayer);
  const idleFirst = playerLayer.units.find((unit) => unit.id === "player-idle-se");
  const walkFirst = playerLayer.units.find(
    (unit) => unit.id === "player-walk-se-f001",
  );
  assert.ok(idleFirst);
  assert.ok(walkFirst);
  playerLayer.units.push({
    ...structuredClone(idleFirst),
    id: "player-idle-se-f002",
    purpose: "Author the isolated player-idle-se-f002 source unit.",
    fileName: "jonez__player__idle_se__f002.png",
    targetPath:
      "examples/city_life_board_sim/assets/final/characters/jonez__player__idle_se__f002.png",
    frame: {
      ...idleFirst.frame,
      frameNumber: 2,
      pose: "settled south-east idle with a compact breathing shift",
    },
  });
  for (let frameNumber = 2; frameNumber <= 4; frameNumber += 1) {
    const padded = String(frameNumber).padStart(3, "0");
    playerLayer.units.push({
      ...structuredClone(walkFirst),
      id: `player-walk-se-f${padded}`,
      purpose: `Author the isolated player-walk-se-f${padded} source unit.`,
      fileName: `jonez__player__walk_se__f${padded}.png`,
      targetPath:
        `examples/city_life_board_sim/assets/final/characters/jonez__player__walk_se__f${padded}.png`,
      frame: {
        ...walkFirst.frame,
        frameNumber,
        pose: `south-east walk cycle production pose ${frameNumber} of 4`,
      },
    });
  }
  const fxLayer = request.layers.find((layer) => layer.id === "ambient-fx");
  assert.ok(fxLayer);
  const fountainFirst = fxLayer.units.find((unit) => unit.id === "fountain-f001");
  assert.ok(fountainFirst);
  for (let frameNumber = 2; frameNumber <= 4; frameNumber += 1) {
    const padded = String(frameNumber).padStart(3, "0");
    fxLayer.units.push({
      ...structuredClone(fountainFirst),
      id: `fountain-f${padded}`,
      purpose: `Author the isolated fountain-f${padded} source unit.`,
      fileName: `jonez__fx__fountain__f${padded}.png`,
      targetPath:
        `examples/city_life_board_sim/assets/final/effects/jonez__fx__fountain__f${padded}.png`,
      frame: {
        ...fountainFirst.frame,
        frameNumber,
        pose: `fountain water cycle production pose ${frameNumber} of 4`,
      },
    });
  }
  return request;
}

export function approvedSource(plan, unitId) {
  const unit = unitById(plan, unitId);
  const sourceSha256 = digest(`runtime-source:${unitId}`);
  return {
    unitId,
    artifactId: `artifact_${sourceSha256}`,
    sha256: sourceSha256,
    bytes: 4096 + unit.sequence,
    width: unit.dimensions.width,
    height: unit.dimensions.height,
    alpha: unit.alpha,
    status: "approved",
    approvalReceiptSha256: digest(`source-approval:${unitId}`),
    approvalReceiptArtifactId:
      `artifact_${digest(`source-approval:${unitId}`)}`,
  };
}

export function runtimeAssemblyRequest(plan) {
  const request = assemblyRequest();
  const animationUnitIds = [
    "player-idle-se",
    "player-idle-se-f002",
    "player-walk-se-f001",
    "player-walk-se-f002",
    "player-walk-se-f003",
    "player-walk-se-f004",
  ];
  const staticUnitIds = [
    "ground-base",
    "route-base",
    "architecture-back",
    "cafe-building",
  ];
  const fountainUnitIds = [
    "fountain-f001",
    "fountain-f002",
    "fountain-f003",
    "fountain-f004",
  ];
  request.scope = "runtime-candidate";
  request.sources = [...staticUnitIds, ...animationUnitIds, ...fountainUnitIds].map((unitId) =>
    approvedSource(plan, unitId),
  );
  request.animationSets = [
    {
      id: "player-runtime",
      layerId: "player",
      continuityKey: "jonez-player",
      completeness: "complete",
      unitIds: animationUnitIds,
    },
    {
      id: "fountain-runtime",
      layerId: "ambient-fx",
      continuityKey: "jonez-fountain-f001",
      completeness: "complete",
      unitIds: fountainUnitIds,
    },
  ];
  const playerPlacement = request.placements.find(
    (placement) => placement.id === "player-placement",
  );
  assert.ok(playerPlacement);
  playerPlacement.source = { kind: "animation-set", id: "player-runtime" };
  const fountainPlacement = request.placements.find(
    (placement) => placement.id === "fountain-placement",
  );
  assert.ok(fountainPlacement);
  fountainPlacement.source = { kind: "animation-set", id: "fountain-runtime" };
  return request;
}
