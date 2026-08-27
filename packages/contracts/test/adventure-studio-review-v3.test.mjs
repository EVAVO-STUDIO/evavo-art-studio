import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdventureStudioArtDeliveryV3,
  buildAdventureStudioArtReviewV3,
} from "../dist/index.js";

const workOrder = {
  contractVersion: 3,
  workOrderId: "work.foreground",
  projectId: "project.ninth-reliquary",
  assetId: "asset.foreground",
  destinationStudio: "art-studio",
  taskKind: "foreground-plate",
  revision: 1,
  sourceRevisionDigest: "sha256:source",
  nativeSize: { width: 640, height: 360 },
  alphaPolicy: "required",
  preserveNativeCanvas: true,
  authorities: {
    profileId: "cinematic-handdrawn-conspiracy",
    styleDigest: "sha256:style",
    referenceDigests: ["sha256:layout"],
  },
  invariants: ["registration"],
  forbiddenDrift: ["fake transparency"],
  artDirection: ["clean painted plate"],
  reviewChecklist: ["alpha", "registration"],
  rejectionRules: ["checkerboard"],
  transparencyPolicy: {
    checkerboardForbidden: true,
    decodedAlphaRequired: true,
    transparentCanvasEdgeRequired: true,
    matteResidueForbidden: true,
    haloFringeForbidden: true,
    transparentRgbContaminationForbidden: true,
    hostilePlateReviewRequired: true,
  },
  iterationPolicy: {
    maximumRevisionPasses: 4,
    compareAgainstPreviousApproved: true,
    requireIssueClosureEvidence: true,
    preferTargetedRepair: true,
    fullRegenerationRequiresExplicitReason: true,
  },
  requestedRepairs: [],
};

test("Adventure Studio v3 review marks a halo defect repair-required", () => {
  const review = buildAdventureStudioArtReviewV3(workOrder, {
    candidateArtifactDigest: "sha256:candidate",
    reviewerEvidenceDigest: "sha256:review",
    alphaEvidenceDigest: "sha256:alpha",
    issues: [
      {
        issueId: "halo-1",
        code: "alpha-halo",
        severity: "blocking",
        message: "Visible pale fringe on hostile black plate.",
        frameIds: [],
        evidenceDigests: ["sha256:alpha-proof"],
        suggestedRepair:
          "Defringe the affected edge only and preserve the registered painted plate.",
      },
    ],
  });

  assert.equal(review.disposition, "repair-required");
});

test("Adventure Studio v3 review refuses acceptance when required alpha evidence is missing", () => {
  const review = buildAdventureStudioArtReviewV3(workOrder, {
    candidateArtifactDigest: "sha256:candidate",
    reviewerEvidenceDigest: "sha256:review",
    issues: [],
  });

  assert.equal(review.disposition, "repair-required");
});

test("Adventure Studio v3 builds delivery only from the accepted exact candidate", () => {
  const review = buildAdventureStudioArtReviewV3(workOrder, {
    candidateArtifactDigest: "sha256:candidate",
    reviewerEvidenceDigest: "sha256:review",
    alphaEvidenceDigest: "sha256:alpha",
    styleEvidenceDigest: "sha256:style-proof",
    issues: [],
  });
  assert.equal(review.disposition, "accepted");

  const delivery = buildAdventureStudioArtDeliveryV3(workOrder, review, {
    byteLength: 45_000,
    mediaType: "image/png",
    sourceLineageDigests: [
      workOrder.sourceRevisionDigest,
      workOrder.authorities.styleDigest,
      ...workOrder.authorities.referenceDigests,
    ],
  });

  assert.equal(delivery.approvedArtifactDigest, "sha256:candidate");
  assert.equal(delivery.alphaEvidenceDigest, "sha256:alpha");
  assert.equal(delivery.reviewEvidenceDigest, "sha256:review");
});
