#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAnimationCharacterFamilyPlanIntegrity,
  compileAnimationCharacterFamilyPlan,
  compileAnimationCharacterFamilyStatus,
  describeAnimationCharacterFamilyV1,
} from "../tools/animation_character_family_v1.mjs";

function request(overrides = {}) {
  const base = {
    schema: "evavo.animation-character-family.request.v1",
    protocolVersion: "2026-09-01.2",
    familyId: "hero-family",
    revision: 1,
    projectId: "hero-project",
    title: "Hero animation family",
    subject: {
      subjectId: "hero",
      identityLockId: "hero-identity",
      identityRevision: 1,
      identityReferenceArtifactId: `artifact_${"a".repeat(64)}`,
      asymmetricVisualAnchors: [],
      mirrorPolicy: "safe-horizontal"
    },
    style: {
      styleId: "hero-style",
      styleRevision: 1,
      paletteLockId: "hero-palette",
      motionStyle: "pixel-90s",
      lineTreatment: "Crisp authored pixel clusters.",
      antiGenericTraits: ["specific silhouette", "weighted timing", "purposeful frame economy"],
      exclusions: ["rubbery tweening", "generic posing", "camera drift"]
    },
    camera: {
      profileId: "side-camera",
      perspective: "side-stage",
      projection: "orthographic",
      motion: "locked",
      yawDegrees: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
      scale: 1,
      groundLineNormalized: 0.8,
      movementPlane: "screen-x-ground-y",
      framing: "Full character."
    },
    delivery: {
      canvas: { width: 128, height: 128 },
      pivot: { x: 0.5, y: 0.82 },
      alphaRequired: true,
      trim: false,
      textureFiltering: "nearest",
      targets: ["godot-sprite"]
    },
    coverage: {
      preset: "custom",
      actions: ["idle", "walk"],
      directionalResolution: "perspective-default",
      allowMirroredCoverage: true,
      preferredSourceDirection: "right",
      noMirrorActions: [],
      cycleFrames: { idle: 8, walk: 8 }
    },
    timing: {
      playbackFpsPolicy: "uniform",
      preferredPlaybackFps: 12,
      maximumTransitionGapFrames: 2,
      locomotionSyncMode: "cyclic-constant"
    }
  };
  return { ...base, ...overrides };
}

test("describes a non-mutating family authority boundary", () => {
  const description = describeAnimationCharacterFamilyV1();
  assert.equal(description.protocolVersion, "2026-09-01.2");
  assert.equal(description.authority.providerExecution, false);
  assert.equal(description.authority.creativeApproval, false);
  assert.equal(description.authority.runtimeActivation, false);
  assert.equal(description.authority.publication, false);
});

test("side-stage family authors one direction and derives the safe mirror", () => {
  const plan = compileAnimationCharacterFamilyPlan(request());
  assert.equal(plan.summary.actions, 2);
  assert.equal(plan.summary.directions, 2);
  assert.equal(plan.summary.authoredSourceSlots, 2);
  assert.equal(plan.summary.mirroredDerivedSlots, 2);
  assertAnimationCharacterFamilyPlanIntegrity(plan);
});

test("missing source clips produce only exact targeted work", () => {
  const plan = compileAnimationCharacterFamilyPlan(request());
  const status = compileAnimationCharacterFamilyStatus({ plan, clips: [] });
  assert.equal(status.status, "production-required");
  assert.deepEqual(status.missingSourceSlots, ["idle:right:primary", "walk:right:primary"]);
  assert.deepEqual(status.nextWork.map((item) => item.kind), ["produce-clip", "produce-clip"]);
  assert.equal(status.authority.artifactPromotion, false);
});

test("asymmetric visual anchors forbid false horizontal mirroring", () => {
  assert.throws(
    () => compileAnimationCharacterFamilyPlan(request({
      subject: {
        ...request().subject,
        asymmetricVisualAnchors: ["shield on left arm"]
      }
    })),
    /MIRROR/u
  );
});

test("top-down octant coverage remains authored when mirroring is disabled", () => {
  const source = request();
  const plan = compileAnimationCharacterFamilyPlan({
    ...source,
    subject: { ...source.subject, mirrorPolicy: "forbidden" },
    camera: {
      ...source.camera,
      profileId: "top-camera",
      perspective: "top-down",
      movementPlane: "world-xz"
    },
    coverage: {
      ...source.coverage,
      actions: ["walk"],
      directionalResolution: "octant-8",
      allowMirroredCoverage: false,
      preferredSourceDirection: "right",
      cycleFrames: { walk: 8 }
    }
  });
  assert.equal(plan.summary.directions, 8);
  assert.equal(plan.summary.authoredSourceSlots, 8);
  assert.equal(plan.summary.mirroredDerivedSlots, 0);
});

test("content-addressed plans reject tampering", () => {
  const plan = compileAnimationCharacterFamilyPlan(request());
  const tampered = structuredClone(plan);
  tampered.title = "Changed after compilation";
  assert.throws(() => assertAnimationCharacterFamilyPlanIntegrity(tampered), /DIGEST/u);
});
