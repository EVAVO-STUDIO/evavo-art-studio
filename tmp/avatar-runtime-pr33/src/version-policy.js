export const AVATAR_RUNTIME_VERSION_FLOORS = Object.freeze({
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

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export function parseAvatarRuntimeVersion(value, label = "version") {
  if (typeof value !== "string") {
    throw new Error(`EVAVO_AVATAR_RUNTIME_VERSION_INVALID:${label}`);
  }
  const match = VERSION_PATTERN.exec(value);
  if (!match) {
    throw new Error(`EVAVO_AVATAR_RUNTIME_VERSION_INVALID:${label}`);
  }
  return Object.freeze(match.slice(1).map(Number));
}

export function compareAvatarRuntimeVersions(leftValue, rightValue) {
  const left = parseAvatarRuntimeVersion(leftValue, "left");
  const right = parseAvatarRuntimeVersion(rightValue, "right");
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

export function assertAvatarRuntimeVersionAtLeast(
  actual,
  minimum,
  capability = "avatar-runtime",
) {
  if (compareAvatarRuntimeVersions(actual, minimum) < 0) {
    throw new Error(
      `EVAVO_AVATAR_RUNTIME_VERSION_TOO_OLD:${capability}:minimum=${minimum}:actual=${actual}`,
    );
  }
  return actual;
}
