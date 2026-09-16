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
  carryingHandPoint: { x: 0.6, y: 0.5 },
  offHandPoint: { x: 0.38, y: 0.5 },
  carryingShoulderPoint: { x: 0.55, y: 0.28 },
  offShoulderPoint: { x: 0.42, y: 0.28 },
  attachmentVisible: true,
  gripVisible: true,
  strapRouting: "consistent",
  shieldPlane: "side-carry",
  cameraVector: { x: 1, y: 0 },
  equipmentOuterNormal: { x: -1, y: 0 },
  equipmentRotationDegrees: 90,
  equipmentRotationConfidence: 0.8,
  equipmentScaleFraction: 0.1,
  pivot: { x: 0.5, y: 0.9 },
  groundLine: 0.9,
  observedDetailIds: ["bronze-rim", "wood-back", "vertical-grip", "paired-enarmes"],
  detailObservations: [
    { detailId: "vertical-grip", location: { x: 0.6, y: 0.5 } },
    { detailId: "paired-enarmes", location: { x: 0.57, y: 0.48 } },
  ],
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
    detailRules: [
      { detailId: "vertical-grip", allowedVisibleFaces: ["inner"] },
      { detailId: "paired-enarmes", allowedVisibleFaces: ["inner"] },
      { detailId: "pawn-heraldry", allowedVisibleFaces: ["outer"] },
    ],
  },
  directionRules: [{
    cameraDirection: "east-profile",
    allowedVisibleFaces: ["inner"],
    allowedScreenSides: ["right"],
    minimumFaceDotMagnitude: 0.5,
    expectedRotationDegrees: 90,
    maximumRotationErrorDegrees: 12,
    allowedCarryingHandScreenSides: ["right"],
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
    maximumFrameSubjectAreaFractionChange: 0.2,
    maximumFrameGroundLineDelta: 0.03,
    maximumFrameBodyCentroidShift: 0.08,
    maximumFrameEquipmentCentroidShift: 0.08,
    minimumEquipmentRotationConfidence: 0.25,
    maximumGripToCarryingHandDistance: 0.04,
    minimumCarryingHandAdvantage: 0.06,
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

test("catches a shield assigned to the wrong anatomical hand", () => {
  const invalid = structuredClone(base);
  invalid.frames[0].carryingHandPoint = { x: 0.38, y: 0.5 };
  invalid.frames[0].offHandPoint = { x: 0.6, y: 0.5 };
  const issues = validateDirectionalEquipmentContinuityV2(invalid);
  assert.ok(issues.includes("idle-east-00: carrying hand is on the wrong screen side for east-profile"));
  assert.ok(issues.includes("idle-east-00: grip is disconnected from the canonical carrying hand"));
  assert.ok(issues.includes("idle-east-00: grip ownership is ambiguous or assigned to the wrong hand"));
});

test("cannot bypass direction and ownership checks by omitting hand landmarks", () => {
  const invalid = structuredClone(base);
  delete invalid.frames[0].carryingHandPoint;
  delete invalid.frames[0].offHandPoint;
  const issues = validateDirectionalEquipmentContinuityV2(invalid);
  assert.ok(issues.includes("idle-east-00: direction rule requires a carrying-hand landmark"));
  assert.ok(issues.includes("idle-east-00: visible grip requires a carrying-hand landmark"));
  assert.ok(issues.includes("idle-east-00: grip ownership comparison requires carrying-hand and off-hand landmarks"));
});

test("requires the comparison hand when anatomical ownership is gated", () => {
  const invalid = structuredClone(base);
  delete invalid.frames[0].offHandPoint;
  assert.ok(validateDirectionalEquipmentContinuityV2(invalid).includes(
    "idle-east-00: grip ownership comparison requires carrying-hand and off-hand landmarks",
  ));
});

test("catches front heraldry or rear straps drawn on the wrong shield face", () => {
  const invalid = structuredClone(base);
  invalid.frames[0].observedDetailIds.push("pawn-heraldry");
  invalid.frames[0].occludedDetailIds = [];
  invalid.frames[0].detailObservations.push({ detailId: "pawn-heraldry", location: { x: 0.62, y: 0.46 } });
  assert.ok(validateDirectionalEquipmentContinuityV2(invalid).includes(
    "idle-east-00: detail pawn-heraldry appears on the wrong equipment face",
  ));
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
  valid.directionRules[0].allowedCarryingHandScreenSides = ["centre", "right"];
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

test("catches whole-character scale, floor and body-core registration pops", () => {
  const invalid = structuredClone(base);
  Object.assign(invalid.frames[1], {
    subjectBounds: { x: 0.3, y: 0.2, width: 0.4, height: 0.55 },
    subjectCentroid: { x: 0.5, y: 0.48 },
    subjectBodyCentroid: { x: 0.62, y: 0.55 },
    groundLine: 0.84,
  });
  const issues = validateDirectionalEquipmentContinuityV2(invalid);
  assert.ok(issues.includes("idle-east-01: implausible subject scale jump from idle-east-00"));
  assert.ok(issues.includes("idle-east-01: implausible ground-line jump from idle-east-00"));
  assert.ok(issues.includes("idle-east-01: implausible body-core shift from idle-east-00"));
});

test("catches equipment placement jumps and face flips without a transition pose", () => {
  const invalid = structuredClone(base);
  invalid.directionRules[0].allowedVisibleFaces = ["inner", "outer"];
  Object.assign(invalid.frames[1], {
    visibleFace: "outer",
    equipmentCentroid: { x: 0.76, y: 0.48 },
    equipmentBounds: { x: 0.65, y: 0.25, width: 0.22, height: 0.45 },
    equipmentOuterNormal: { x: 1, y: 0 },
    attachmentVisible: false,
    gripVisible: false,
    strapRouting: "not-visible",
  });
  const issues = validateDirectionalEquipmentContinuityV2(invalid);
  assert.ok(issues.includes("idle-east-01: implausible equipment placement jump from idle-east-00"));
  assert.ok(issues.includes("idle-east-01: equipment face flipped without a declared transition from idle-east-00"));
});

test("requires trustworthy rotation evidence when the contract sets a confidence floor", () => {
  const invalid = structuredClone(base);
  invalid.frames[0].equipmentRotationConfidence = 0.1;
  assert.ok(validateDirectionalEquipmentContinuityV2(invalid).includes(
    "idle-east-00: equipment rotation evidence is too ambiguous",
  ));
});

test("rejects invalid temporal subject thresholds", () => {
  const invalid = structuredClone(base);
  invalid.thresholds.maximumFrameGroundLineDelta = -0.1;
  assert.ok(validateDirectionalEquipmentContinuityV2(invalid).includes(
    "maximumFrameGroundLineDelta must be within (0, 1]",
  ));
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
