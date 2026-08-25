import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";

import { renderAnimationPoseControlPng } from "../dist/index.js";

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function manifest(overrides = {}) {
  const body = {
    kind: "evavo.animation.pose-control",
    version: "2026-08-26.1",
    clipId: "hero-walk-right",
    frameId: "hero-walk-right:f002",
    frameNumber: 2,
    canvas: { width: 96, height: 128 },
    coordinateSpace: "normalized-0-1",
    landmarks: {
      head: { x: 0.5, y: 0.16, confidence: 1 },
      neck: { x: 0.5, y: 0.28, confidence: 1 },
      leftShoulder: { x: 0.4, y: 0.3, confidence: 1 },
      leftElbow: { x: 0.34, y: 0.44, confidence: 1 },
      leftHand: { x: 0.3, y: 0.56, confidence: 1 },
      rightShoulder: { x: 0.6, y: 0.3, confidence: 1 },
      rightElbow: { x: 0.66, y: 0.44, confidence: 1 },
      rightHand: { x: 0.7, y: 0.56, confidence: 1 },
      root: { x: 0.5, y: 0.56, confidence: 1 },
      leftHip: { x: 0.45, y: 0.58, confidence: 1 },
      leftKnee: { x: 0.4, y: 0.75, confidence: 1 },
      leftFoot: { x: 0.34, y: 0.92, confidence: 1 },
      rightHip: { x: 0.55, y: 0.58, confidence: 1 },
      rightKnee: { x: 0.6, y: 0.74, confidence: 1 },
      rightFoot: { x: 0.66, y: 0.9, confidence: 1 },
    },
    requiredLandmarkIds: ["root", "leftFoot", "rightFoot"],
    source: {
      kind: "authored",
      id: "director-authored-pose",
      version: "1",
      configSha256: "a".repeat(64),
    },
    authority: {
      providerExecution: false,
      creativeApproval: false,
      artifactPromotion: false,
      repositoryMutation: false,
      publication: false,
    },
    ...overrides,
  };
  return { ...body, manifestSha256: digest(body) };
}

test("renders an exact-canvas deterministic PNG bound to the semantic pose hash", async () => {
  const input = manifest();
  const first = await renderAnimationPoseControlPng(input);
  const second = await renderAnimationPoseControlPng(input);
  assert.equal(first.mediaType, "image/png");
  assert.equal(first.width, 96);
  assert.equal(first.height, 128);
  assert.equal(first.poseControlManifestSha256, input.manifestSha256);
  assert.equal(first.contentSha256, second.contentSha256);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(createHash("sha256").update(first.bytes).digest("hex"), first.contentSha256);
  const metadata = await sharp(first.bytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 96);
  assert.equal(metadata.height, 128);
  assert.equal(first.authority.creativeApproval, false);
});

test("different semantic pose coordinates produce different rendered control bytes", async () => {
  const first = await renderAnimationPoseControlPng(manifest());
  const changed = manifest({
    landmarks: {
      ...manifest().landmarks,
      leftHand: { x: 0.18, y: 0.5, confidence: 1 },
    },
  });
  const second = await renderAnimationPoseControlPng(changed);
  assert.notEqual(first.contentSha256, second.contentSha256);
});

test("rejects a mutated semantic manifest and invalid normalized landmarks", async () => {
  const changed = manifest();
  changed.landmarks.root.x = 0.9;
  await assert.rejects(
    () => renderAnimationPoseControlPng(changed),
    /manifest SHA-256 does not match/,
  );

  const invalid = manifest();
  invalid.landmarks.root.x = 1.2;
  const body = { ...invalid };
  delete body.manifestSha256;
  invalid.manifestSha256 = digest(body);
  await assert.rejects(
    () => renderAnimationPoseControlPng(invalid),
    /normalized from 0 to 1/,
  );
});
