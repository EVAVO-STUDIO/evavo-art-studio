import assert from "node:assert/strict";
import test from "node:test";

import { compileAnimationMotionRepairPlan } from "../dist/index.js";

function report(overrides = {}) {
  return {
    schemaVersion: "1.0",
    sequenceId: "hero-walk-right",
    passed: false,
    gates: [
      {
        id: "motion-required-landmarks",
        status: "fail",
        blocking: true,
        message: "missing",
        evidence: {
          missing: [{ frameId: "hero-walk-right:f003", landmarkId: "leftFoot" }],
        },
      },
      {
        id: "motion-planted-lock",
        status: "fail",
        blocking: true,
        message: "slide",
        evidence: {
          failures: [
            {
              landmarkId: "leftFoot",
              startFrameId: "hero-walk-right:f001",
              endFrameId: "hero-walk-right:f004",
              maximumDriftPixels: 4,
            },
          ],
        },
      },
      {
        id: "motion-root-step",
        status: "fail",
        blocking: true,
        message: "jump",
        evidence: {
          failures: [
            {
              fromFrameId: "hero-walk-right:f004",
              toFrameId: "hero-walk-right:f005",
              distancePixels: 12,
            },
          ],
        },
      },
      {
        id: "motion-attachments",
        status: "fail",
        blocking: true,
        message: "grip",
        evidence: {
          failures: [
            {
              constraintId: "sword-grip",
              frameId: "hero-walk-right:f005",
              distancePixels: 8,
              maximumDistancePixels: 2,
            },
          ],
        },
      },
      {
        id: "motion-loop-closure",
        status: "fail",
        blocking: true,
        message: "seam",
        evidence: {
          failures: [{ landmarkId: "root", distancePixels: 5 }],
        },
      },
    ],
    summary: { frameCount: 8, plantedSegments: 2, attachmentConstraintCount: 1 },
    ...overrides,
  };
}

test("turns failed motion gates into bounded frame-specific repair directives", () => {
  const plan = compileAnimationMotionRepairPlan(report());
  assert.equal(plan.sequenceId, "hero-walk-right");
  assert.equal(plan.motionReportPassed, false);
  assert.equal(plan.authority.providerExecution, false);
  assert.equal(plan.authority.runtimeSubmission, false);

  const missing = plan.directives.find(
    (directive) => directive.frameId === "hero-walk-right:f003",
  );
  assert.ok(missing.reasons.includes("missing-landmark"));
  assert.match(missing.correct.join(" "), /Restore leftFoot/);

  const contact = plan.directives.find(
    (directive) => directive.frameId === "hero-walk-right:f004",
  );
  assert.ok(contact.reasons.includes("planted-foot-drift"));
  assert.ok(contact.reasons.includes("root-discontinuity"));
  assert.ok(contact.preserve.some((entry) => /canonical identity/.test(entry)));

  const grip = plan.directives.find(
    (directive) => directive.frameId === "hero-walk-right:f005",
  );
  assert.ok(grip.reasons.includes("attachment-separation"));
  assert.match(grip.correct.join(" "), /sword-grip/);

  assert.ok(plan.directives.some((directive) => directive.frameId === "__loop-start__"));
  assert.ok(plan.directives.some((directive) => directive.frameId === "__loop-end__"));
});

test("does not invent repair for a passing report", () => {
  assert.throws(
    () => compileAnimationMotionRepairPlan(report({ passed: true })),
    /passing motion report does not require repair/,
  );
});

test("fails when blocking failures do not carry actionable frame evidence", () => {
  assert.throws(
    () =>
      compileAnimationMotionRepairPlan(
        report({
          gates: [
            {
              id: "unknown-motion-gate",
              status: "fail",
              blocking: true,
              message: "unknown",
              evidence: {},
            },
          ],
        }),
      ),
    /did not contain actionable frame evidence/,
  );
});
