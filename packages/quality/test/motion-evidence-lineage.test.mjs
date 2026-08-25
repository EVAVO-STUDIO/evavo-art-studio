import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAnimationMotionEvidenceLineage,
  compileAnimationMotionEvidenceManifest,
  verifyAnimationMotionEvidenceLineage,
} from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;
const sha = (hex) => hex.repeat(64);

function evidence() {
  return compileAnimationMotionEvidenceManifest({
    sequenceId: "hero-walk-right",
    producer: {
      kind: "authored-control",
      id: "reviewed-pose-control",
      version: "1",
      configSha256: sha("a"),
    },
    preprocessingSha256: sha("b"),
    frames: [
      {
        frameId: "hero-walk-right:f001",
        frameIndex: 0,
        frameArtifactId: artifact("1"),
        frameContentSha256: sha("1"),
        width: 96,
        height: 128,
        plantedLandmarkId: "leftFoot",
        landmarks: {
          root: { x: 48, y: 72, confidence: 1, provenance: "authored" },
          leftFoot: { x: 30, y: 120, confidence: 1, provenance: "authored" },
          rightFoot: { x: 66, y: 120, confidence: 1, provenance: "authored" },
        },
      },
      {
        frameId: "hero-walk-right:f002",
        frameIndex: 1,
        frameArtifactId: artifact("2"),
        frameContentSha256: sha("2"),
        width: 96,
        height: 128,
        plantedLandmarkId: "leftFoot",
        landmarks: {
          root: { x: 48.5, y: 72, confidence: 1, provenance: "authored" },
          leftFoot: { x: 30, y: 120, confidence: 1, provenance: "authored" },
          rightFoot: { x: 65, y: 119, confidence: 1, provenance: "authored" },
        },
      },
    ],
  });
}

test("binds every analysed candidate frame to its exact director plan and provider request", () => {
  const manifest = evidence();
  const lineage = compileAnimationMotionEvidenceLineage({
    evidence: manifest,
    animationDirectorPlanSha256: sha("c"),
    animationProviderCompilerVersion: "2026-08-25.3",
    frames: [
      { frameId: "hero-walk-right:f001", providerRequestSha256: sha("d") },
      { frameId: "hero-walk-right:f002", providerRequestSha256: sha("e") },
    ],
  });

  assert.match(lineage.lineageSha256, /^[a-f0-9]{64}$/);
  assert.equal(lineage.evidenceManifestSha256, manifest.manifestSha256);
  assert.equal(lineage.frames[0].frameArtifactId, artifact("1"));
  assert.equal(lineage.frames[0].providerRequestSha256, sha("d"));
  assert.equal(lineage.authority.creativeApproval, false);
  assert.equal(verifyAnimationMotionEvidenceLineage(lineage, manifest), true);
});

test("fails closed on missing, duplicate or unknown request lineage", () => {
  const manifest = evidence();
  assert.throws(
    () =>
      compileAnimationMotionEvidenceLineage({
        evidence: manifest,
        animationDirectorPlanSha256: sha("c"),
        animationProviderCompilerVersion: "2026-08-25.3",
        frames: [
          { frameId: "hero-walk-right:f001", providerRequestSha256: sha("d") },
        ],
      }),
    /bind every motion-evidence frame exactly once/,
  );

  assert.throws(
    () =>
      compileAnimationMotionEvidenceLineage({
        evidence: manifest,
        animationDirectorPlanSha256: sha("c"),
        animationProviderCompilerVersion: "2026-08-25.3",
        frames: [
          { frameId: "hero-walk-right:f001", providerRequestSha256: sha("d") },
          { frameId: "hero-walk-right:f001", providerRequestSha256: sha("e") },
        ],
      }),
    /Duplicate frame lineage/,
  );

  assert.throws(
    () =>
      compileAnimationMotionEvidenceLineage({
        evidence: manifest,
        animationDirectorPlanSha256: sha("c"),
        animationProviderCompilerVersion: "2026-08-25.3",
        frames: [
          { frameId: "hero-walk-right:f001", providerRequestSha256: sha("d") },
          { frameId: "unknown-frame", providerRequestSha256: sha("e") },
        ],
      }),
    /Missing provider request lineage for evidence frame hero-walk-right:f002/,
  );
});

test("verification detects changed evidence or request lineage", () => {
  const manifest = evidence();
  const lineage = compileAnimationMotionEvidenceLineage({
    evidence: manifest,
    animationDirectorPlanSha256: sha("c"),
    animationProviderCompilerVersion: "2026-08-25.3",
    frames: [
      { frameId: "hero-walk-right:f001", providerRequestSha256: sha("d") },
      { frameId: "hero-walk-right:f002", providerRequestSha256: sha("e") },
    ],
  });

  lineage.frames[1].providerRequestSha256 = sha("f");
  assert.equal(verifyAnimationMotionEvidenceLineage(lineage, manifest), false);
});
