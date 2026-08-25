import assert from "node:assert/strict";
import test from "node:test";

import { analyseAnimationAnatomyStability } from "../dist/index.js";

function frame(frameId, frameIndex, overrides = {}) {
  return {
    frameId,
    frameIndex,
    landmarks: {
      leftShoulder: { x: 20, y: 20 },
      leftElbow: { x: 30, y: 35 },
      leftHand: { x: 38, y: 50 },
      leftHip: { x: 28, y: 62 },
      leftKnee: { x: 31, y: 86 },
      leftFoot: { x: 34, y: 112 },
      ...overrides,
    },
  };
}

function request(frames, overrides = {}) {
  return {
    sequenceId: "hero-walk-right",
    frames,
    segments: [
      {
        id: "left-upper-arm",
        fromLandmarkId: "leftShoulder",
        toLandmarkId: "leftElbow",
        maximumRelativeDeviation: 0.12,
      },
      {
        id: "left-forearm",
        fromLandmarkId: "leftElbow",
        toLandmarkId: "leftHand",
        maximumRelativeDeviation: 0.12,
      },
      {
        id: "left-thigh",
        fromLandmarkId: "leftHip",
        toLandmarkId: "leftKnee",
        maximumRelativeDeviation: 0.12,
      },
      {
        id: "left-shin",
        fromLandmarkId: "leftKnee",
        toLandmarkId: "leftFoot",
        maximumRelativeDeviation: 0.12,
      },
    ],
    ...overrides,
  };
}

test("passes stable articulated segment lengths across changing poses", () => {
  const report = analyseAnimationAnatomyStability(request([
    frame("f1", 0),
    frame("f2", 1, {
      leftElbow: { x: 32, y: 34 },
      leftHand: { x: 43, y: 47 },
      leftKnee: { x: 34, y: 86 },
      leftFoot: { x: 40, y: 111 },
    }),
    frame("f3", 2, {
      leftElbow: { x: 28, y: 37 },
      leftHand: { x: 34, y: 53 },
      leftKnee: { x: 27, y: 87 },
      leftFoot: { x: 24, y: 113 },
    }),
  ]));
  assert.equal(report.passed, true);
  assert.ok(report.gates.every((gate) => gate.status === "pass"));
});

test("blocks a one-frame limb-length morph", () => {
  const report = analyseAnimationAnatomyStability(request([
    frame("f1", 0),
    frame("f2", 1, { leftHand: { x: 70, y: 65 } }),
    frame("f3", 2),
  ]));
  assert.equal(report.passed, false);
  const gate = report.gates.find((entry) => entry.id === "anatomy-segment:left-forearm");
  assert.equal(gate.status, "fail");
  assert.ok(gate.evidence.failures.some((failure) => failure.frameId === "f2"));
});

test("supports non-blocking stylised segment policies", () => {
  const input = request([
    frame("f1", 0),
    frame("f2", 1, { leftHand: { x: 70, y: 65 } }),
    frame("f3", 2),
  ]);
  input.segments = [
    {
      id: "left-forearm-stylised",
      fromLandmarkId: "leftElbow",
      toLandmarkId: "leftHand",
      maximumRelativeDeviation: 0.12,
      blocking: false,
    },
  ];
  const report = analyseAnimationAnatomyStability(input);
  assert.equal(report.passed, true);
  assert.equal(report.gates[0].status, "warning");
});

test("fails closed on missing landmarks and malformed constraints", () => {
  const report = analyseAnimationAnatomyStability({
    sequenceId: "hero",
    frames: [
      { frameId: "f1", frameIndex: 0, landmarks: { shoulder: { x: 1, y: 1 } } },
      { frameId: "f2", frameIndex: 1, landmarks: { shoulder: { x: 1, y: 1 } } },
    ],
    segments: [
      {
        id: "arm",
        fromLandmarkId: "shoulder",
        toLandmarkId: "hand",
        maximumRelativeDeviation: 0.1,
      },
    ],
  });
  assert.equal(report.passed, false);
  assert.ok(report.gates[0].evidence.failures.every((failure) => failure.lengthPixels === null));

  assert.throws(
    () => analyseAnimationAnatomyStability(request([frame("f1", 0), frame("f2", 1)], {
      segments: [
        {
          id: "bad",
          fromLandmarkId: "leftElbow",
          toLandmarkId: "leftElbow",
          maximumRelativeDeviation: 0.1,
        },
      ],
    })),
    /requires two distinct landmark ids/,
  );
});
