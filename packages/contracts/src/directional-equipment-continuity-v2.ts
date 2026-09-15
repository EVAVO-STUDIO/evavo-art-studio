export const DIRECTIONAL_EQUIPMENT_CONTINUITY_V2_SCHEMA = "evavo.directional-equipment-continuity.v2" as const;

export type MeasuredEquipmentFace = "outer" | "inner" | "edge" | "occluded";
export type MeasuredScreenSide = "left" | "right" | "centre" | "occluded";
export interface NormalizedPoint { x: number; y: number }
export interface NormalizedBounds extends NormalizedPoint { width: number; height: number }
export interface DirectionVector { x: number; y: number }

export interface DirectionalEquipmentRuleV2 {
  cameraDirection: string;
  allowedVisibleFaces: MeasuredEquipmentFace[];
  allowedScreenSides: MeasuredScreenSide[];
  minimumFaceDotMagnitude: number;
  expectedRotationDegrees: number;
  maximumRotationErrorDegrees: number;
}

export interface DirectionalEquipmentFrameReviewV2 {
  frameId: string;
  stateId: string;
  sequenceIndex: number;
  sha256: string;
  measurementSha256: string;
  cameraDirection: string;
  equipmentId: string;
  carryingSide: "left" | "right" | "both" | "not-applicable";
  visibleFace: MeasuredEquipmentFace;
  equipmentScreenSide: MeasuredScreenSide;
  subjectBounds: NormalizedBounds;
  subjectCentroid: NormalizedPoint;
  equipmentBounds: NormalizedBounds;
  equipmentCentroid: NormalizedPoint;
  attachmentPoint: NormalizedPoint | null;
  gripPoint: NormalizedPoint | null;
  attachmentVisible: boolean;
  gripVisible: boolean;
  strapRouting: "consistent" | "not-visible" | "not-applicable";
  shieldPlane: "side-carry" | "guard-forward" | "transition" | "not-applicable";
  cameraVector: DirectionVector;
  equipmentOuterNormal: DirectionVector;
  equipmentRotationDegrees: number;
  equipmentScaleFraction: number;
  pivot: NormalizedPoint;
  groundLine: number;
  observedDetailIds: string[];
  occludedDetailIds: string[];
  styleEvidence: {
    paletteDistanceFromCanonical: number;
    lineDensityFractionChange: number;
    bodyScaleFractionChange: number;
    pivotShiftFromCanonical: number;
    centroidAlignedSilhouetteIoU: number;
  };
  occlusion: string;
  reviewer: string;
  reviewedAt: string;
  status: "approved" | "rejected";
  reason?: string;
}

