import { describe, expect, it } from "vitest";
import {
  buildAdventureStudioArtDeliveryV3,
  buildAdventureStudioArtReviewV3,
} from "./adventure-studio-review-v3.js";
import type { AdventureCreativeWorkOrderV3 } from "./adventure-studio-handoff-v3.js";

const workOrder: AdventureCreativeWorkOrderV3 = {
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

describe("Adventure Studio v3 art review loop", () => {
  it("marks a halo defect repair-required", () => {
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
          evidenceDigests: ["sha256:alpha-proof"],
          suggestedRepair: "Defringe the affected edge only and preserve the registered painted plate.",
        },
      ],
    });
    expect(review.disposition).toBe("repair-required");
  });

  it("refuses automatic acceptance when required alpha evidence is missing", () => {
    const review = buildAdventureStudioArtReviewV3(workOrder, {
      candidateArtifactDigest: "sha256:candidate",
      reviewerEvidenceDigest: "sha256:review",
      issues: [],
    });
    expect(review.disposition).toBe("repair-required");
  });

  it("builds delivery only from accepted exact candidate", () => {
    const review = buildAdventureStudioArtReviewV3(workOrder, {
      candidateArtifactDigest: "sha256:candidate",
      reviewerEvidenceDigest: "sha256:review",
      alphaEvidenceDigest: "sha256:alpha",
      styleEvidenceDigest: "sha256:style-proof",
      issues: [],
    });
    expect(review.disposition).toBe("accepted");
    const delivery = buildAdventureStudioArtDeliveryV3(workOrder, review, {
      byteLength: 45000,
      mediaType: "image/png",
      sourceLineageDigests: [workOrder.sourceRevisionDigest, workOrder.authorities.styleDigest, ...workOrder.authorities.referenceDigests],
    });
    expect(delivery).toMatchObject({
      approvedArtifactDigest: "sha256:candidate",
      alphaEvidenceDigest: "sha256:alpha",
      reviewEvidenceDigest: "sha256:review",
    });
  });
});
