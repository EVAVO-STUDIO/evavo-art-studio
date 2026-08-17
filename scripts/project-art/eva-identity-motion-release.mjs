export const EVA_IDENTITY_MOTION_RELEASE_SCHEMA =
  "evavo.project-art-eva-identity-motion-release.v1";
export const EVA_IDENTITY_MOTION_PLAN_SCHEMA =
  "evavo.project-art-eva-identity-motion-plan.v1";

const RUNTIME = Object.freeze({
  repository: "EVAVO-STUDIO/evavo-avatar-runtime",
  version: "0.36.0",
  commit: "b9cbbcd6d885cb38e3378b5fe7512773868fb7bd",
  tree: "67b8a5a8e14af2409086438841bab2b7bc6908c8",
  rigSchema: "evavo_eva_identity_motion_rig_v2",
  presentationSchema: "evavo_eva_identity_motion_presentation_v2",
});

const FRAMES = Object.freeze([
  Object.freeze({
    id: "previous",
    assetId: "e4d2d49cc15b82371410c290fce81c34",
    publicId:
      "evavo/avatar-runtime/eva-female/identity-motion-v3/eva-motion-prev-v3",
    version: 1786925257,
    bytes: 1_513_753,
    etag: "8f84386280d95b55002e6f4b9ab825d9",
    width: 1024,
    height: 1536,
    faceRect: Object.freeze({ x: 385, y: 95, width: 230, height: 298 }),
    phash: "cc473b643326ce33",
    backgroundRemoval: "cloudinary-ai-complete",
    backgroundRemovalConfidence: 1,
    sourceFamily: "repair-eva-153620-05",
  }),
  Object.freeze({
    id: "middle",
    assetId: "fb2386c215a1465860b62704f447dedf",
    publicId:
      "evavo/avatar-runtime/eva-female/identity-motion-v3/eva-motion-mid-v3",
    version: 1786925270,
    bytes: 1_500_003,
    etag: "6c589e1b4015d5853a3d770ebadc6204",
    width: 1024,
    height: 1536,
    faceRect: Object.freeze({ x: 390, y: 101, width: 224, height: 288 }),
    phash: "cecb39643326cc33",
    backgroundRemoval: "cloudinary-ai-complete",
    backgroundRemovalConfidence: 1,
    sourceFamily: "repair-eva-153620-05",
  }),
  Object.freeze({
    id: "following",
    assetId: "f52a7af56eed431b498c5c2c09db3a6a",
    publicId:
      "evavo/avatar-runtime/eva-female/identity-motion-v3/eva-motion-next-v3",
    version: 1786925286,
    bytes: 1_494_995,
    etag: "de9cd259a30e4f07a02b5b3585efbbfd",
    width: 1024,
    height: 1536,
    faceRect: Object.freeze({ x: 385, y: 95, width: 230, height: 298 }),
    phash: "8ccf2b643326ce33",
    backgroundRemoval: "cloudinary-ai-complete",
    backgroundRemovalConfidence: 1,
    sourceFamily: "repair-eva-153620-05",
  }),
]);