export interface DirectionalEquipmentContinuityContractV2 {
  schema: typeof DIRECTIONAL_EQUIPMENT_CONTINUITY_V2_SCHEMA;
  characterId: string;
  canonicalIdentitySha256: string;
  canonicalEquipment: {
    equipmentId: string;
    carryingSide: "left" | "right" | "both" | "not-applicable";
    requiredDetailIds: string[];
  };
  directionRules: DirectionalEquipmentRuleV2[];
  thresholds: {
    maximumGripAttachmentDistance: number;
    maximumPaletteDistance: number;
    maximumLineDensityFractionChange: number;
    maximumBodyScaleFractionChange: number;
    maximumPivotShift: number;
    minimumCentroidAlignedSilhouetteIoU: number;
    maximumFrameRotationDeltaDegrees: number;
    maximumFrameScaleFractionChange: number;
  };
  runtimeAuthority: false;
  frames: DirectionalEquipmentFrameReviewV2[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const finite = (value: number): boolean => Number.isFinite(value);
const unit = (value: number): boolean => finite(value) && value >= 0 && value <= 1;
const pointValid = (point: NormalizedPoint): boolean => unit(point.x) && unit(point.y);
const boundsValid = (bounds: NormalizedBounds): boolean => pointValid(bounds)
  && bounds.width > 0 && unit(bounds.width) && bounds.height > 0 && unit(bounds.height)
  && bounds.x + bounds.width <= 1.000001 && bounds.y + bounds.height <= 1.000001;
const contains = (bounds: NormalizedBounds, point: NormalizedPoint): boolean =>
  point.x >= bounds.x && point.x <= bounds.x + bounds.width
  && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
const distance = (a: NormalizedPoint, b: NormalizedPoint): number => Math.hypot(a.x - b.x, a.y - b.y);
const vectorLength = (value: DirectionVector): number => Math.hypot(value.x, value.y);
const angularDistance = (a: number, b: number): number => {
  const delta = Math.abs((a - b) % 360);
  return Math.min(delta, 360 - delta);
};
// A mask-derived principal axis has no arrow: +89 and -89 degrees describe the
// same near-vertical axis. Equipment face ownership remains directed and is
// independently enforced by cameraVector/equipmentOuterNormal.
const axisAngularDistance = (a: number, b: number): number => {
  const directed = angularDistance(a, b);
  return Math.min(directed, Math.abs(180 - directed));
};
const inferredFace = (frame: DirectionalEquipmentFrameReviewV2, minimum: number): MeasuredEquipmentFace => {
  const cameraLength = vectorLength(frame.cameraVector);
  const normalLength = vectorLength(frame.equipmentOuterNormal);
  if (cameraLength === 0 || normalLength === 0) return "edge";
  const dot = (frame.cameraVector.x * frame.equipmentOuterNormal.x
    + frame.cameraVector.y * frame.equipmentOuterNormal.y) / (cameraLength * normalLength);
  if (dot >= minimum) return "outer";
  if (dot <= -minimum) return "inner";
  return "edge";
};

export function validateDirectionalEquipmentContinuityV2(value: DirectionalEquipmentContinuityContractV2): string[] {
  const issues: string[] = [];
  if (value.schema !== DIRECTIONAL_EQUIPMENT_CONTINUITY_V2_SCHEMA) issues.push("unsupported schema");
  if (!value.characterId.trim()) issues.push("characterId is required");
  if (!SHA256.test(value.canonicalIdentitySha256)) issues.push("canonicalIdentitySha256 must be lowercase SHA-256");
  if (value.runtimeAuthority !== false) issues.push("review evidence cannot grant runtime authority");
  if (!value.frames.length) issues.push("at least one frame review is required");
  if (!value.canonicalEquipment.equipmentId.trim()) issues.push("canonical equipmentId is required");
  if (!value.canonicalEquipment.requiredDetailIds.length) issues.push("canonical equipment requires identity details");

  const rules = new Map<string, DirectionalEquipmentRuleV2>();
  for (const rule of value.directionRules) {
    if (!rule.cameraDirection.trim()) issues.push("direction rule cameraDirection is required");
    if (rules.has(rule.cameraDirection)) issues.push(`duplicate direction rule: ${rule.cameraDirection}`);
    rules.set(rule.cameraDirection, rule);
    if (!rule.allowedVisibleFaces.length) issues.push(`${rule.cameraDirection}: allowedVisibleFaces is required`);
    if (!rule.allowedScreenSides.length) issues.push(`${rule.cameraDirection}: allowedScreenSides is required`);
    if (!unit(rule.minimumFaceDotMagnitude) || rule.minimumFaceDotMagnitude === 0) issues.push(`${rule.cameraDirection}: invalid minimumFaceDotMagnitude`);
    if (!finite(rule.expectedRotationDegrees) || !finite(rule.maximumRotationErrorDegrees)
      || rule.maximumRotationErrorDegrees < 0 || rule.maximumRotationErrorDegrees > 180) issues.push(`${rule.cameraDirection}: invalid rotation rule`);
  }

  const ids = new Set<string>();
  const sequenceKeys = new Set<string>();
  const ordered = new Map<string, DirectionalEquipmentFrameReviewV2[]>();
  for (const frame of value.frames) {
    if (ids.has(frame.frameId)) issues.push(`duplicate frameId: ${frame.frameId}`);
    ids.add(frame.frameId);
    const sequenceKey = `${frame.stateId}|${frame.cameraDirection}|${frame.sequenceIndex}`;
    if (sequenceKeys.has(sequenceKey)) issues.push(`${frame.frameId}: duplicate state/direction/sequence index`);
    sequenceKeys.add(sequenceKey);
    const familyKey = `${frame.stateId}|${frame.cameraDirection}`;
    ordered.set(familyKey, [...(ordered.get(familyKey) ?? []), frame]);
    if (!frame.stateId.trim() || !Number.isInteger(frame.sequenceIndex) || frame.sequenceIndex < 0) issues.push(`${frame.frameId}: valid stateId and sequenceIndex are required`);
    if (!SHA256.test(frame.sha256)) issues.push(`${frame.frameId}: invalid sha256`);
    if (!SHA256.test(frame.measurementSha256)) issues.push(`${frame.frameId}: invalid measurementSha256`);
    const rule = rules.get(frame.cameraDirection);
    if (!rule) issues.push(`${frame.frameId}: missing direction rule for ${frame.cameraDirection}`);
    if (frame.equipmentId !== value.canonicalEquipment.equipmentId) issues.push(`${frame.frameId}: equipment identity changed`);
    if (frame.carryingSide !== value.canonicalEquipment.carryingSide) issues.push(`${frame.frameId}: anatomical carrying side changed`);
    if (!boundsValid(frame.subjectBounds) || !pointValid(frame.subjectCentroid) || !contains(frame.subjectBounds, frame.subjectCentroid)) issues.push(`${frame.frameId}: invalid subject geometry`);
    if (!boundsValid(frame.equipmentBounds) || !pointValid(frame.equipmentCentroid) || !contains(frame.equipmentBounds, frame.equipmentCentroid)) issues.push(`${frame.frameId}: invalid equipment geometry`);
    if (!pointValid(frame.pivot) || !unit(frame.groundLine)) issues.push(`${frame.frameId}: invalid registration geometry`);
    if (!finite(frame.equipmentRotationDegrees) || frame.equipmentRotationDegrees < -180 || frame.equipmentRotationDegrees > 180
      || !unit(frame.equipmentScaleFraction) || frame.equipmentScaleFraction === 0) issues.push(`${frame.frameId}: invalid equipment rotation or scale`);
    if (!finite(frame.cameraVector.x) || !finite(frame.cameraVector.y) || vectorLength(frame.cameraVector) === 0
      || !finite(frame.equipmentOuterNormal.x) || !finite(frame.equipmentOuterNormal.y) || vectorLength(frame.equipmentOuterNormal) === 0) issues.push(`${frame.frameId}: camera and equipment vectors must be non-zero`);
    if (!frame.occlusion.trim()) issues.push(`${frame.frameId}: occlusion declaration is required`);
    if (!frame.reviewer.trim() || !frame.reviewedAt.trim()) issues.push(`${frame.frameId}: named dated review is required`);
    if (frame.status === "rejected" && !frame.reason?.trim()) issues.push(`${frame.frameId}: rejection reason is required`);

    if (rule) {
      if (!rule.allowedVisibleFaces.includes(frame.visibleFace)) issues.push(`${frame.frameId}: visible face violates ${frame.cameraDirection} rule`);
      if (!rule.allowedScreenSides.includes(frame.equipmentScreenSide)) issues.push(`${frame.frameId}: screen placement violates ${frame.cameraDirection} rule`);
      if (frame.visibleFace !== "occluded" && inferredFace(frame, rule.minimumFaceDotMagnitude) !== frame.visibleFace) issues.push(`${frame.frameId}: visible face disagrees with camera and equipment plane`);
      if (axisAngularDistance(frame.equipmentRotationDegrees, rule.expectedRotationDegrees) > rule.maximumRotationErrorDegrees) issues.push(`${frame.frameId}: equipment rotation violates ${frame.cameraDirection} rule`);
    }
    if (frame.equipmentScreenSide !== "occluded") {
      const delta = frame.equipmentCentroid.x - frame.subjectCentroid.x;
      const measuredSide: MeasuredScreenSide = Math.abs(delta) <= 0.03 ? "centre" : delta < 0 ? "left" : "right";
      if (measuredSide !== frame.equipmentScreenSide) issues.push(`${frame.frameId}: declared screen side disagrees with measured placement`);
    }
    if (frame.attachmentVisible && (!frame.attachmentPoint || !contains(frame.equipmentBounds, frame.attachmentPoint))) issues.push(`${frame.frameId}: visible attachment point must lie on equipment`);
    if (frame.gripVisible && (!frame.gripPoint || !contains(frame.equipmentBounds, frame.gripPoint))) issues.push(`${frame.frameId}: visible grip point must lie on equipment`);
    if (frame.attachmentVisible && frame.gripVisible && frame.attachmentPoint && frame.gripPoint
      && distance(frame.attachmentPoint, frame.gripPoint) > value.thresholds.maximumGripAttachmentDistance) issues.push(`${frame.frameId}: grip is disconnected from attachment geometry`);
    if (frame.shieldPlane === "side-carry" && frame.visibleFace === "inner") {
      if (!frame.attachmentVisible) issues.push(`${frame.frameId}: inner side-carry must show arm attachment`);
      if (!frame.gripVisible) issues.push(`${frame.frameId}: inner side-carry must show the controlling grip`);
      if (frame.strapRouting !== "consistent") issues.push(`${frame.frameId}: inner side-carry must declare consistent strap routing`);
    }
    if (frame.visibleFace === "outer" && frame.strapRouting === "consistent") issues.push(`${frame.frameId}: outward face cannot expose inner strap routing`);
    const observed = new Set(frame.observedDetailIds);
    const occluded = new Set(frame.occludedDetailIds);
    for (const detail of value.canonicalEquipment.requiredDetailIds) {
      if (!observed.has(detail) && !occluded.has(detail)) issues.push(`${frame.frameId}: missing canonical detail ${detail}`);
    }
    const style = frame.styleEvidence;
    if (style.paletteDistanceFromCanonical > value.thresholds.maximumPaletteDistance) issues.push(`${frame.frameId}: palette drift exceeds threshold`);
    if (style.lineDensityFractionChange > value.thresholds.maximumLineDensityFractionChange) issues.push(`${frame.frameId}: line-density drift exceeds threshold`);
    if (style.bodyScaleFractionChange > value.thresholds.maximumBodyScaleFractionChange) issues.push(`${frame.frameId}: body-scale drift exceeds threshold`);
    if (style.pivotShiftFromCanonical > value.thresholds.maximumPivotShift) issues.push(`${frame.frameId}: pivot drift exceeds threshold`);
    if (style.centroidAlignedSilhouetteIoU < value.thresholds.minimumCentroidAlignedSilhouetteIoU) issues.push(`${frame.frameId}: silhouette identity drift exceeds threshold`);
  }
  for (const frames of ordered.values()) {
    frames.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    for (let index = 1; index < frames.length; index += 1) {
      const before = frames[index - 1];
      const after = frames[index];
      if (axisAngularDistance(before.equipmentRotationDegrees, after.equipmentRotationDegrees) > value.thresholds.maximumFrameRotationDeltaDegrees) issues.push(`${after.frameId}: implausible equipment rotation jump from ${before.frameId}`);
      const scaleChange = Math.abs(after.equipmentScaleFraction - before.equipmentScaleFraction) / before.equipmentScaleFraction;
      if (scaleChange > value.thresholds.maximumFrameScaleFractionChange) issues.push(`${after.frameId}: implausible equipment scale jump from ${before.frameId}`);
    }
  }
  return issues;
}

export function assertDirectionalEquipmentContinuityV2(value: DirectionalEquipmentContinuityContractV2): void {
  const issues = validateDirectionalEquipmentContinuityV2(value);
  if (issues.length) throw new Error(`Directional equipment continuity v2 failed:\n- ${issues.join("\n- ")}`);
}
