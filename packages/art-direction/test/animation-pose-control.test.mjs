import assert from "node:assert/strict";
import test from "node:test";

import {
  bindAnimationPoseControlArtifact,
  compileAnimationPoseControl,
} from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;
const sha = (hex) => hex.repeat(64);

function request(overrides = {}) {
  return {
    clipId: "hero-walk-right",
    frameId: "hero-walk-right:f002",
    frameNumber: 2,
    canvas: { width: 96, height: 128 },
    landmarks: {
      root: { x: 0.5, y: 0.55 },
      head: { x: 0.5, y: 0.2 },
      leftFoot: { x: 0.35, y: 0.92 },
      rightFoot: { x: 0.67, y: 0.9 },
    },
    requiredLandmarkIds: ["root", "head", "leftFoot", "rightFoot"],
    source: {
      kind: "authored",
      id: "animation-director-authored-pose",
      version: "1",
      configSha256: sha("a"),
      sourceArtifactIds: [artifact("1")],
    },
    ...overrides,
  };
}

test("compiles canonical normalized pose-control evidence", () => {
  const manifest = compileAnimationPoseControl(request());
  assert.equal(manifest.coordinateSpace, "normalized-0-1");
  assert.equal(manifest.landmarks.root.confidence, 1);
  assert.match(manifest.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.authority.providerExecution, false);
});

test("requires exact model and runtime provenance for estimator controls", () => {
  assert.throws(
    () =>
      compileAnimationPoseControl(
        request({
          source: {
            kind: "pose-estimator",
            id: "rtmpose",
            version: "1",
            configSha256: sha("b"),
          },
        }),
      ),
    /require exact model and runtime identities/,
  );

  const manifest = compileAnimationPoseControl(
    request({
      source: {
        kind: "pose-estimator",
        id: "rtmpose",
        version: "1",
        configSha256: sha("b"),
        model: { id: "rtmpose-body", version: "reviewed", sha256: sha("c") },
        runtime: { id: "onnxruntime", version: "1.24.1", sha256: sha("d") },
        sourceArtifactIds: [artifact("2")],
      },
    }),
  );
  assert.equal(manifest.source.kind, "pose-estimator");
});

test("binds an exact rendered PNG control artifact to the semantic manifest", () => {
  const manifest = compileAnimationPoseControl(request());
  const binding = bindAnimationPoseControlArtifact(manifest, {
    artifactId: artifact("f"),
    contentSha256: sha("f"),
    mediaType: "image/png",
    width: 96,
    height: 128,
  });
  assert.equal(binding.poseControlManifestSha256, manifest.manifestSha256);
  assert.equal(binding.frameId, manifest.frameId);
  assert.match(binding.bindingSha256, /^[a-f0-9]{64}$/);
});

test("rejects missing landmarks, out-of-range coordinates and mismatched render canvas", () => {
  assert.throws(
    () => compileAnimationPoseControl(request({ requiredLandmarkIds: ["root", "missing"] })),
    /required landmark missing is missing/,
  );
  assert.throws(
    () => compileAnimationPoseControl(request({ landmarks: { root: { x: 1.2, y: 0.5 } }, requiredLandmarkIds: ["root"] })),
    /normalized value from 0 to 1/,
  );
  const manifest = compileAnimationPoseControl(request());
  assert.throws(
    () => bindAnimationPoseControlArtifact(manifest, {
      artifactId: artifact("e"),
      contentSha256: sha("e"),
      mediaType: "image/png",
      width: 128,
      height: 128,
    }),
    /dimensions must match/,
  );
});

test("detects post-compilation semantic pose mutation before binding", () => {
  const manifest = compileAnimationPoseControl(request());
  manifest.landmarks.root.x = 0.9;
  assert.throws(
    () => bindAnimationPoseControlArtifact(manifest, {
      artifactId: artifact("e"),
      contentSha256: sha("e"),
      mediaType: "image/png",
      width: 96,
      height: 128,
    }),
    /not canonical or was mutated/,
  );
});
