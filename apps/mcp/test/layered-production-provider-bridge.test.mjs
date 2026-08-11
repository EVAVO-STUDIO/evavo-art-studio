import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ArtDirectionError,
  applyLayeredProductionStyleProofApproval,
  compileLayeredProductionPlan,
  compileLayeredProductionStyleProofApprovalReceipt,
  compileLayeredProviderCandidateRequest,
} from "@evavo/art-direction";
import { compileProviderCandidateRuntimeContract } from "@evavo/art-providers";

const FIXTURE = new URL(
  "../../../config/jonez-layered-production-style-proof.v1.json",
  import.meta.url,
);

async function fixture() {
  return JSON.parse(await readFile(FIXTURE, "utf8"));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function approvalInput(plan) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.style-proof-approval.request",
    planId: plan.planId,
    pendingPlanSha256: plan.planSha256,
    styleFingerprintSha256: plan.styleFingerprintSha256,
    reviewer: "Greg Parker",
    reviewedAt: "2026-08-11T03:45:00.000Z",
    evidence: plan.styleProof.unitIds.map((unitId, index) => {
      const unit = plan.layers
        .flatMap((layer) => layer.units)
        .find((entry) => entry.id === unitId);
      assert.ok(unit);
      const sourceSha256 = digest(`source:${unitId}`);
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
      evidenceArtifactId: `artifact_${digest("jonez-cross-unit-review")}`,
      evidenceSha256: digest("jonez-cross-unit-review"),
    },
  };
}

function sourceArtifact(receipt, unitId) {
  const evidence = receipt.evidence.find((entry) => entry.unitId === unitId);
  assert.ok(evidence, `missing receipt evidence for ${unitId}`);
  return evidence.sourceArtifactId;
}

test("layered identity proof compiles through the provider-neutral runtime contract", async () => {
  const plan = compileLayeredProductionPlan(await fixture());
  const bridge = compileLayeredProviderCandidateRequest(plan, "player-idle-se");
  const contract = compileProviderCandidateRuntimeContract(bridge.request);

  assert.equal(contract.request.assetKind, "sprite-frame");
  assert.equal(contract.request.continuityPhase, "identity-master");
  assert.equal(contract.request.candidateCount, 1);
  assert.equal(contract.request.quality, "high");
  assert.equal(contract.request.target.outputFormat, "png");
  assert.equal(contract.runtimeJob.queue, "provider");
  assert.equal(contract.runtimeJob.kind, "art.candidate.generate");
  assert.match(contract.compiledPrompt, /RUNTIME SOURCE UNIT/);
  assert.match(contract.compiledPrompt, /one image only/i);
});

test("later JONEZ frame requires the exact receipt-bound identity source", async () => {
  const pendingPlan = compileLayeredProductionPlan(await fixture());
  const receipt = compileLayeredProductionStyleProofApprovalReceipt(
    pendingPlan,
    approvalInput(pendingPlan),
  );
  const plan = applyLayeredProductionStyleProofApproval(
    pendingPlan,
    receipt,
  );
  const identityArtifact = sourceArtifact(receipt, "player-idle-se");

  assert.throws(
    () =>
      compileLayeredProviderCandidateRequest(
        plan,
        "player-walk-se-f001",
        [
          {
            artifactId: `artifact_${"b".repeat(64)}`,
            role: "canonical-identity",
            required: true,
          },
        ],
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_PROVIDER_REFERENCE_NOT_APPROVED",
  );

  const bridge = compileLayeredProviderCandidateRequest(
    plan,
    "player-walk-se-f001",
    [
      {
        artifactId: identityArtifact,
        role: "canonical-identity",
        required: true,
        note: "Exact approved JONEZ identity-master source.",
      },
    ],
  );
  const contract = compileProviderCandidateRuntimeContract(bridge.request);

  assert.equal(
    plan.styleProof.approval.receiptSha256,
    receipt.receiptSha256,
  );
  assert.equal(contract.request.continuityPhase, "key-pose");
  assert.equal(contract.request.references[0]?.role, "canonical-identity");
  assert.equal(contract.request.references[0]?.artifactId, identityArtifact);
  assert.ok(contract.requiredAdapterCapabilities.includes("identity-reference"));
  assert.equal(contract.runtimeJob.payload.metadata.styleProofStatus, "approved");
  assert.equal(contract.runtimeJob.payload.metadata.approvals.source, false);
  assert.ok(
    Object.values(contract.runtimeJob.payload.metadata.approvals).every(
      (value) => value === false,
    ),
  );
});
