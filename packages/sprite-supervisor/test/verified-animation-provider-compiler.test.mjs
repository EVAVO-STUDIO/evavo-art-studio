import assert from "node:assert/strict";
import test from "node:test";

import {
  bindAnimationPoseControlArtifact,
  compileAnimationDirectorPlan,
  compileAnimationPoseControl,
} from "@evavo/art-direction";
import { compileVerifiedAnimationProviderBatch } from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;
const sha = (hex) => hex.repeat(64);

function plan() {
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

function binding(frameNumber, hex) {
  const frameId = `hero-walk-right:f${String(frameNumber).padStart(3, "0")}`;
  const manifest = compileAnimationPoseControl({
    clipId: "hero-walk-right",
    frameId,
    frameNumber,
    canvas: { width: 96, height: 128 },
    landmarks: {
      root: { x: 0.5, y: 0.55 },
      leftFoot: { x: 0.35, y: 0.92 },
      rightFoot: { x: 0.67, y: 0.9 },
    },
    requiredLandmarkIds: ["root", "leftFoot", "rightFoot"],
    source: {
      kind: "authored",
      id: "director-pose",
      version: "1",
      configSha256: sha("f"),
    },
  });
  return bindAnimationPoseControlArtifact(manifest, {
    artifactId: artifact(hex),
    contentSha256: sha(hex),
    mediaType: "image/png",
    width: 96,
    height: 128,
  });
}

function bindings() {
  return Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8].map((frameNumber) => [
      String(frameNumber),
      binding(frameNumber, String(frameNumber)),
    ]),
  );
}

function request(overrides = {}) {
  return {
    plan: plan(),
    batchId: "hero-walk-right:keys",
    poseControlBindings: bindings(),
    keyPoseArtifactIds: { "1": artifact("c"), "5": artifact("d") },
    style: {
      styleName: "EVAVO VGA adventure sprite",
      intent: "Readable authored VGA sprite animation with stable identity.",
    },
    background: { strategy: "chroma-key", matteColour: "#00ff00" },
    candidateCount: 2,
    ...overrides,
  };
}

test("compiles provider work only from canonical pose-control bindings", () => {
  const result = compileVerifiedAnimationProviderBatch(request());
  assert.equal(result.requests.length, 2);
  assert.equal(result.poseControlBindingSha256s.length, 2);
  assert.equal(result.verifiedCompilerVersion, "2026-08-26.1");
  for (const providerRequest of result.requests) {
    const frameNumber = Number(providerRequest.frameId.split("f").at(-1));
    const pose = providerRequest.references.find((entry) => entry.role === "pose-control");
    assert.equal(pose.artifactId, artifact(String(frameNumber)));
  }
});

test("rejects a pose binding for the wrong animation frame", () => {
  const input = request();
  input.poseControlBindings["1"] = binding(2, "1");
  assert.throws(
    () => compileVerifiedAnimationProviderBatch(input),
    /does not identify hero-walk-right:f001/,
  );
});

test("rejects post-binding mutation and artifact/content substitution", () => {
  const mutated = request();
  mutated.poseControlBindings["1"].frameNumber = 99;
  assert.throws(
    () => compileVerifiedAnimationProviderBatch(mutated),
    /failed canonical binding verification/,
  );

  const substituted = request();
  const current = substituted.poseControlBindings["1"];
  substituted.poseControlBindings["1"] = {
    ...current,
    artifactId: artifact("e"),
  };
  assert.throws(
    () => compileVerifiedAnimationProviderBatch(substituted),
    /failed canonical binding verification/,
  );
});

test("requires every pose control needed by the selected generation batch", () => {
  const input = request({ batchId: "hero-walk-right:inbetweens-a" });
  delete input.poseControlBindings["3"];
  assert.throws(
    () => compileVerifiedAnimationProviderBatch(input),
    /poseControlBindings\.3 is required/,
  );
});
