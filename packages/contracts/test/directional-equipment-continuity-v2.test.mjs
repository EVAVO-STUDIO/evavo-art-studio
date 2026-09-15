import assert from "node:assert/strict";
import test from "node:test";
import {
  DIRECTIONAL_EQUIPMENT_CONTINUITY_V2_SCHEMA,
  validateDirectionalEquipmentContinuityV2,
} from "../dist/index.js";

const hash = "a".repeat(64);
const frame = (frameId, sequenceIndex, overrides = {}) => ({
  frameId,
  stateId: "idle",
  sequenceIndex,
  sha256: hash,
  measurementSha256: "b".repeat(64),
  cameraDirection: "east-profile",
  equipmentId: "round-shield",
  carryingSide: "left",
  visibleFace: "inner",
  equipmentScreenSide: "right",
  subjectBounds: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
  subjectCentroid: { x: 0.48, y: 0.5 },
  equipmentBounds: { x: 0.5, y: 0.25, width: 0.22, height: 0.45 },
  equipmentCentroid: { x: 0.61, y: 0.48 },
  attachmentPoint: { x: 0.57, y: 0.48 },
  gripPoint: { x: 0.6, y: 0.5 },
  attachmentVisible: true,
  gripVisible: true,
  strapRouting: "consistent",
  shieldPlane: "side-carry",
  cameraVector: { x: 1, y: 0 },
  equipmentOuterNormal: { x: -1, y: 0 },
  equipmentRotationDegrees: 90,
  equipmentScaleFraction: 0.1,
  pivot: { x: 0.5, y: 0.9 },
  groundLine: 0.9,
  observedDetailIds: ["bronze-rim", "wood-back", "vertical-grip", "paired-enarmes"],
  occludedDetailIds: ["pawn-heraldry"],
  styleEvidence: {
    paletteDistanceFromCanonical: 8,
    lineDensityFractionChange: 0.04,
    bodyScaleFractionChange: 0.03,
    pivotShiftFromCanonical: 0.01,
    centroidAlignedSilhouetteIoU: 0.82,
  },
  occlusion: "outer heraldry is camera-occluded by the inner face",
  reviewer: "art-director",
  reviewedAt: "2026-09-15T00:00:00Z",
  status: "approved",
  ...overrides,
});

const base = {
  schema: DIRECTIONAL_EQUIPMENT_CONTINUITY_V2_SCHEMA,
  characterId: "rattle-guard",
  canonicalIdentitySha256: hash,
  canonicalEquipment: {
    equipmentId: "round-shield",
    carryingSide: "left",
    requiredDetailIds: ["bronze-rim", "wood-back", "vertical-grip", "paired-enarmes", "pawn-heraldry"],
  },
  directionRules: [{
    cameraDirection: "east-profile",
    allowedVisibleFaces: ["inner"],
    allowedScreenSides: ["right"],
    minimumFaceDotMagnitude: 0.5,
    expectedRotationDegrees: 90,
    maximumRotationErrorDegrees: 12,
  }],
  thresholds: {
    maximumGripAttachmentDistance: 0.08,
    maximumPaletteDistance: 20,
    maximumLineDensityFractionChange: 0.15,
    maximumBodyScaleFractionChange: 0.15,
    maximumPivotShift: 0.04,
    minimumCentroidAlignedSilhouetteIoU: 0.65,
    maximumFrameRotationDeltaDegrees: 18,
    maximumFrameScaleFractionChange: 0.2,
  },
  runtimeAuthority: false,
  frames: [frame("idle-east-00", 0), frame("idle-east-01", 1, { equipmentRotationDegrees: 94 })],
};

test("accepts measured inner-face ownership and stable family geometry", () => {
  assert.deepEqual(validateDirectionalEquipmentContinuityV2(base), []);
});

test("catches a shield face that contradicts its camera-relative plane", () => {
  const invalid = structuredClone(base);
  invalid.frames[0].visibleFace = "outer";
  assert.ok(validateDirectionalEquipmentContinuityV2(invalid).includes(
    "idle-east-00: visible face disagrees with camera and equipment plane",
  ));
});

