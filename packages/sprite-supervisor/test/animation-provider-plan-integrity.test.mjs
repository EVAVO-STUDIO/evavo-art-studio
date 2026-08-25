import assert from "node:assert/strict";
import test from "node:test";

import { compileAnimationDirectorPlan } from "@evavo/art-direction";
import { compileAnimationProviderBatch } from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;

function canonicalPlan() {
  return compileAnimationDirectorPlan({
    clipId: "hero-walk-right",
    subjectId: "hero",
    action: "walk",
    direction: "right",
    motionStyle: "vga-adventure",
    canvas: { width: 96, height: 128 },
    canonicalIdentityArtifactId: artifact("a"),
    directionMasterArtifactId: artifact("b"),
  });
}

function compileRequest(plan) {
  return {
    plan,
    batchId: "hero-walk-right:inbetweens-a",
    poseControlArtifactIds: {
      "2": artifact("2"),
      "3": artifact("3"),
      "4": artifact("4"),
    },
    keyPoseArtifactIds: {
      "1": artifact("c"),
      "5": artifact("d"),
    },
    style: {
      styleName: "VGA test",
      intent: "Stable authored test sprite.",
    },
    background: {
      strategy: "chroma-key",
      matteColour: "#00ff00",
    },
    candidateCount: 1,
  };
}

test("rejects a rehashed-looking plan whose dependency topology was changed", () => {
  const plan = canonicalPlan();
  plan.generationBatches[1].dependsOnFrames = [5, 1];
  assert.throws(
    () => compileAnimationProviderBatch(compileRequest(plan)),
    /plan does not match the canonical Animation Director compilation/,
  );
});

test("rejects a plan whose motion assurance policy was weakened", () => {
  const plan = canonicalPlan();
  plan.qualityRequirements.plantedFootDriftTolerancePixels = 99;
  assert.throws(
    () => compileAnimationProviderBatch(compileRequest(plan)),
    /plan does not match the canonical Animation Director compilation/,
  );
});
