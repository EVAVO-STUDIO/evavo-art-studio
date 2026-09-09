import assert from "node:assert/strict";
import test from "node:test";

import { planImageRepairDecision } from "../dist/index.js";

function review(overrides = {}) {
  return {
    decision: "needs-finishing",
    blockers: [],
    warnings: [],
    quality: {
      hasAlpha: true,
      grade: "warn",
      issues: [],
      ...(overrides.quality ?? {}),
    },
    finishingPlan: {
      route: "preservation-polish",
      reasonCodes: ["transparent-rgb-or-matte-fringe-cleanup-only"],
      nextTool: "evavo_polish_existing_raster_preserving_artwork",
      postRepairRequiredTools: ["evavo_review_existing_image_edit"],
      ...(overrides.finishingPlan ?? {}),
    },
    artifactSignals: {
      nearestNeighbourUpscaleRisk: false,
      warnings: [],
      ...(overrides.artifactSignals ?? {}),
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => !["quality", "finishingPlan", "artifactSignals"].includes(key)),
    ),
  };
}

test("admits bounded preservation polish without source mutation or promotion", () => {
  const result = planImageRepairDecision(review());
  assert.equal(result.disposition, "safe-local-repair");
  assert.equal(result.recipe, "preservation-polish");
  assert.equal(result.agentExecutable, true);
  assert.equal(result.requiresExplicitWriteConfirmation, true);
  assert.equal(result.sourceMutationAllowed, false);
  assert.equal(result.approvalState, "unapproved");
});

test("admits halo-only technical failure because preservation polish specifically fixes that blocker", () => {
  const result = planImageRepairDecision(review({
    decision: "reject",
    blockers: [
      "technical image-quality review failed",
      "edge halo risk exceeds profile limit",
    ],
    quality: { grade: "fail", issues: ["edge-halo-risk:12.00%"] },
  }));
  assert.equal(result.disposition, "safe-local-repair");
  assert.equal(result.agentExecutable, true);
  assert.match(result.reasonCodes.join(","), /only-preservation-target-blockers-present/);
});

test("routes soft sources to reacquire/regenerate rather than inventing detail", () => {
  const result = planImageRepairDecision(review({
    quality: { grade: "fail", issues: ["soft-or-blurry:4.00<10.00"] },
    decision: "reject",
  }));
  assert.equal(result.disposition, "reacquire-or-regenerate");
  assert.equal(result.agentExecutable, false);
  assert.match(result.reasonCodes.join(","), /too-soft/);
});

test("requires mask and reference for identity repair", () => {
  const result = planImageRepairDecision(review({
    finishingPlan: { route: "no-op", reasonCodes: ["no-detected-defect-pixels"], nextTool: null },
    decision: "pass-to-visual-review",
    quality: { grade: "pass", issues: [] },
  }), { visualFindings: ["identity-drift"] });
  assert.equal(result.disposition, "semantic-edit");
  assert.equal(result.requiresMask, true);
  assert.equal(result.requiresReference, true);
  assert.equal(result.agentExecutable, false);
});

test("admits localized candidate composition only through an explicit mask", () => {
  const result = planImageRepairDecision(review({
    finishingPlan: {
      route: "localized-repair",
      reasonCodes: ["localized-alpha-or-edge-defects-require-bounded-repair"],
      nextTool: "evavo_create_existing_image_edit_mask",
    },
  }));
  assert.equal(result.disposition, "localized-repair");
  assert.equal(result.agentExecutable, true);
  assert.equal(result.requiresMask, true);
  assert.equal(result.requiresReference, false);
});

test("keeps clean images as no-repair and still requires visual confirmation", () => {
  const result = planImageRepairDecision(review({
    finishingPlan: { route: "no-op", reasonCodes: ["no-detected-defect-pixels"], nextTool: null },
    decision: "pass-to-visual-review",
    quality: { grade: "pass", issues: [] },
  }));
  assert.equal(result.disposition, "no-repair");
  assert.equal(result.agentExecutable, false);
  assert.equal(result.requiresVisualConfirmation, true);
});