test("catches wrong placement, rotation and disconnected grip geometry", () => {
  const invalid = structuredClone(base);
  Object.assign(invalid.frames[0], {
    equipmentScreenSide: "left",
    equipmentRotationDegrees: 20,
    gripPoint: { x: 0.7, y: 0.68 },
  });
  const issues = validateDirectionalEquipmentContinuityV2(invalid);
  assert.ok(issues.includes("idle-east-00: declared screen side disagrees with measured placement"));
  assert.ok(issues.includes("idle-east-00: equipment rotation violates east-profile rule"));
  assert.ok(issues.includes("idle-east-00: grip is disconnected from attachment geometry"));
});

test("uses a reviewed body centroid when a long weapon biases silhouette placement", () => {
  const valid = structuredClone(base);
  Object.assign(valid.frames[0], {
    subjectCentroid: { x: 0.42, y: 0.5 },
    subjectBodyCentroid: { x: 0.58, y: 0.5 },
    equipmentCentroid: { x: 0.5, y: 0.48 },
    equipmentScreenSide: "left",
  });
  valid.directionRules[0].allowedScreenSides = ["left", "right"];
  const issues = validateDirectionalEquipmentContinuityV2(valid);
  assert.ok(!issues.some((issue) => issue.includes("screen side")));
});

test("rejects a reviewed body centroid outside the measured subject", () => {
  const invalid = structuredClone(base);
  invalid.frames[0].subjectBodyCentroid = { x: 0.95, y: 0.5 };
  assert.ok(validateDirectionalEquipmentContinuityV2(invalid).includes(
    "idle-east-00: invalid subject body centroid",
  ));
});

test("catches missing construction details and visual-style drift", () => {
  const invalid = structuredClone(base);
  invalid.frames[0].observedDetailIds = ["bronze-rim"];
  invalid.frames[0].occludedDetailIds = [];
  invalid.frames[0].styleEvidence.paletteDistanceFromCanonical = 45;
  invalid.frames[0].styleEvidence.centroidAlignedSilhouetteIoU = 0.3;
  const issues = validateDirectionalEquipmentContinuityV2(invalid);
  assert.ok(issues.includes("idle-east-00: missing canonical detail paired-enarmes"));
  assert.ok(issues.includes("idle-east-00: palette drift exceeds threshold"));
  assert.ok(issues.includes("idle-east-00: silhouette identity drift exceeds threshold"));
});

test("catches implausible frame-to-frame rotation and scale pops", () => {
  const invalid = structuredClone(base);
  invalid.frames[1].equipmentRotationDegrees = 125;
  invalid.frames[1].equipmentScaleFraction = 0.15;
  const issues = validateDirectionalEquipmentContinuityV2(invalid);
  assert.ok(issues.includes("idle-east-01: implausible equipment rotation jump from idle-east-00"));
  assert.ok(issues.includes("idle-east-01: implausible equipment scale jump from idle-east-00"));
});

test("treats opposite signs of the same measured principal axis as equivalent", () => {
  const valid = structuredClone(base);
  valid.directionRules[0].expectedRotationDegrees = 90;
  valid.frames[0].equipmentRotationDegrees = -89;
  valid.frames[1].equipmentRotationDegrees = 89;
  const issues = validateDirectionalEquipmentContinuityV2(valid);
  assert.ok(!issues.some((issue) => issue.includes("rotation")));
});

test("does not compare fragment geometry across a reviewed equipment occlusion", () => {
  const valid = structuredClone(base);
  valid.directionRules[0].allowedVisibleFaces.push("occluded");
  valid.directionRules[0].allowedScreenSides.push("occluded");
  Object.assign(valid.frames[1], {
    visibleFace: "occluded",
    equipmentScreenSide: "occluded",
    equipmentRotationDegrees: 20,
    equipmentScaleFraction: 0.02,
    attachmentVisible: false,
    gripVisible: false,
    strapRouting: "occluded",
    occlusion: "body and weapon cover the shield plane; only a small edge fragment remains",
  });
  const issues = validateDirectionalEquipmentContinuityV2(valid);
  assert.deepEqual(issues, []);
});
