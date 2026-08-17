import assert from "node:assert/strict";
import test from "node:test";

import {
  EVA_IDENTITY_MOTION_PLAN_SCHEMA,
  EVA_IDENTITY_MOTION_RELEASE_SCHEMA,
  compileEvaIdentityMotionRelease,
  evaIdentityMotionCapabilities,
  evaIdentityMotionReleaseRequest,
} from "./project-art/eva-identity-motion-release.mjs";

test("compiles the exact Runtime 0.36 identity-motion family", () => {
  const plan = compileEvaIdentityMotionRelease(
    evaIdentityMotionReleaseRequest(),
  );
  assert.equal(plan.schema, EVA_IDENTITY_MOTION_PLAN_SCHEMA);
  assert.equal(plan.runtime.version, "0.36.0");
  assert.equal(
    plan.runtime.commit,
    "b9cbbcd6d885cb38e3378b5fe7512773868fb7bd",
  );
  assert.deepEqual(plan.loopOrder, [
    "previous",
    "middle",
    "following",
    "middle",
  ]);
  assert.equal(plan.frames.length, 3);
  assert.equal(plan.displayTargetFps, 60);
  assert.equal(plan.interpolation, "smootherstep-crossfade");
});

test("admits only one native-resolution alpha-ready identity family", () => {
  const plan = compileEvaIdentityMotionRelease(
    evaIdentityMotionReleaseRequest(),
  );
  assert.equal(plan.sourceFamilyCount, 1);
  assert.equal(plan.nativeResolution, true);
  assert.equal(plan.alphaReady, true);
  assert.ok(plan.maximumFaceCenterShiftPixels < 8);
  assert.equal(plan.maximumPhashHammingDistance, 6);
  assert.equal(plan.identityConsistent, true);
  assert.equal(plan.technicalAdmission, true);
});

test("keeps body cadence independent from matched mouth texture motion", () => {
  const plan = compileEvaIdentityMotionRelease(
    evaIdentityMotionReleaseRequest(),
  );
  assert.equal(plan.matchedMouthTextureCrossfade, true);
  assert.equal(plan.fullBodyVisemeSwitchingAllowed, false);
  assert.equal(plan.lowResolutionAtlasPrimaryAllowed, false);
  assert.equal(plan.independentCreativeApprovalPerformed, false);
  assert.equal(plan.runtimeActivationAllowed, false);
});

test("rejects asset, runtime and authority drift", () => {
  const request = evaIdentityMotionReleaseRequest();
  assert.equal(request.schema, EVA_IDENTITY_MOTION_RELEASE_SCHEMA);
  assert.throws(() =>
    compileEvaIdentityMotionRelease({
      ...request,
      frames: request.frames.map((frame, index) =>
        index === 1 ? { ...frame, version: 1 } : frame,
      ),
    }),
  );
  assert.throws(() =>
    compileEvaIdentityMotionRelease({
      ...request,
      runtime: { ...request.runtime, commit: "0".repeat(40) },
    }),
  );
  assert.throws(() =>
    compileEvaIdentityMotionRelease({
      ...request,
      authority: { ...request.authority, runtimeActivation: true },
    }),
  );
});

test("capabilities expose technical evidence without widening authority", () => {
  const capabilities = evaIdentityMotionCapabilities();
  assert.equal(capabilities.identityFrameCount, 3);
  assert.equal(capabilities.sourceFamilyCount, 1);
  assert.equal(capabilities.sourceResolution, "1024x1536");
  assert.equal(capabilities.maximumPhashHammingDistance, 6);
  assert.equal(capabilities.technicalAdmission, true);
  assert.equal(capabilities.fakeTransparencyAllowed, false);
  assert.ok(
    Object.values(capabilities.authority).every((value) => value === false),
  );
});
