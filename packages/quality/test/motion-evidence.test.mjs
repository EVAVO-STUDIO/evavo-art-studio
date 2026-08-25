import assert from "node:assert/strict";
import test from "node:test";

import {
  analyseAnimationMotion,
  compileAnimationMotionEvidenceManifest,
  compileAnimationMotionQualityInput,
  verifyAnimationMotionEvidenceManifest,
} from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;
const sha = (hex) => hex.repeat(64);

function frame(index, hex, overrides = {}) {
  return {
    frameId: `f${index + 1}`,
    frameIndex: index,
    frameArtifactId: artifact(hex),
    frameContentSha256: sha(hex),
    width: 96,
    height: 128,
    plantedLandmarkId: index < 2 ? "leftFoot" : "rightFoot",
    landmarks: {
      root: { x: 48 + index * 0.5, y: 72, confidence: 0.99, provenance: "detected" },
      leftFoot: { x: 30, y: 120, confidence: 0.98, provenance: "detected" },
      rightFoot: { x: 66, y: 120, confidence: 0.98, provenance: "detected" },
    },
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    sequenceId: "hero-walk-right",
    producer: {
      kind: "model",
      id: "rtmpose-body",
      version: "reviewed-route-1",
      configSha256: sha("a"),
      model: {
        id: "rtmpose-reviewed-model",
        sha256: sha("b"),
      },
      runtime: {
        id: "onnxruntime",
        version: "reviewed-runtime",
        sha256: sha("c"),
      },
    },
    preprocessingSha256: sha("d"),
    frames: [frame(0, "1"), frame(1, "2"), frame(2, "3")],
    ...overrides,
  };
}

function policy(overrides = {}) {
  return {
    loop: false,
    minimumLandmarkConfidence: 0.9,
    plantedLandmarkDriftTolerancePixels: 1,
    rootLandmarkId: "root",
    maximumRootStepPixels: 3,
    requiredLandmarkIds: ["root", "leftFoot", "rightFoot"],
    ...overrides,
  };
}

test("compiles and verifies content- and runtime-bound motion evidence", () => {
  const manifest = compileAnimationMotionEvidenceManifest(input());
  assert.match(manifest.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.producer.kind, "model");
  assert.equal(manifest.authority.creativeApproval, false);
  assert.equal(verifyAnimationMotionEvidenceManifest(manifest), true);
});

test("rejects model evidence without exact model and runtime provenance", () => {
  const missingModel = input();
  delete missingModel.producer.model;
  assert.throws(
    () => compileAnimationMotionEvidenceManifest(missingModel),
    /requires exact model and runtime identities/,
  );

  const missingRuntime = input();
  delete missingRuntime.producer.runtime;
  assert.throws(
    () => compileAnimationMotionEvidenceManifest(missingRuntime),
    /requires exact model and runtime identities/,
  );
});

test("rejects duplicate source artifacts and out-of-canvas landmarks", () => {
  const duplicate = input();
  duplicate.frames[1].frameArtifactId = duplicate.frames[0].frameArtifactId;
  assert.throws(
    () => compileAnimationMotionEvidenceManifest(duplicate),
    /Frame artifact .* is duplicated/,
  );

  const outside = input();
  outside.frames[1].landmarks.root.x = 999;
  assert.throws(
    () => compileAnimationMotionEvidenceManifest(outside),
    /must lie within the source canvas/,
  );
});

test("manifest verification detects post-admission landmark tampering", () => {
  const manifest = compileAnimationMotionEvidenceManifest(input());
  manifest.frames[1].landmarks.root.x += 5;
  assert.equal(verifyAnimationMotionEvidenceManifest(manifest), false);
});

test("low-confidence required landmarks are dropped before motion QA", () => {
  const lowConfidence = input();
  lowConfidence.frames[1].landmarks.leftFoot.confidence = 0.4;
  const manifest = compileAnimationMotionEvidenceManifest(lowConfidence);
  const compiled = compileAnimationMotionQualityInput(manifest, policy());

  assert.deepEqual(compiled.droppedLandmarks, [
    { frameId: "f2", landmarkId: "leftFoot", confidence: 0.4 },
  ]);
  const report = analyseAnimationMotion(compiled.request);
  assert.equal(report.passed, false);
  assert.equal(
    report.gates.find((entry) => entry.id === "motion-required-landmarks").status,
    "fail",
  );
});

test("high-confidence admitted landmarks feed deterministic motion QA", () => {
  const manifest = compileAnimationMotionEvidenceManifest(input());
  const compiled = compileAnimationMotionQualityInput(manifest, policy());
  const report = analyseAnimationMotion(compiled.request);
  assert.equal(compiled.droppedLandmarks.length, 0);
  assert.equal(report.passed, true);
});
