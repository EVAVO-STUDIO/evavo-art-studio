import assert from "node:assert/strict";
import test from "node:test";

import {
  ANIMATION_PROVIDER_REQUEST_BATCH_KIND,
  compileAnimationDirectorPlan,
  compileAnimationProviderRequestBatch,
} from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;

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

function poseControls(frames) {
  return frames.map((frame, index) => ({
    frame,
    artifactId: artifact(String((index + 1) % 10)),
  }));
}

test("compiles key poses into provider-shaped sprite requests without executing them", () => {
  const batch = compileAnimationProviderRequestBatch(
    plan(),
    "hero-walk-right:keys",
    { poseControls: poseControls([1, 5]) },
  );

  assert.equal(batch.kind, ANIMATION_PROVIDER_REQUEST_BATCH_KIND);
  assert.equal(batch.phase, "key-pose");
  assert.equal(batch.requests.length, 2);
  assert.deepEqual(batch.authority, {
    providerExecution: false,
    runtimeSubmission: false,
    creativeApproval: false,
    artifactPromotion: false,
    repositoryMutation: false,
    publication: false,
  });

  for (const request of batch.requests) {
    assert.equal(request.schemaVersion, "1.0");
    assert.equal(request.operation, "generate");
    assert.equal(request.assetKind, "sprite-frame");
    assert.equal(request.continuityPhase, "key-pose");
    assert.equal(request.target.transparency, "required");
    assert.equal(request.target.outputFormat, "png");
    assert.equal(request.background.strategy, "provider-auto");
    assert.equal(request.candidateCount, 4);
    assert.deepEqual(
      request.references.map((reference) => reference.role),
      ["canonical-identity", "direction-master", "pose-control"],
    );
  }
});

test("binds every in-between to approved neighbouring keys and its own pose control", () => {
  const batch = compileAnimationProviderRequestBatch(
    plan(),
    "hero-walk-right:inbetweens-a",
    {
      poseControls: poseControls([2, 3, 4]),
      approvedFrames: [
        { frame: 1, artifactId: artifact("c") },
        { frame: 5, artifactId: artifact("d") },
      ],
    },
  );

  assert.equal(batch.phase, "in-between");
  assert.deepEqual(batch.dependsOnFrames, [1, 5]);
  assert.equal(batch.requests.length, 3);
  for (const request of batch.requests) {
    assert.equal(request.continuityPhase, "in-between");
    assert.equal(request.candidateCount, 3);
    assert.deepEqual(
      request.references.map((reference) => reference.role),
      [
        "canonical-identity",
        "direction-master",
        "previous-key-pose",
        "next-key-pose",
        "pose-control",
      ],
    );
    assert.equal(
      request.references.find((reference) => reference.role === "previous-key-pose")?.artifactId,
      artifact("c"),
    );
    assert.equal(
      request.references.find((reference) => reference.role === "next-key-pose")?.artifactId,
      artifact("d"),
    );
  }
});

test("fails closed when structural pose evidence or approved temporal keys are missing", () => {
  assert.throws(
    () =>
      compileAnimationProviderRequestBatch(plan(), "hero-walk-right:keys", {
        poseControls: poseControls([1]),
      }),
    /frame 5 requires an exact pose-control artifact/,
  );

  assert.throws(
    () =>
      compileAnimationProviderRequestBatch(
        plan(),
        "hero-walk-right:inbetweens-a",
        {
          poseControls: poseControls([2, 3, 4]),
          approvedFrames: [{ frame: 1, artifactId: artifact("c") }],
        },
      ),
    /requires approved key-pose artifacts for frames 1 and 5/,
  );
});

test("rejects duplicate bindings and mutated plans", () => {
  assert.throws(
    () =>
      compileAnimationProviderRequestBatch(plan(), "hero-walk-right:keys", {
        poseControls: [
          { frame: 1, artifactId: artifact("1") },
          { frame: 1, artifactId: artifact("2") },
          { frame: 5, artifactId: artifact("5") },
        ],
      }),
    /duplicate frame 1/,
  );

  const changed = plan();
  changed.frames[0].phase = 0.25;
  assert.throws(
    () =>
      compileAnimationProviderRequestBatch(changed, "hero-walk-right:keys", {
        poseControls: poseControls([1, 5]),
      }),
    /not canonical or was mutated/,
  );
});
