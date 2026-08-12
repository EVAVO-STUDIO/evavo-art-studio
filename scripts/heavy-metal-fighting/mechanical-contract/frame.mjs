import {
  asArray,
  asInteger,
  asObject,
  asPositiveNumber,
  asString,
  asTrue,
  assert,
  deepFreeze,
  normalizeStringArray,
  unique,
} from "./common.mjs";

function normalizeLandmarks(value, frameLabel, requiredLandmarkIds) {
  const landmarks = asArray(value, `${frameLabel}.landmarks`, requiredLandmarkIds.length).map((entry, index) => {
    const landmark = asObject(entry, `${frameLabel}.landmarks[${index}]`);
    return deepFreeze({
      id: asString(landmark.id, `${frameLabel}.landmarks[${index}].id`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      side: asString(landmark.side, `${frameLabel}.landmarks[${index}].side`, /^(left|right|centre)$/),
      attachment: asString(landmark.attachment, `${frameLabel}.landmarks[${index}].attachment`),
      stability: asString(landmark.stability, `${frameLabel}.landmarks[${index}].stability`),
    });
  });
  unique(landmarks.map((landmark) => landmark.id), `${frameLabel}.landmark ids`);
  const observed = new Set(landmarks.map((landmark) => landmark.id));
  for (const required of requiredLandmarkIds) {
    assert(observed.has(required), `${frameLabel} is missing required landmark ${required}.`);
  }
  for (const pair of [
    ["left-shoulder", "right-shoulder"],
    ["left-elbow", "right-elbow"],
    ["left-wrist-mount", "right-wrist-mount"],
    ["left-hip", "right-hip"],
    ["left-knee", "right-knee"],
    ["left-ankle", "right-ankle"],
    ["left-foot-contact", "right-foot-contact"],
  ]) {
    assert(observed.has(pair[0]) && observed.has(pair[1]), `${frameLabel} must retain the landmark pair ${pair.join(" / ")}.`);
  }
  return deepFreeze(landmarks);
}

function normalizeHardpoints(value, frameLabel, landmarkIds) {
  const hardpoints = asArray(value, `${frameLabel}.hardpoints`, 1).map((entry, index) => {
    const hardpoint = asObject(entry, `${frameLabel}.hardpoints[${index}]`);
    return deepFreeze({
      id: asString(hardpoint.id, `${frameLabel}.hardpoints[${index}].id`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      side: asString(hardpoint.side, `${frameLabel}.hardpoints[${index}].side`, /^(left|right|centre)$/),
      attachment: asString(hardpoint.attachment, `${frameLabel}.hardpoints[${index}].attachment`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      clearance: asString(hardpoint.clearance, `${frameLabel}.hardpoints[${index}].clearance`),
    });
  });
  unique(hardpoints.map((hardpoint) => hardpoint.id), `${frameLabel}.hardpoint ids`);
  const knownAttachments = new Set([...landmarkIds, ...hardpoints.map((hardpoint) => hardpoint.id)]);
  for (const hardpoint of hardpoints) {
    assert(knownAttachments.has(hardpoint.attachment), `${frameLabel}.${hardpoint.id} references unknown attachment ${hardpoint.attachment}.`);
  }
  return deepFreeze(hardpoints);
}

function normalizeAsymmetry(value, frameLabel) {
  const asymmetry = asArray(value, `${frameLabel}.asymmetry`).map((entry, index) => {
    const component = asObject(entry, `${frameLabel}.asymmetry[${index}]`);
    return deepFreeze({
      id: asString(component.id, `${frameLabel}.asymmetry[${index}].id`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      side: asString(component.side, `${frameLabel}.asymmetry[${index}].side`, /^(left|right|centre)$/),
      mirrorTreatment: asString(component.mirrorTreatment, `${frameLabel}.asymmetry[${index}].mirrorTreatment`),
    });
  });
  unique(asymmetry.map((component) => component.id), `${frameLabel}.asymmetry ids`);
  return deepFreeze(asymmetry);
}

export function normalizeFrame(value, index, requiredLandmarkIds) {
  const frame = asObject(value, `frames[${index}]`);
  const label = `frames[${index}]`;
  const pilot = asObject(frame.pilot, `${label}.pilot`);
  const landmarks = normalizeLandmarks(frame.landmarks, label, requiredLandmarkIds);
  const hardpoints = normalizeHardpoints(frame.hardpoints, label, landmarks.map((landmark) => landmark.id));
  const asymmetry = normalizeAsymmetry(frame.asymmetry, label);
  const mirrorPolicy = asObject(frame.mirrorPolicy, `${label}.mirrorPolicy`);
  const boundary = asObject(frame.bodyEffectBoundary, `${label}.bodyEffectBoundary`);
  const bodyOwned = normalizeStringArray(boundary.bodyOwned, `${label}.bodyEffectBoundary.bodyOwned`);
  const effectOwned = normalizeStringArray(boundary.effectOwned, `${label}.bodyEffectBoundary.effectOwned`);
  const overlap = bodyOwned.filter((entry) => effectOwned.includes(entry));
  assert(overlap.length === 0, `${label} body/effect ownership overlaps: ${overlap.join(", ")}.`);
  const mode = asString(mirrorPolicy.mode, `${label}.mirrorPolicy.mode`);
  if (asymmetry.length > 0) {
    assert(mode !== "runtime-mirror-safe", `${label} declares asymmetry but uses an unconditional mirror-safe mode.`);
  }
  return deepFreeze({
    id: asString(frame.id, `${label}.id`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    code: asString(frame.code, `${label}.code`),
    epithet: asString(frame.epithet, `${label}.epithet`),
    class: asString(frame.class, `${label}.class`),
    pilot: deepFreeze({
      id: asString(pilot.id, `${label}.pilot.id`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      name: asString(pilot.name, `${label}.pilot.name`),
      handle: asString(pilot.handle, `${label}.pilot.handle`),
      affiliation: asString(pilot.affiliation, `${label}.pilot.affiliation`),
    }),
    crewRequirement: asInteger(frame.crewRequirement, `${label}.crewRequirement`, 1),
    targetHeightMeters: asPositiveNumber(frame.targetHeightMeters, `${label}.targetHeightMeters`),
    core: asString(frame.core, `${label}.core`),
    motionIdentity: asString(frame.motionIdentity, `${label}.motionIdentity`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    silhouetteLocks: normalizeStringArray(frame.silhouetteLocks, `${label}.silhouetteLocks`, 4),
    materialRamps: normalizeStringArray(frame.materialRamps, `${label}.materialRamps`, 4),
    landmarks,
    hardpoints,
    asymmetry,
    mirrorPolicy: deepFreeze({
      mode,
      requiredReview: asTrue(mirrorPolicy.requiredReview, `${label}.mirrorPolicy.requiredReview`),
      rules: normalizeStringArray(mirrorPolicy.rules, `${label}.mirrorPolicy.rules`, 2),
    }),
    bodyEffectBoundary: deepFreeze({
      bodyOwned,
      effectOwned,
      forbidden: normalizeStringArray(boundary.forbidden, `${label}.bodyEffectBoundary.forbidden`, 2),
    }),
    motionRules: normalizeStringArray(frame.motionRules, `${label}.motionRules`, 3),
  });
}

