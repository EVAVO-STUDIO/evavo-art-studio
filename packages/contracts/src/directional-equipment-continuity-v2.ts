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
  /** Screen side occupied by the anatomical hand that canonically carries the item. */
  allowedCarryingHandScreenSides?: Exclude<MeasuredScreenSide, "occluded">[];
}

export interface EquipmentDetailRuleV2 {
  detailId: string;
  allowedVisibleFaces: Exclude<MeasuredEquipmentFace, "occluded">[];
}

export interface EquipmentDetailObservationV2 {
  detailId: string;
  location: NormalizedPoint;
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
  /**
   * Optional reviewed centre of the character's body mass. Use this for
   * screen-side checks when a long weapon, cape, tail, or detached effect
   * materially pulls the whole-silhouette centroid away from the torso.
   */
  subjectBodyCentroid?: NormalizedPoint;
  equipmentBounds: NormalizedBounds;
  equipmentCentroid: NormalizedPoint;
  attachmentPoint: NormalizedPoint | null;
  gripPoint: NormalizedPoint | null;
  /** Reviewed landmarks bind equipment ownership to the correct anatomical limb. */
  carryingHandPoint?: NormalizedPoint | null;
  offHandPoint?: NormalizedPoint | null;
  carryingShoulderPoint?: NormalizedPoint | null;
  offShoulderPoint?: NormalizedPoint | null;
  attachmentVisible: boolean;
  gripVisible: boolean;
  strapRouting: "consistent" | "not-visible" | "not-applicable";
  shieldPlane: "side-carry" | "guard-forward" | "transition" | "not-applicable";
  cameraVector: DirectionVector;
  equipmentOuterNormal: DirectionVector;
  equipmentRotationDegrees: number;
  /** Mask-derived PCA axis confidence. Required when the contract sets a minimum. */
  equipmentRotationConfidence?: number;
  equipmentScaleFraction: number;
  pivot: NormalizedPoint;
  groundLine: number;
  observedDetailIds: string[];
  detailObservations?: EquipmentDetailObservationV2[];
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
    /** Prevent face-specific hardware or heraldry from appearing on the wrong plane. */
    detailRules?: EquipmentDetailRuleV2[];
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
    /** Reject whole-character scale pops between adjacent exposures. */
    maximumFrameSubjectAreaFractionChange?: number;
    /** Reject registration changes that make a character hop above the floor. */
    maximumFrameGroundLineDelta?: number;
    /** Reject body-core translation even when a weapon or cape changes silhouette extent. */
    maximumFrameBodyCentroidShift?: number;
    /** Reject equipment that teleports across the body between adjacent exposures. */
    maximumFrameEquipmentCentroidShift?: number;
    /** Reject unreliable PCA rotation evidence when a contract depends on measured axes. */
    minimumEquipmentRotationConfidence?: number;
    /** Grip must remain attached to the canonical carrying hand. */
    maximumGripToCarryingHandDistance?: number;
    /** Reject wrong-hand ownership when the off hand is materially closer to the grip. */
    minimumCarryingHandAdvantage?: number;
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
  for (const [name, threshold] of [
    ["maximumFrameSubjectAreaFractionChange", value.thresholds.maximumFrameSubjectAreaFractionChange],
    ["maximumFrameGroundLineDelta", value.thresholds.maximumFrameGroundLineDelta],
    ["maximumFrameBodyCentroidShift", value.thresholds.maximumFrameBodyCentroidShift],
    ["maximumFrameEquipmentCentroidShift", value.thresholds.maximumFrameEquipmentCentroidShift],
    ["minimumEquipmentRotationConfidence", value.thresholds.minimumEquipmentRotationConfidence],
    ["maximumGripToCarryingHandDistance", value.thresholds.maximumGripToCarryingHandDistance],
    ["minimumCarryingHandAdvantage", value.thresholds.minimumCarryingHandAdvantage],
  ] as const) {
    if (threshold !== undefined && (!unit(threshold) || threshold === 0)) issues.push(`${name} must be within (0, 1]`);
  }

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
    if (rule.allowedCarryingHandScreenSides !== undefined && !rule.allowedCarryingHandScreenSides.length) {
      issues.push(`${rule.cameraDirection}: allowedCarryingHandScreenSides cannot be empty`);
    }
  }

  const detailRules = new Map<string, EquipmentDetailRuleV2>();
  for (const detailRule of value.canonicalEquipment.detailRules ?? []) {
    if (!value.canonicalEquipment.requiredDetailIds.includes(detailRule.detailId)) issues.push(`detail rule is not canonical: ${detailRule.detailId}`);
    if (detailRules.has(detailRule.detailId)) issues.push(`duplicate detail rule: ${detailRule.detailId}`);
    detailRules.set(detailRule.detailId, detailRule);
    if (!detailRule.allowedVisibleFaces.length) issues.push(`${detailRule.detailId}: allowedVisibleFaces cannot be empty`);
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
    if (frame.subjectBodyCentroid && (!pointValid(frame.subjectBodyCentroid) || !contains(frame.subjectBounds, frame.subjectBodyCentroid))) issues.push(`${frame.frameId}: invalid subject body centroid`);
    for (const [name, point] of [
      ["carrying hand", frame.carryingHandPoint],
      ["off hand", frame.offHandPoint],
      ["carrying shoulder", frame.carryingShoulderPoint],
      ["off shoulder", frame.offShoulderPoint],
    ] as const) {
      if (point !== undefined && point !== null && (!pointValid(point) || !contains(frame.subjectBounds, point))) issues.push(`${frame.frameId}: invalid ${name} landmark`);
    }
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
      if (
        frame.visibleFace !== "occluded" && frame.equipmentScreenSide !== "occluded" &&
        axisAngularDistance(frame.equipmentRotationDegrees, rule.expectedRotationDegrees) > rule.maximumRotationErrorDegrees
      ) issues.push(`${frame.frameId}: equipment rotation violates ${frame.cameraDirection} rule`);
      if (rule.allowedCarryingHandScreenSides !== undefined && frame.carryingHandPoint) {
        const body = frame.subjectBodyCentroid ?? frame.subjectCentroid;
        const delta = frame.carryingHandPoint.x - body.x;
        const handSide: Exclude<MeasuredScreenSide, "occluded"> = Math.abs(delta) <= 0.03 ? "centre" : delta < 0 ? "left" : "right";
        if (!rule.allowedCarryingHandScreenSides.includes(handSide)) issues.push(`${frame.frameId}: carrying hand is on the wrong screen side for ${frame.cameraDirection}`);
      }
    }
    if (value.thresholds.minimumEquipmentRotationConfidence !== undefined) {
      const confidence = frame.equipmentRotationConfidence;
      if (confidence === undefined || !unit(confidence)) issues.push(`${frame.frameId}: valid equipment rotation confidence is required`);
      else if (confidence < value.thresholds.minimumEquipmentRotationConfidence) issues.push(`${frame.frameId}: equipment rotation evidence is too ambiguous`);
    }
    if (frame.equipmentScreenSide !== "occluded") {
      // Whole-silhouette centroids are reliable for compact figures, but a
      // long spear or cape can move that centroid across a correctly carried
      // shield. A reviewed body centroid preserves measurable placement while
      // keeping appendage extent from producing a false side reversal.
      const placementReference = frame.subjectBodyCentroid ?? frame.subjectCentroid;
      const delta = frame.equipmentCentroid.x - placementReference.x;
      const measuredSide: MeasuredScreenSide = Math.abs(delta) <= 0.03 ? "centre" : delta < 0 ? "left" : "right";
      if (measuredSide !== frame.equipmentScreenSide) issues.push(`${frame.frameId}: declared screen side disagrees with measured placement`);
    }
    if (frame.attachmentVisible && (!frame.attachmentPoint || !contains(frame.equipmentBounds, frame.attachmentPoint))) issues.push(`${frame.frameId}: visible attachment point must lie on equipment`);
    if (frame.gripVisible && (!frame.gripPoint || !contains(frame.equipmentBounds, frame.gripPoint))) issues.push(`${frame.frameId}: visible grip point must lie on equipment`);
    if (frame.attachmentVisible && frame.gripVisible && frame.attachmentPoint && frame.gripPoint
      && distance(frame.attachmentPoint, frame.gripPoint) > value.thresholds.maximumGripAttachmentDistance) issues.push(`${frame.frameId}: grip is disconnected from attachment geometry`);
    if (value.thresholds.maximumGripToCarryingHandDistance !== undefined && frame.gripVisible) {
      if (!frame.gripPoint || !frame.carryingHandPoint) issues.push(`${frame.frameId}: visible grip requires a carrying-hand landmark`);
      else if (distance(frame.gripPoint, frame.carryingHandPoint) > value.thresholds.maximumGripToCarryingHandDistance) issues.push(`${frame.frameId}: grip is disconnected from the canonical carrying hand`);
    }
    if (value.thresholds.minimumCarryingHandAdvantage !== undefined && frame.gripVisible && frame.gripPoint && frame.carryingHandPoint && frame.offHandPoint) {
      const carryingDistance = distance(frame.gripPoint, frame.carryingHandPoint);
      const offHandDistance = distance(frame.gripPoint, frame.offHandPoint);
      if (offHandDistance - carryingDistance < value.thresholds.minimumCarryingHandAdvantage) issues.push(`${frame.frameId}: grip ownership is ambiguous or assigned to the wrong hand`);
    }
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
    const observationIds = new Set<string>();
    for (const observation of frame.detailObservations ?? []) {
      if (observationIds.has(observation.detailId)) issues.push(`${frame.frameId}: duplicate detail observation ${observation.detailId}`);
      observationIds.add(observation.detailId);
      if (!observed.has(observation.detailId)) issues.push(`${frame.frameId}: detail observation is not declared visible: ${observation.detailId}`);
      if (!pointValid(observation.location) || !contains(frame.equipmentBounds, observation.location)) issues.push(`${frame.frameId}: detail ${observation.detailId} lies outside equipment geometry`);
      const detailRule = detailRules.get(observation.detailId);
      if (detailRule && frame.visibleFace !== "occluded" && !detailRule.allowedVisibleFaces.includes(frame.visibleFace)) issues.push(`${frame.frameId}: detail ${observation.detailId} appears on the wrong equipment face`);
    }
    for (const detailId of observed) {
      if (detailRules.has(detailId) && !observationIds.has(detailId)) issues.push(`${frame.frameId}: face-specific detail requires a measured observation: ${detailId}`);
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
      // A reviewed occlusion only measures the surviving visible fragment. Its
      // PCA axis and area are not comparable with a fully visible equipment
      // plane, so resume temporal geometry checks at the next visible pair.
      if (
        before.visibleFace === "occluded" || after.visibleFace === "occluded" ||
        before.equipmentScreenSide === "occluded" || after.equipmentScreenSide === "occluded"
      ) continue;
      if (axisAngularDistance(before.equipmentRotationDegrees, after.equipmentRotationDegrees) > value.thresholds.maximumFrameRotationDeltaDegrees) issues.push(`${after.frameId}: implausible equipment rotation jump from ${before.frameId}`);
      const scaleChange = Math.abs(after.equipmentScaleFraction - before.equipmentScaleFraction) / before.equipmentScaleFraction;
      if (scaleChange > value.thresholds.maximumFrameScaleFractionChange) issues.push(`${after.frameId}: implausible equipment scale jump from ${before.frameId}`);
      const beforeArea = before.subjectBounds.width * before.subjectBounds.height;
      const afterArea = after.subjectBounds.width * after.subjectBounds.height;
      const subjectAreaChange = Math.abs(afterArea - beforeArea) / beforeArea;
      if (value.thresholds.maximumFrameSubjectAreaFractionChange !== undefined
        && subjectAreaChange > value.thresholds.maximumFrameSubjectAreaFractionChange) {
        issues.push(`${after.frameId}: implausible subject scale jump from ${before.frameId}`);
      }
      if (value.thresholds.maximumFrameGroundLineDelta !== undefined
        && Math.abs(after.groundLine - before.groundLine) > value.thresholds.maximumFrameGroundLineDelta) {
        issues.push(`${after.frameId}: implausible ground-line jump from ${before.frameId}`);
      }
      const beforeBody = before.subjectBodyCentroid ?? before.subjectCentroid;
      const afterBody = after.subjectBodyCentroid ?? after.subjectCentroid;
      if (value.thresholds.maximumFrameBodyCentroidShift !== undefined
        && distance(beforeBody, afterBody) > value.thresholds.maximumFrameBodyCentroidShift) {
        issues.push(`${after.frameId}: implausible body-core shift from ${before.frameId}`);
      }
      if (value.thresholds.maximumFrameEquipmentCentroidShift !== undefined
        && distance(before.equipmentCentroid, after.equipmentCentroid) > value.thresholds.maximumFrameEquipmentCentroidShift) {
        issues.push(`${after.frameId}: implausible equipment placement jump from ${before.frameId}`);
      }
      const faceFlipped = (before.visibleFace === "outer" && after.visibleFace === "inner")
        || (before.visibleFace === "inner" && after.visibleFace === "outer");
      if (faceFlipped && before.shieldPlane !== "transition" && after.shieldPlane !== "transition") {
        issues.push(`${after.frameId}: equipment face flipped without a declared transition from ${before.frameId}`);
      }
    }
  }
  return issues;
}

export function assertDirectionalEquipmentContinuityV2(value: DirectionalEquipmentContinuityContractV2): void {
  const issues = validateDirectionalEquipmentContinuityV2(value);
  if (issues.length) throw new Error(`Directional equipment continuity v2 failed:\n- ${issues.join("\n- ")}`);
}
