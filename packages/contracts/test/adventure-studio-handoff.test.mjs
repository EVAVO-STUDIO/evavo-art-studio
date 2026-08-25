import assert from "node:assert/strict";
import test from "node:test";
import {
  compileAdventureStudioArtProductionRequest,
  validateAdventureStudioArtWorkOrder,
} from "../dist/adventure-studio-handoff.js";

const foregroundOrder = {
  contractVersion: 1,
  workOrderId: "creative.ninth-reliquary.foreground",
  projectId: "project.ninth-reliquary",
  assetId: "asset.ninth-reliquary.foreground",
  destinationStudio: "art-studio",
  taskKind: "foreground-plate",
  briefRevision: 2,
  sourceRevisionDigest: "source-2",
  visualStandardDigest: "standard-4",
  styleBankDigest: "style-4",
  nativeSize: { width: 640, height: 360 },
  alphaPolicy: "required",
  checkerboardForbidden: true,
  canvasEdgeMustBeTransparent: true,
  preserveNativeCanvas: true,
  requiredReferenceDigests: ["background-approved", "background-approved"],
  artDirection: ["Match approved background perspective and light."],
  rejectionRules: ["No fake transparency."],
};

test("Adventure Studio foreground work order becomes hostile-alpha Art Studio production request", () => {
  assert.deepEqual(validateAdventureStudioArtWorkOrder(foregroundOrder), []);
  const request = compileAdventureStudioArtProductionRequest(foregroundOrder);
  assert.equal(request.transparencyAdmission.required, true);
  assert.equal(request.transparencyAdmission.checkerboardForbidden, true);
  assert.deepEqual(request.transparencyAdmission.hostileSolidPlates, [
    "black",
    "white",
    "grey",
    "green",
    "magenta",
  ]);
  assert.deepEqual(request.sourceAuthority.referenceDigests, ["background-approved"]);
  assert.equal(request.reviewPolicy.generatorOutputIsUnapproved, true);
  assert.equal(request.reviewPolicy.runtimeScale, true);
});

test("Art Studio rejects non-art adventure tasks and missing real-alpha edge policy", () => {
  const invalid = {
    ...foregroundOrder,
    taskKind: "animation-sequence",
    canvasEdgeMustBeTransparent: false,
  };
  const issues = validateAdventureStudioArtWorkOrder(invalid);
  assert.ok(issues.some((issue) => issue.code === "invalid-task-kind"));
  assert.ok(issues.some((issue) => issue.code === "transparent-edge-policy-missing"));
});
