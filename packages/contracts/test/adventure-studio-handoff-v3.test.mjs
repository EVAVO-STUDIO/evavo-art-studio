import assert from "node:assert/strict";
import test from "node:test";
import {
  compileAdventureStudioArtProductionRequestV3,
  validateAdventureStudioArtWorkOrderV3,
} from "../dist/index.js";

const createOrder = () => ({
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
  invariants: [
    "chair footprint stays registered to cafe floor",
    "approved carved back silhouette remains unchanged",
  ],
  forbiddenDrift: [
    "generic glossy anime furniture",
    "camera or perspective change",
    "fake transparency grid",
  ],
  artDirection: [
    "clean hand-painted prop edge",
    "match approved cafe perspective and warm daylight",
  ],
  reviewChecklist: ["registration", "alpha edge", "occlusion silhouette", "style match"],
  rejectionRules: [
    "painted checkerboard",
    "white matte edge",
    "chair moved from approved anchor",
  ],
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
      repairInstruction:
        "Remove the pale fringe on the right carved edge only; preserve approved paint, silhouette and registration everywhere else.",
      preserveFrameIds: [],
      preserveRegions: [
        { x: 0, y: 0, width: 430, height: 360 },
        { x: 466, y: 0, width: 174, height: 360 },
      ],
      allowRegenerateWholeAsset: false,
    },
  ],
});

test("Adventure Studio v3 compiles targeted static repairs without discarding preserved regions", () => {
  const compiled = compileAdventureStudioArtProductionRequestV3(createOrder());

  assert.deepEqual(compiled.targetedRepairs[0], {
    issueId: "issue.alpha.right-edge",
    issueCode: "alpha-halo",
    targetFrameIds: [],
    targetRegion: { x: 430, y: 210, width: 36, height: 72 },
    repairInstruction:
      "Remove the pale fringe on the right carved edge only; preserve approved paint, silhouette and registration everywhere else.",
    preserveFrameIds: [],
    preserveRegions: [
      { x: 0, y: 0, width: 430, height: 360 },
      { x: 466, y: 0, width: 174, height: 360 },
    ],
    allowRegenerateWholeAsset: false,
  });
  assert.deepEqual(compiled.alphaAdmission, {
    required: true,
    checkerboardForbidden: true,
    decodedAlphaRequired: true,
    transparentCanvasEdgeRequired: true,
    hostilePlateReviewRequired: true,
    rejectMatteResidue: true,
    rejectHaloFringe: true,
    rejectTransparentRgbContamination: true,
  });
});

test("Adventure Studio v3 rejects transparent work that could admit fake transparency", () => {
  const base = createOrder();
  const invalid = {
    ...base,
    transparencyPolicy: {
      ...base.transparencyPolicy,
      decodedAlphaRequired: false,
      transparentCanvasEdgeRequired: false,
      hostilePlateReviewRequired: false,
    },
  };

  const codes = validateAdventureStudioArtWorkOrderV3(invalid).map((issue) => issue.code);
  assert.ok(codes.includes("invalid-alpha-policy"));
});

test("Adventure Studio v3 refuses animation work owned by Cel Animation Studio", () => {
  const invalid = {
    ...createOrder(),
    destinationStudio: "art-studio",
    taskKind: "animation-sequence",
  };

  const codes = validateAdventureStudioArtWorkOrderV3(invalid).map((issue) => issue.code);
  assert.ok(codes.includes("unsupported-task"));
});
