import test from "node:test";
import assert from "node:assert/strict";
import {
  compileAdventureStudioArtProductionRequestV2,
  validateAdventureStudioArtWorkOrderV2,
} from "../dist/index.js";

const workOrder = () => ({
  contractVersion: 2,
  workOrderId: "work.background.station.r2",
  projectId: "project.templar-cel-proof",
  assetId: "asset.station.background",
  destinationStudio: "art-studio",
  taskKind: "background",
  revision: 2,
  replacesRevision: 1,
  sourceRevisionDigest: "sha256:source",
  nativeSize: { width: 640, height: 360 },
  alphaPolicy: "opaque",
  preserveNativeCanvas: true,
  style: {
    profileId: "modern-cinematic-cel-conspiracy",
    styleDigest: "sha256:style",
    paletteDigest: "sha256:palette",
    environmentLayoutDigest: "sha256:layout",
    referenceDigests: ["sha256:b", "sha256:a", "sha256:a"],
    invariants: ["clean authored cel-background shapes", "consistent architectural perspective"],
    forbiddenDrift: ["no generic anime city substitutions", "no photobashed texture noise"],
  },
  artDirection: ["cinematic European mystery location with original architecture"],
  reviewChecklist: ["inspect full size and runtime crop", "verify perspective matches layout"],
  rejectionRules: ["reject AI-like signage or repeated windows"],
  iterationPolicy: {
    maximumRevisionPasses: 4,
    compareAgainstPreviousApproved: true,
    requireIssueClosureEvidence: true,
  },
  transparencyPolicy: {
    checkerboardForbidden: true,
    decodedAlphaRequired: false,
    transparentCanvasEdgeRequired: false,
    matteResidueForbidden: true,
    haloFringeForbidden: true,
    hostilePlateReviewRequired: false,
  },
});

test("accepts and compiles Adventure Studio v2 static art work", () => {
  const input = workOrder();
  assert.deepEqual(validateAdventureStudioArtWorkOrderV2(input), []);
  const compiled = compileAdventureStudioArtProductionRequestV2(input);
  assert.equal(compiled.requestVersion, 2);
  assert.deepEqual(compiled.sourceAuthority.referenceDigests, ["sha256:a", "sha256:b"]);
  assert.equal(compiled.transparencyAdmission.required, false);
});

test("rejects animation tasks routed to Art Studio", () => {
  const input = { ...workOrder(), taskKind: "animation-sequence" };
  assert.equal(validateAdventureStudioArtWorkOrderV2(input).some((issue) => issue.code === "unsupported-task"), true);
});

test("requires decoded alpha and transparent canvas edges for transparent static art", () => {
  const base = workOrder();
  const input = {
    ...base,
    alphaPolicy: "required",
    transparencyPolicy: {
      ...base.transparencyPolicy,
      decodedAlphaRequired: false,
      transparentCanvasEdgeRequired: false,
      hostilePlateReviewRequired: true,
    },
  };
  assert.equal(validateAdventureStudioArtWorkOrderV2(input).some((issue) => issue.code === "invalid-alpha-policy"), true);
});
