import assert from "node:assert/strict";
import test from "node:test";

import { analyseAnimationMotion } from "../dist/index.js";

function walkEvidence(overrides = {}) {
  const frames = [
    { frameId: "f1", frameIndex: 0, plantedLandmarkId: "leftFoot", landmarks: { root: { x: 50, y: 80 }, leftFoot: { x: 32, y: 120 }, rightFoot: { x: 68, y: 120 }, rightHand: { x: 66, y: 60 }, swordGrip: { x: 68, y: 61 } } },
    { frameId: "f2", frameIndex: 1, plantedLandmarkId: "leftFoot", landmarks: { root: { x: 51, y: 81 }, leftFoot: { x: 32.5, y: 120 }, rightFoot: { x: 63, y: 116 }, rightHand: { x: 65, y: 60 }, swordGrip: { x: 67, y: 61 } } },
    { frameId: "f3", frameIndex: 2, plantedLandmarkId: "rightFoot", landmarks: { root: { x: 52, y: 80 }, leftFoot: { x: 38, y: 116 }, rightFoot: { x: 68, y: 120 }, rightHand: { x: 64, y: 60 }, swordGrip: { x: 66, y: 61 } } },
    { frameId: "f4", frameIndex: 3, plantedLandmarkId: "rightFoot", landmarks: { root: { x: 50.5, y: 80 }, leftFoot: { x: 44, y: 118 }, rightFoot: { x: 68.5, y: 120 }, rightHand: { x: 65, y: 60 }, swordGrip: { x: 67, y: 61 } } },
    { frameId: "f5", frameIndex: 4, plantedLandmarkId: "leftFoot", landmarks: { root: { x: 50, y: 80 }, leftFoot: { x: 32, y: 120 }, rightFoot: { x: 68, y: 120 }, rightHand: { x: 66, y: 60 }, swordGrip: { x: 68, y: 61 } } },
  ];
  return {
    sequenceId: "hero-walk",
    loop: true,
    plantedLandmarkDriftTolerancePixels: 1,
    rootLandmarkId: "root",
    maximumRootStepPixels: 3,
    loopClosureTolerancePixels: 1,
    requiredLandmarkIds: ["root", "leftFoot", "rightFoot"],
    attachmentConstraints: [
      {
        id: "sword-grip",
        fromLandmarkId: "rightHand",
        toLandmarkId: "swordGrip",
        maximumDistancePixels: 3,
      },
    ],
    frames,
    ...overrides,
  };
}

test("passes planted foot, root, attachment and loop motion constraints", () => {
  const report = analyseAnimationMotion(walkEvidence());
  assert.equal(report.passed, true);
  assert.equal(report.summary.plantedSegments, 3);
  assert.ok(report.gates.every((entry) => entry.status === "pass"));
});

test("blocks visible foot sliding", () => {
  const request = walkEvidence();
  request.frames[1].landmarks.leftFoot = { x: 36, y: 120 };
  const report = analyseAnimationMotion(request);
  assert.equal(report.passed, false);
  const gate = report.gates.find((entry) => entry.id === "motion-planted-lock");
  assert.equal(gate.status, "fail");
});

test("blocks detached hand-to-weapon anchors", () => {
  const request = walkEvidence();
  request.frames[2].landmarks.swordGrip = { x: 90, y: 90 };
  const report = analyseAnimationMotion(request);
  assert.equal(report.passed, false);
  const gate = report.gates.find((entry) => entry.id === "motion-attachments");
  assert.equal(gate.status, "fail");
});

test("blocks root discontinuity and loop endpoint drift", () => {
  const request = walkEvidence();
  request.frames[2].landmarks.root = { x: 70, y: 80 };
  request.frames[4].landmarks.root = { x: 56, y: 80 };
  const report = analyseAnimationMotion(request);
  assert.equal(report.passed, false);
  assert.equal(report.gates.find((entry) => entry.id === "motion-root-step").status, "fail");
  assert.equal(report.gates.find((entry) => entry.id === "motion-loop-closure").status, "fail");
});

test("fails closed when motion evidence is malformed", () => {
  assert.throws(
    () => analyseAnimationMotion(walkEvidence({ plantedLandmarkDriftTolerancePixels: -1 })),
    /must be a finite number greater than or equal to zero/,
  );
  const request = walkEvidence();
  request.frames[1].frameIndex = 0;
  assert.throws(() => analyseAnimationMotion(request), /Duplicate frameIndex/);
});
