import { assert } from "./rally-25d-program-common.mjs";

export const RALLY_VERTICAL_SLICE_PROGRAM_ID = "rally-vertical-slice-v1";
export const LEGACY_RALLY_VERTICAL_SLICE_ASSET_IDS = Object.freeze({
  "debris-burst-production-v1": "crash-debris-production-v1",
});

export const CANONICAL_RALLY_VERTICAL_SLICE_ASSETS = Object.freeze([
  { assetFamily: "vehicle", assetId: "falcon-rally-production-v1", subjectId: "falcon-rally", phase: "core", priority: 10, dependencies: [], requiredForPlayable: true },
  { assetFamily: "environment", assetId: "forest-stage-production-v1", subjectId: "forest-stage", phase: "core", priority: 20, dependencies: [], requiredForPlayable: true },
  { assetFamily: "structure", assetId: "timber-bridge-production-v1", subjectId: "timber-bridge", phase: "core", priority: 30, dependencies: ["forest-stage-production-v1"], requiredForPlayable: true },
  { assetFamily: "prop", assetId: "road-sign-production-v1", subjectId: "road-sign", phase: "support", priority: 40, dependencies: ["forest-stage-production-v1"], requiredForPlayable: true },
  { assetFamily: "prop", assetId: "guardrail-production-v1", subjectId: "guardrail", phase: "support", priority: 41, dependencies: ["forest-stage-production-v1"], requiredForPlayable: true },
  { assetFamily: "character", assetId: "marshal-production-v1", subjectId: "marshal", phase: "support", priority: 50, dependencies: ["forest-stage-production-v1"], requiredForPlayable: true },
  { assetFamily: "fauna", assetId: "bird-flock-production-v1", subjectId: "bird-flock", phase: "support", priority: 60, dependencies: ["forest-stage-production-v1"], requiredForPlayable: false },
  { assetFamily: "vfx", assetId: "dust-trail-production-v1", subjectId: "dust-trail", phase: "effects", priority: 70, dependencies: ["falcon-rally-production-v1", "forest-stage-production-v1"], requiredForPlayable: true },
  { assetFamily: "vfx", assetId: "gravel-spray-production-v1", subjectId: "gravel-spray", phase: "effects", priority: 71, dependencies: ["falcon-rally-production-v1", "forest-stage-production-v1"], requiredForPlayable: true },
  { assetFamily: "vfx", assetId: "skid-smoke-production-v1", subjectId: "skid-smoke", phase: "effects", priority: 72, dependencies: ["falcon-rally-production-v1"], requiredForPlayable: true },
  { assetFamily: "vfx", assetId: "glass-burst-production-v1", subjectId: "glass-burst", phase: "effects", priority: 73, dependencies: ["falcon-rally-production-v1"], requiredForPlayable: true },
  { assetFamily: "vfx", assetId: "engine-smoke-production-v1", subjectId: "engine-smoke", phase: "effects", priority: 74, dependencies: ["falcon-rally-production-v1"], requiredForPlayable: true },
  { assetFamily: "vfx", assetId: "crash-debris-production-v1", subjectId: "crash-debris", phase: "effects", priority: 75, dependencies: ["falcon-rally-production-v1"], requiredForPlayable: true },
]);

function equalArray(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((entry, index) => entry === right[index]);
}

export function assertCanonicalRallyVerticalSlice(programId, assets) {
  if (programId !== RALLY_VERTICAL_SLICE_PROGRAM_ID) return;
  assert(
    assets.length === CANONICAL_RALLY_VERTICAL_SLICE_ASSETS.length,
    `program ${programId} must retain exactly ${CANONICAL_RALLY_VERTICAL_SLICE_ASSETS.length} canonical assets.`,
  );
  for (const legacyId of Object.keys(LEGACY_RALLY_VERTICAL_SLICE_ASSET_IDS)) {
    assert(
      !assets.some((asset) => asset.assetId === legacyId),
      `program ${programId} contains legacy asset id ${legacyId}; use ${LEGACY_RALLY_VERTICAL_SLICE_ASSET_IDS[legacyId]}.`,
    );
  }
  for (let index = 0; index < CANONICAL_RALLY_VERTICAL_SLICE_ASSETS.length; index += 1) {
    const actual = assets[index];
    const expected = CANONICAL_RALLY_VERTICAL_SLICE_ASSETS[index];
    for (const key of ["assetFamily", "assetId", "subjectId", "phase", "priority", "requiredForPlayable"]) {
      assert(
        actual[key] === expected[key],
        `program ${programId} asset ${index} canonical ${key} drifted.`,
      );
    }
    assert(
      equalArray(actual.dependencies, expected.dependencies),
      `program ${programId} asset ${expected.assetId} canonical dependencies drifted.`,
    );
  }
}
