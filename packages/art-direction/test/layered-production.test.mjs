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
  getLayeredProductionUnit,
  layeredProductionProtocolSummary,
  validateLayeredProductionRequest,
  verifyLayeredProductionPlan,
  verifyLayeredProductionStyleProofApprovalReceipt,
} from "../dist/index.js";

const FIXTURE = new URL(
  "../../../config/jonez-layered-production-style-proof.v1.json",
  import.meta.url,
);
const FIXTURE_REQUEST = JSON.parse(await readFile(FIXTURE, "utf8"));

function request() {
  return structuredClone(FIXTURE_REQUEST);
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
        sourceBytes: 1024 + index,
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

function approvePlan(pending) {
  const receipt = compileLayeredProductionStyleProofApprovalReceipt(
    pending,
    approvalInput(pending),
  );
  return {
    receipt,
    approved: applyLayeredProductionStyleProofApproval(pending, receipt),
  };
}

function sourceArtifact(receipt, unitId) {
  const evidence = receipt.evidence.find((entry) => entry.unitId === unitId);
  assert.ok(evidence, `missing receipt evidence for ${unitId}`);
  return evidence.sourceArtifactId;
}

test("compiles one exclusive provider job per layered runtime source", () => {
  const plan = compileLayeredProductionPlan(request());
  assert.equal(plan.kind, "evavo.layered-production.plan");
  assert.equal(plan.totals.layers, 6);
  assert.equal(plan.totals.units, 8);
  assert.equal(plan.totals.providerCalls, 8);
  assert.equal(plan.totals.maximumImagesPerProviderCall, 1);
  assert.equal(plan.styleProof.status, "approval-required");
  assert.equal(plan.assembly.reviewCompositeIsRuntimeSource, false);
  assert.equal(plan.authority.providerExecution, false);
  const sourceUnit = getLayeredProductionUnit(plan, "cafe-building");
  assert.equal(sourceUnit.providerJob.images, 1);
  assert.equal(sourceUnit.providerJob.sourceIntent, "runtime-source");
  assert.match(sourceUnit.providerJob.prompt, /RUNTIME SOURCE UNIT/);
  assert.match(sourceUnit.providerJob.prompt, /Exclusive layer ownership/);
  assert.match(sourceUnit.providerJob.prompt, /Do not draw a complete scene/);
  assert.match(sourceUnit.providerJob.negativePrompt, /concept sheet/);
  assert.match(sourceUnit.providerJob.negativePrompt, /AI microtexture noise/);
  assert.equal(sourceUnit.providerJob.transparentBackground, true);
});

test("blocks non-proof retrieval until a content-addressed proof receipt is applied", () => {
  const pending = compileLayeredProductionPlan(request());
  assert.throws(
    () => getLayeredProductionUnit(pending, "market-building"),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_STYLE_PROOF_REQUIRED",
  );
  const { receipt, approved } = approvePlan(pending);
  assert.equal(verifyLayeredProductionStyleProofApprovalReceipt(receipt), true);
  assert.equal(approved.styleProof.status, "approved");
  assert.equal(
    approved.styleProof.approval.receiptSha256,
    receipt.receiptSha256,
  );
  assert.equal(
    getLayeredProductionUnit(approved, "market-building").id,
    "market-building",
  );
});

test("rejects legacy inline approval instead of trusting an arbitrary hash", () => {
  const invalid = request();
  invalid.styleProof.approval = {
    approved: true,
    reviewer: "Unbound reviewer",
    reviewedAt: "2026-08-11T03:45:00.000Z",
    evidenceSha256: "a".repeat(64),
    approvedUnitIds: [...invalid.styleProof.unitIds],
  };
  assert.throws(
    () => compileLayeredProductionPlan(invalid),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_REQUIRED",
  );
});

test("style-proof receipt binds dimensions, jobs, source artifacts and cross-unit style", () => {
  const pending = compileLayeredProductionPlan(request());
  const wrongDimensions = approvalInput(pending);
  wrongDimensions.evidence[0].width += 1;
  assert.throws(
    () =>
      compileLayeredProductionStyleProofApprovalReceipt(
        pending,
        wrongDimensions,
      ),
    /dimensions do not match/,
  );

  const wrongJob = approvalInput(pending);
  wrongJob.evidence[0].providerJobIdempotencyKey = "b".repeat(64);
  assert.throws(
    () => compileLayeredProductionStyleProofApprovalReceipt(pending, wrongJob),
    /does not match the exact compiled unit job/,
  );

  const duplicateSource = approvalInput(pending);
  duplicateSource.evidence[1].sourceSha256 =
    duplicateSource.evidence[0].sourceSha256;
  duplicateSource.evidence[1].sourceArtifactId =
    duplicateSource.evidence[0].sourceArtifactId;
  assert.throws(
    () =>
      compileLayeredProductionStyleProofApprovalReceipt(
        pending,
        duplicateSource,
      ),
    /source artifacts must be unique/,
  );

  const wrongStyle = approvalInput(pending);
  wrongStyle.crossUnitReview.styleFingerprintSha256 = "c".repeat(64);
  assert.throws(
    () => compileLayeredProductionStyleProofApprovalReceipt(pending, wrongStyle),
    /not bound to the exact style fingerprint/,
  );
});

test("tampered approval receipts and approved plans fail closed", () => {
  const pending = compileLayeredProductionPlan(request());
  const { receipt, approved } = approvePlan(pending);
  const tamperedReceipt = structuredClone(receipt);
  tamperedReceipt.evidence[0].width += 1;
  assert.throws(
    () => verifyLayeredProductionStyleProofApprovalReceipt(tamperedReceipt),
    /receiptSha256 does not match|evidenceSha256 does not match/,
  );

  const tamperedPlan = structuredClone(approved);
  tamperedPlan.styleProof.approval.evidence[0].sourceBytes += 1;
  assert.throws(() => verifyLayeredProductionPlan(tamperedPlan));
});

test("is deterministic and self-hashed", () => {
  const left = compileLayeredProductionPlan(request());
  const right = compileLayeredProductionPlan(request());
  assert.equal(left.requestSha256, right.requestSha256);
  assert.equal(left.styleFingerprintSha256, right.styleFingerprintSha256);
  assert.equal(left.planSha256, right.planSha256);
  assert.equal(
    left.layers[0].units[0].providerJob.idempotencyKey,
    right.layers[0].units[0].providerJob.idempotencyKey,
  );
  const leftReceipt = compileLayeredProductionStyleProofApprovalReceipt(
    left,
    approvalInput(left),
  );
  const rightReceipt = compileLayeredProductionStyleProofApprovalReceipt(
    right,
    approvalInput(right),
  );
  assert.equal(leftReceipt.receiptSha256, rightReceipt.receiptSha256);
});

test("rejects flattened source intent and unsafe policy drift", () => {
  const flattened = request();
  flattened.layers[0].units[0].purpose = "Create a complete concept sheet collage.";
  assert.throws(
    () => validateLayeredProductionRequest(flattened),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_SOURCE_INVALID",
  );
  const multi = request();
  multi.sourcePolicy.maximumProviderImagesPerJob = 10;
  assert.throws(
    () => validateLayeredProductionRequest(multi),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_INPUT_INVALID",
  );
});

test("rejects style proof that does not cover animation", () => {
  const invalid = request();
  invalid.styleProof.unitIds = [
    "ground-base",
    "route-base",
    "architecture-back",
    "cafe-building",
  ];
  assert.throws(
    () => validateLayeredProductionRequest(invalid),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_STYLE_PROOF_INVALID",
  );
});

test("rejects duplicate z-order and cross-layer unit identity", () => {
  const duplicateZ = request();
  duplicateZ.layers[1].zOrder = 0;
  assert.throws(
    () => validateLayeredProductionRequest(duplicateZ),
    /zOrder values must be unique/,
  );
  const duplicateUnit = request();
  duplicateUnit.layers[1].units[0].id = "ground-base";
  assert.throws(
    () => validateLayeredProductionRequest(duplicateUnit),
    /Unit IDs must be unique/,
  );
});

test("verifies the canonical plan hash and rejects a tampered pending plan", () => {
  const plan = compileLayeredProductionPlan(request());
  assert.equal(verifyLayeredProductionPlan(plan), true);
  const tampered = structuredClone(plan);
  tampered.totals.units += 1;
  assert.throws(
    () => verifyLayeredProductionPlan(tampered),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_PLAN_INVALID",
  );
});

test("compiles a provider-protocol request for a pending proof source unit", () => {
  const plan = compileLayeredProductionPlan(request());
  const bridge = compileLayeredProviderCandidateRequest(
    plan,
    "player-idle-se",
  );
  assert.equal(bridge.request.operation, "generate");
  assert.equal(bridge.request.assetKind, "sprite-frame");
  assert.equal(bridge.request.continuityPhase, "identity-master");
  assert.equal(bridge.request.candidateCount, 1);
  assert.equal(bridge.request.quality, "high");
  assert.equal(bridge.request.target.outputFormat, "png");
  assert.equal(bridge.request.target.transparency, "required");
  assert.equal(bridge.requiredReferenceRoles.length, 0);
  assert.match(bridge.request.creativeIntent, /one PNG/);
  assert.match(bridge.request.negativeIntent, /concept sheet/);
});

test("binds later character frames to the exact approved identity-master source", () => {
  const pending = compileLayeredProductionPlan(request());
  const { receipt, approved } = approvePlan(pending);
  const identityArtifact = sourceArtifact(receipt, "player-idle-se");
  const wrongApprovedArtifact = sourceArtifact(receipt, "fountain-f001");

  assert.throws(
    () =>
      compileLayeredProviderCandidateRequest(
        approved,
        "player-walk-se-f001",
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_PROVIDER_REFERENCE_REQUIRED",
  );

  assert.throws(
    () =>
      compileLayeredProviderCandidateRequest(
        approved,
        "player-walk-se-f001",
        [
          {
            artifactId: `artifact_${"b".repeat(64)}`,
            role: "canonical-identity",
            required: true,
            note: "A note cannot turn an invented hash into approved evidence.",
          },
        ],
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_PROVIDER_REFERENCE_NOT_APPROVED",
  );

  assert.throws(
    () =>
      compileLayeredProviderCandidateRequest(
        approved,
        "player-walk-se-f001",
        [
          {
            artifactId: wrongApprovedArtifact,
            role: "canonical-identity",
            required: true,
          },
        ],
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_PROVIDER_REFERENCE_ROLE_MISMATCH",
  );

  assert.throws(
    () =>
      compileLayeredProviderCandidateRequest(
        approved,
        "player-walk-se-f001",
        [
          {
            artifactId: identityArtifact,
            role: "canonical-identity",
            required: true,
          },
          {
            artifactId: wrongApprovedArtifact,
            role: "canonical-identity",
            required: false,
          },
        ],
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_PROVIDER_REFERENCE_AMBIGUOUS",
  );

  const bridge = compileLayeredProviderCandidateRequest(
    approved,
    "player-walk-se-f001",
    [
      {
        artifactId: identityArtifact,
        role: "canonical-identity",
        required: true,
        note: "Exact receipt-bound player identity-master source.",
      },
    ],
  );
  assert.equal(bridge.request.continuityPhase, "key-pose");
  assert.deepEqual(bridge.requiredReferenceRoles, ["canonical-identity"]);
  assert.equal(bridge.request.references[0]?.artifactId, identityArtifact);
  assert.equal(bridge.request.metadata.planSha256, approved.planSha256);
});

test("protocol makes concept, runtime-source and reference-authority boundaries explicit", () => {
  const protocol = layeredProductionProtocolSummary();
  assert.equal(protocol.protocolVersion, "2026-08-10.1");
  assert.ok(
    protocol.sourceRules.some((rule) => rule.includes("never runtime-source")),
  );
  assert.ok(
    protocol.sourceRules.some((rule) => rule.includes("exactly one image")),
  );
  assert.ok(
    protocol.sourceRules.some((rule) =>
      rule.includes("exact source artifacts in the embedded style-proof receipt"),
    ),
  );
  assert.equal(protocol.authority.providerExecution, false);
});
