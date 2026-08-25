import { describe, expect, it } from "vitest";
import {
  compileAdventureStudioArtProductionRequestV3,
  validateAdventureStudioArtWorkOrderV3,
  type AdventureCreativeWorkOrderV3,
} from "./adventure-studio-handoff-v3.js";

const order = (): AdventureCreativeWorkOrderV3 => ({
  contractVersion: 3,
  workOrderId: "work.ninth-reliquary.foreground.cafe-chair",
  projectId: "project.ninth-reliquary",
  assetId: "asset.ninth-reliquary.cafe-chair",
  destinationStudio: "art-studio",
  taskKind: "foreground-plate",
  revision: 2,
  replacesRevision: 1,
  sourceRevisionDigest: "sha256:source-r2",
  nativeSize: { width: 640, height: 360 },
  alphaPolicy: "required",
  preserveNativeCanvas: true,
  authorities: {
    profileId: "cinematic-handdrawn-conspiracy",
    styleDigest: "sha256:style",
    environmentLayoutDigest: "sha256:cafe-layout",
    referenceDigests: ["sha256:background-approved"],
    previousApprovedArtifactDigest: "sha256:foreground-r1",
  },
  invariants: ["chair footprint stays registered to cafe floor", "approved carved back silhouette remains unchanged"],
  forbiddenDrift: ["generic glossy anime furniture", "camera or perspective change", "fake transparency grid"],
  artDirection: ["clean hand-painted prop edge", "match approved cafe perspective and warm daylight"],
  reviewChecklist: ["registration", "alpha edge", "occlusion silhouette", "style match"],
  rejectionRules: ["painted checkerboard", "white matte edge", "chair moved from approved anchor"],
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
  requestedRepairs: [
    {
      issueId: "issue.alpha.right-edge",
      issueCode: "alpha-halo",
      targetFrameIds: [],
      targetRegion: { x: 430, y: 210, width: 36, height: 72 },
      repairInstruction: "Remove the pale fringe on the right carved edge only; preserve approved paint, silhouette and registration everywhere else.",
      preserveFrameIds: [],
      preserveRegions: [
        { x: 0, y: 0, width: 430, height: 360 },
        { x: 466, y: 0, width: 174, height: 360 },
      ],
      allowRegenerateWholeAsset: false,
    },
  ],
});

describe("Adventure Studio handoff v3 Art Studio adapter", () => {
  it("compiles targeted static repairs without discarding preserved regions", () => {
    const compiled = compileAdventureStudioArtProductionRequestV3(order());
    expect(compiled.targetedRepairs[0]).toMatchObject({
      issueId: "issue.alpha.right-edge",
      issueCode: "alpha-halo",
      allowRegenerateWholeAsset: false,
    });
    expect(compiled.alphaAdmission).toMatchObject({
      required: true,
      checkerboardForbidden: true,
      decodedAlphaRequired: true,
      rejectMatteResidue: true,
      rejectHaloFringe: true,
      rejectTransparentRgbContamination: true,
    });
  });

  it("rejects transparent work that could admit fake transparency", () => {
    const invalid: AdventureCreativeWorkOrderV3 = {
      ...order(),
      transparencyPolicy: {
        ...order().transparencyPolicy,
        decodedAlphaRequired: false,
        transparentCanvasEdgeRequired: false,
        hostilePlateReviewRequired: false,
      },
    };
    expect(validateAdventureStudioArtWorkOrderV3(invalid)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid-alpha-policy" })]),
    );
  });

  it("refuses animation work owned by Cel Animation Studio", () => {
    const invalid: AdventureCreativeWorkOrderV3 = {
      ...order(),
      destinationStudio: "art-studio",
      taskKind: "animation-sequence",
    };
    expect(validateAdventureStudioArtWorkOrderV3(invalid)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unsupported-task" })]),
    );
  });
});
