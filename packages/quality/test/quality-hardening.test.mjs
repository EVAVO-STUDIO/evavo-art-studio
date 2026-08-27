import assert from "node:assert/strict";
import test from "node:test";

import {
  analyseAnimationAnatomyStability,
  applyTemporalAppearanceAnnotations,
  TEMPORAL_APPEARANCE_QUALITY_VERSION,
} from "../dist/index.js";

function anatomyRequest(frames) {
  return {
    sequenceId: "hero",
    frames,
    segments: [{
      id: "arm",
      fromLandmarkId: "shoulder",
      toLandmarkId: "hand",
      maximumRelativeDeviation: 0.1,
    }],
  };
}

function report() {
  return {
    version: TEMPORAL_APPEARANCE_QUALITY_VERSION,
    passed: false,
    frames: [],
    adjacentPairs: [{
      fromFrameId: "f1",
      toFrameId: "f2",
      lumaDelta: 0.5,
      chromaDelta: 0.3,
      histogramDistance: 0.8,
      edgeDensityDelta: 0.2,
    }],
    gates: [{
      id: "temporal-luma",
      status: "fail",
      blocking: true,
      message: "luma discontinuity",
      evidence: { failures: [{ fromFrameId: "f1", toFrameId: "f2" }] },
    }],
    authority: {
      creativeApproval: false,
      artifactPromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  };
}

test("missing anatomy landmarks fail closed with typed null deviation evidence", () => {
  const result = analyseAnimationAnatomyStability(anatomyRequest([
    { frameId: "f1", frameIndex: 0, landmarks: { shoulder: { x: 1, y: 1 } } },
    { frameId: "f2", frameIndex: 1, landmarks: { shoulder: { x: 1, y: 1 } } },
  ]));
  assert.equal(result.passed, false);
  assert.deepEqual(
    result.gates[0].evidence.failures.map(({ lengthPixels, relativeDeviation }) => ({ lengthPixels, relativeDeviation })),
    [
      { lengthPixels: null, relativeDeviation: null },
      { lengthPixels: null, relativeDeviation: null },
    ],
  );
});

test("valid annotation still exempts only the declared metric", () => {
  const result = applyTemporalAppearanceAnnotations(report(), [{
    fromFrameId: "f1",
    toFrameId: "f2",
    metrics: ["luma"],
    reason: "authored full-frame flash",
  }]);
  assert.equal(result.passed, true);
  assert.equal(result.gates[0].status, "pass");
  assert.equal(result.gates[0].evidence.exempted.length, 1);
});

test("unsupported and duplicate metrics are rejected at the runtime boundary", () => {
  assert.throws(
    () => applyTemporalAppearanceAnnotations(report(), [{
      fromFrameId: "f1",
      toFrameId: "f2",
      metrics: ["sparkle"],
      reason: "invalid",
    }]),
    /duplicates or unsupported metrics/,
  );
  assert.throws(
    () => applyTemporalAppearanceAnnotations(report(), [{
      fromFrameId: "f1",
      toFrameId: "f2",
      metrics: ["luma", "luma"],
      reason: "invalid",
    }]),
    /duplicates or unsupported metrics/,
  );
});

test("malformed annotation records are rejected rather than partially normalized", () => {
  assert.throws(
    () => applyTemporalAppearanceAnnotations(report(), [null]),
    /must be an object/,
  );
  assert.throws(
    () => applyTemporalAppearanceAnnotations(report(), [{
      fromFrameId: "f1",
      toFrameId: "f2",
      metrics: "luma",
      reason: "invalid",
    }]),
    /metrics must be non-empty/,
  );
});