const AUTHORITY = Object.freeze({
  providerExecution: false,
  sourceMutation: false,
  sourceDeletion: false,
  imageMutation: false,
  creativeApproval: false,
  candidatePromotion: false,
  repositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  deployment: false,
  publication: false,
  runtimeActivation: false,
  forcePush: false,
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function hamming(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    !/^[a-f0-9]{16}$/u.test(left) ||
    !/^[a-f0-9]{16}$/u.test(right)
  ) {
    fail("PROJECT_ART_EVA_IDENTITY_MOTION_PHASH_INVALID");
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    distance += (
      Number.parseInt(left[index], 16) ^
      Number.parseInt(right[index], 16)
    )
      .toString(2)
      .replaceAll("0", "").length;
  }
  return distance;
}

function centre(rect) {
  return Object.freeze({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  });
}

function exact(value, expected, code) {
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(code);
}

export function compileEvaIdentityMotionRelease(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("PROJECT_ART_EVA_IDENTITY_MOTION_REQUEST_INVALID");
  }
  exact(
    value,
    {
      schema: EVA_IDENTITY_MOTION_RELEASE_SCHEMA,
      characterId: "eva-female",
      runtime: RUNTIME,
      frames: FRAMES,
      loopOrder: ["previous", "middle", "following", "middle"],
      displayTargetFps: 60,
      interpolation: "smootherstep-crossfade",
      matchedMouthTextureCrossfade: true,
      authority: AUTHORITY,
    },
    "PROJECT_ART_EVA_IDENTITY_MOTION_REQUEST_INVALID",
  );

  const families = new Set(FRAMES.map((frame) => frame.sourceFamily));
  const firstCentre = centre(FRAMES[0].faceRect);
  let maximumFaceCenterShiftPixels = 0;
  let maximumPhashHammingDistance = 0;
  for (const frame of FRAMES) {
    const frameCentre = centre(frame.faceRect);
    maximumFaceCenterShiftPixels = Math.max(
      maximumFaceCenterShiftPixels,
      Math.hypot(
        frameCentre.x - firstCentre.x,
        frameCentre.y - firstCentre.y,
      ),
    );
    maximumPhashHammingDistance = Math.max(
      maximumPhashHammingDistance,
      hamming(FRAMES[0].phash, frame.phash),
    );
  }
  const nativeResolution = FRAMES.every(
    (frame) => frame.width === 1024 && frame.height === 1536,
  );
  const alphaReady = FRAMES.every(
    (frame) =>
      frame.backgroundRemoval === "cloudinary-ai-complete" &&
      frame.backgroundRemovalConfidence === 1,
  );
  const identityConsistent =
    families.size === 1 &&
    maximumFaceCenterShiftPixels < 8 &&
    maximumPhashHammingDistance <= 6;

  return Object.freeze({
    schema: EVA_IDENTITY_MOTION_PLAN_SCHEMA,
    characterId: "eva-female",
    runtime: RUNTIME,
    frames: FRAMES,
    loopOrder: Object.freeze([
      "previous",
      "middle",
      "following",
      "middle",
    ]),
    displayTargetFps: 60,
    interpolation: "smootherstep-crossfade",
    sourceFamilyCount: families.size,
    nativeResolution,
    alphaReady,
    maximumFaceCenterShiftPixels,
    maximumPhashHammingDistance,
    identityConsistent,
    matchedMouthTextureCrossfade: true,
    fullBodyVisemeSwitchingAllowed: false,
    lowResolutionAtlasPrimaryAllowed: false,
    technicalAdmission:
      nativeResolution && alphaReady && identityConsistent,
    independentCreativeApprovalPerformed: false,
    runtimeActivationAllowed: false,
    authority: AUTHORITY,
  });
}

export function evaIdentityMotionReleaseRequest() {
  return Object.freeze({
    schema: EVA_IDENTITY_MOTION_RELEASE_SCHEMA,
    characterId: "eva-female",
    runtime: RUNTIME,
    frames: FRAMES,
    loopOrder: Object.freeze([
      "previous",
      "middle",
      "following",
      "middle",
    ]),
    displayTargetFps: 60,
    interpolation: "smootherstep-crossfade",
    matchedMouthTextureCrossfade: true,
    authority: AUTHORITY,
  });
}

export function evaIdentityMotionCapabilities() {
  const plan = compileEvaIdentityMotionRelease(
    evaIdentityMotionReleaseRequest(),
  );
  return Object.freeze({
    schema: "evavo.project-art-eva-identity-motion-capabilities.v1",
    releaseSchema: EVA_IDENTITY_MOTION_RELEASE_SCHEMA,
    planSchema: EVA_IDENTITY_MOTION_PLAN_SCHEMA,
    runtimeVersion: RUNTIME.version,
    identityFrameCount: FRAMES.length,
    sourceFamilyCount: plan.sourceFamilyCount,
    sourceResolution: "1024x1536",
    maximumFaceCenterShiftPixels: plan.maximumFaceCenterShiftPixels,
    maximumPhashHammingDistance: plan.maximumPhashHammingDistance,
    technicalAdmission: plan.technicalAdmission,
    matchedMouthTextureCrossfade: true,
    fakeTransparencyAllowed: false,
    lowResolutionAtlasPrimaryAllowed: false,
    fullBodyVisemeSwitchingAllowed: false,
    authority: AUTHORITY,
  });
}
