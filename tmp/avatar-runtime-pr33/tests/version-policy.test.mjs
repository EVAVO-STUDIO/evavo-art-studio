import assert from "node:assert/strict";
import test from "node:test";

import {
  AVATAR_RUNTIME_VERSION_FLOORS,
  assertAvatarRuntimeVersionAtLeast,
  compareAvatarRuntimeVersions,
  parseAvatarRuntimeVersion,
} from "../src/version-policy.js";

const EXPECTED_FLOORS = Object.freeze({
  promotion: "0.6.1",
  reviewedSequence: "0.7.0",
  artStudioProducer: "0.9.0",
  productionOrchestration: "0.11.0",
  rawFrameGovernance: "0.12.1",
  agentControl: "0.15.0",
  sourceRepair: "0.16.0",
  temporalBridge: "0.17.0",
  visemeCalibration: "0.18.0",
  visemeStability: "0.19.0",
  browserBoundaryVisemes: "0.20.0",
  approvedAudioTiming: "0.21.0",
  sourceRepairArtStudio: "0.22.0",
  sourceRepairAlphaMastering: "0.23.0",
  backgroundTransparency: "0.24.0",
  naturalSpeech: "0.25.0",
  professionalAvatarAnimation: "0.25.0",
  performanceRuntime: "0.26.0",
  performanceVariation: "0.27.0",
  topHatProductionRuntime: "0.28.0",
  artStudioAtlasAdmission: "0.29.0",
  topHatNativeAlphaRig: "0.30.1",
  topHatNativeChatRuntime: "0.31.0",
  renderRuntime: "0.32.0",
  displayCadence: "0.33.0",
  topHatBodyPoseBank: "0.34.0",
  evaIdentityLockedRig: "0.35.0",
  evaIdentityMotionRig: "0.36.0",
  evaDenseMotionAdmission: "0.37.0",
  topHatPoseBankPublication: "0.38.0",
  councilProceduralReviewRuntime: "0.39.0",
  completeRuntime: "0.39.0",
});

test("semantic version policy pins every capability floor through Runtime 0.39", () => {
  assert.deepEqual(AVATAR_RUNTIME_VERSION_FLOORS, EXPECTED_FLOORS);
  assert.deepEqual(parseAvatarRuntimeVersion("0.39.0"), [0, 39, 0]);
  assert.equal(compareAvatarRuntimeVersions("0.39.0", "0.39.0"), 0);
  assert.equal(compareAvatarRuntimeVersions("0.40.0", "0.39.0"), 1);
  assert.equal(compareAvatarRuntimeVersions("1.0.0", "0.99.99"), 1);

  for (const [capability, minimum] of Object.entries(EXPECTED_FLOORS)) {
    assert.equal(
      assertAvatarRuntimeVersionAtLeast(minimum, minimum, capability),
      minimum,
    );
    assert.equal(
      assertAvatarRuntimeVersionAtLeast("1.0.0", minimum, capability),
      "1.0.0",
    );
  }

  assert.equal(
    assertAvatarRuntimeVersionAtLeast(
      "0.39.0",
      AVATAR_RUNTIME_VERSION_FLOORS.councilProceduralReviewRuntime,
      "council-procedural-review-runtime",
    ),
    "0.39.0",
  );
  assert.equal(
    assertAvatarRuntimeVersionAtLeast(
      "0.39.0",
      AVATAR_RUNTIME_VERSION_FLOORS.completeRuntime,
      "complete-runtime",
    ),
    "0.39.0",
  );
});

test("semantic version policy rejects stale, malformed and prerelease values", () => {
  for (const [actual, capability] of [
    ["0.38.9", "councilProceduralReviewRuntime"],
    ["0.38.9", "completeRuntime"],
    ["0.37.9", "topHatPoseBankPublication"],
    ["0.36.9", "evaDenseMotionAdmission"],
    ["0.35.9", "evaIdentityMotionRig"],
    ["0.34.9", "evaIdentityLockedRig"],
    ["0.33.9", "topHatBodyPoseBank"],
    ["0.32.9", "displayCadence"],
    ["0.31.9", "renderRuntime"],
    ["0.30.0", "topHatNativeAlphaRig"],
    ["0.23.9", "backgroundTransparency"],
    ["0.11.9", "rawFrameGovernance"],
  ]) {
    assert.throws(
      () =>
        assertAvatarRuntimeVersionAtLeast(
          actual,
          AVATAR_RUNTIME_VERSION_FLOORS[capability],
          capability,
        ),
      /EVAVO_AVATAR_RUNTIME_VERSION_TOO_OLD/u,
    );
  }

  for (const value of [
    "v0.39.0",
    "0.39",
    "0.39.0-beta.1",
    "00.39.0",
    "1.2.3.4",
    "",
    null,
  ]) {
    assert.throws(
      () => parseAvatarRuntimeVersion(value),
      /EVAVO_AVATAR_RUNTIME_VERSION_INVALID/u,
    );
  }
});
