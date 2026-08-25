import assert from "node:assert/strict";
import test from "node:test";

import { compileAnimationDirectorPlan } from "@evavo/art-direction";
import { compileAnimationProviderBatch } from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;

function plan(overrides = {}) {
  return compileAnimationDirectorPlan({
    clipId: "hero-walk-right",
    subjectId: "hero",
    action: "walk",
    direction: "right",
    motionStyle: "vga-adventure",
    canvas: { width: 96, height: 128 },
    canonicalIdentityArtifactId: artifact("a"),
    directionMasterArtifactId: artifact("b"),
    ...overrides,
  });
}

function style() {
  return {
    styleName: "EVAVO VGA adventure sprite",
    intent: "Readable authored VGA sprite animation with stable identity and deliberate pixel treatment.",
    mustHave: ["stable silhouette", "clear authored pose"],
    mustAvoid: ["generic AI rendering", "soft vector-like edges"],
    identityLocks: ["face", "costume", "body proportions"],
    palette: ["project-approved palette"],
    lineTreatment: ["native-scale deliberate pixel clusters"],
    materials: [],
    cameraRules: ["fixed gameplay camera"],
    compositionRules: ["one complete uncropped subject"],
    eraRules: ["1990s VGA visual grammar"],
  };
}

function poseControls() {
  return {
    "1": artifact("1"),
    "2": artifact("2"),
    "3": artifact("3"),
    "4": artifact("4"),
    "5": artifact("5"),
    "6": artifact("6"),
    "7": artifact("7"),
    "8": artifact("8"),
  };
}

function baseRequest(batchId, overrides = {}) {
  return {
    plan: plan(),
    batchId,
    poseControlArtifactIds: poseControls(),
    keyPoseArtifactIds: {
      "1": artifact("c"),
      "5": artifact("d"),
    },
    style: style(),
    background: {
      strategy: "chroma-key",
      matteColour: "#00ff00",
    },
    candidateCount: 2,
    ...overrides,
  };
}

test("compiles key-pose work into provider-valid sprite-frame requests", () => {
  const result = compileAnimationProviderBatch(
    baseRequest("hero-walk-right:keys"),
  );

  assert.equal(result.phase, "key-pose");
  assert.equal(result.requests.length, 2);
  assert.equal(result.authority.providerExecution, false);
  for (const request of result.requests) {
    assert.equal(request.assetKind, "sprite-frame");
    assert.equal(request.continuityPhase, "key-pose");
    assert.equal(request.candidateCount, 2);
    assert.equal(request.target.transparency, "required");
    assert.ok(request.references.some((entry) => entry.role === "canonical-identity" && entry.required));
    assert.ok(request.references.some((entry) => entry.role === "direction-master" && entry.required));
    assert.ok(request.references.some((entry) => entry.role === "pose-control" && entry.required));
    assert.equal(request.references.some((entry) => entry.role === "previous-key-pose"), false);
    assert.equal(request.references.some((entry) => entry.role === "next-key-pose"), false);
  }
});

test("binds first in-between group to retained key poses 1 and 5", () => {
  const result = compileAnimationProviderBatch(
    baseRequest("hero-walk-right:inbetweens-a"),
  );

  assert.deepEqual(result.requests.map((entry) => entry.frameId), [
    "hero-walk-right:f002",
    "hero-walk-right:f003",
    "hero-walk-right:f004",
  ]);
  for (const request of result.requests) {
    assert.equal(request.continuityPhase, "in-between");
    assert.equal(
      request.references.find((entry) => entry.role === "previous-key-pose").artifactId,
      artifact("c"),
    );
    assert.equal(
      request.references.find((entry) => entry.role === "next-key-pose").artifactId,
      artifact("d"),
    );
  }
});

test("binds second in-between group to retained key poses 5 then 1", () => {
  const result = compileAnimationProviderBatch(
    baseRequest("hero-walk-right:inbetweens-b"),
  );
  for (const request of result.requests) {
    assert.equal(
      request.references.find((entry) => entry.role === "previous-key-pose").artifactId,
      artifact("d"),
    );
    assert.equal(
      request.references.find((entry) => entry.role === "next-key-pose").artifactId,
      artifact("c"),
    );
  }
});

test("fails closed when required visual dependencies do not exist", () => {
  const missingPose = baseRequest("hero-walk-right:keys");
  delete missingPose.poseControlArtifactIds["5"];
  assert.throws(
    () => compileAnimationProviderBatch(missingPose),
    /poseControlArtifactIds\.5 must be a canonical artifact/,
  );

  const missingKey = baseRequest("hero-walk-right:inbetweens-a");
  delete missingKey.keyPoseArtifactIds["5"];
  assert.throws(
    () => compileAnimationProviderBatch(missingKey),
    /keyPoseArtifactIds\.5 must be a canonical artifact/,
  );
});

test("enforces batch candidate budget and provider artifact identity", () => {
  assert.throws(
    () =>
      compileAnimationProviderBatch(
        baseRequest("hero-walk-right:inbetweens-a", { candidateCount: 4 }),
      ),
    /candidateCount must be an integer from 1 to 3/,
  );

  const badPlan = plan({ canonicalIdentityArtifactId: "artifact_not-a-content-id" });
  assert.throws(
    () =>
      compileAnimationProviderBatch(
        baseRequest("hero-walk-right:keys", { plan: badPlan }),
      ),
    /plan\.canonicalIdentityArtifactId must be a canonical artifact/,
  );
});
