import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAnimationMotionEvidenceLineage,
  compileAnimationMotionEvidenceManifest,
} from "@evavo/art-quality";
import {
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "@evavo/art-providers";
import {
  compileAnimationAppearanceRepairPlan,
  compileAnimationAppearanceRepairProviderRequest,
} from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;
const sha = (hex) => hex.repeat(64);

function originalRequest() {
  return validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "sprite-frame",
    continuityPhase: "in-between",
    assetId: "hero-walk-right:f002",
    candidateFamilyId: "hero-walk-right",
    frameId: "hero-walk-right:f002",
    creativeIntent: "Author the second walk drawing.",
    style: { styleName: "VGA adventure", intent: "Stable authored sprite animation." },
    shot: { subject: "hero", action: "walk:down", direction: "right" },
    target: { width: 96, height: 128, transparency: "required", outputFormat: "png" },
    background: { strategy: "chroma-key", matteColour: "#00ff00" },
    quality: "high",
    candidateCount: 1,
    references: [
      { artifactId: artifact("a"), role: "canonical-identity", required: true },
      { artifactId: artifact("1"), role: "pose-control", required: true },
      { artifactId: artifact("7"), role: "previous-key-pose", required: true },
      { artifactId: artifact("8"), role: "next-key-pose", required: true },
    ],
    metadata: {
      animationDirectorPlanSha256: sha("d"),
      animationProviderCompilerVersion: "2026-08-25.3",
    },
  });
}

function evidenceAndLineage(request) {
  const evidence = compileAnimationMotionEvidenceManifest({
    sequenceId: "hero-walk-right",
    producer: {
      kind: "authored-control",
      id: "reviewed-landmarks",
      version: "1",
      configSha256: sha("e"),
    },
    preprocessingSha256: sha("f"),
    frames: [
      {
        frameId: "hero-walk-right:f001",
        frameIndex: 0,
        frameArtifactId: artifact("c"),
        frameContentSha256: sha("c"),
        width: 96,
        height: 128,
        landmarks: {
          root: { x: 48, y: 72, confidence: 1, provenance: "authored" },
          leftFoot: { x: 30, y: 120, confidence: 1, provenance: "authored" },
          rightFoot: { x: 66, y: 120, confidence: 1, provenance: "authored" },
        },
      },
      {
        frameId: "hero-walk-right:f002",
        frameIndex: 1,
        frameArtifactId: artifact("b"),
        frameContentSha256: sha("b"),
        width: 96,
        height: 128,
        landmarks: {
          root: { x: 49, y: 72, confidence: 1, provenance: "authored" },
          leftFoot: { x: 30, y: 120, confidence: 1, provenance: "authored" },
          rightFoot: { x: 64, y: 118, confidence: 1, provenance: "authored" },
        },
      },
    ],
  });
  const lineage = compileAnimationMotionEvidenceLineage({
    evidence,
    animationDirectorPlanSha256: sha("d"),
    animationProviderCompilerVersion: "2026-08-25.3",
    frames: [
      { frameId: "hero-walk-right:f001", providerRequestSha256: sha("9") },
      { frameId: "hero-walk-right:f002", providerRequestSha256: providerRequestSha256(request) },
    ],
  });
  return { evidence, lineage };
}

function appearancePlan() {
  return compileAnimationAppearanceRepairPlan("hero-walk-right", {
    version: "2026-08-26.1",
    passed: true,
    frames: [],
    adjacentPairs: [],
    gates: [
      {
        id: "temporal-palette",
        status: "warning",
        blocking: false,
        message: "palette drift",
        evidence: {
          failures: [
            {
              fromFrameId: "hero-walk-right:f001",
              toFrameId: "hero-walk-right:f002",
              histogramDistance: 0.8,
            },
          ],
        },
      },
      {
        id: "temporal-edge-density",
        status: "warning",
        blocking: false,
        message: "line drift",
        evidence: {
          failures: [
            {
              fromFrameId: "hero-walk-right:f001",
              toFrameId: "hero-walk-right:f002",
              edgeDensityDelta: 0.5,
            },
          ],
        },
      },
    ],
    authority: {
      creativeApproval: false,
      artifactPromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  });
}

test("compiles a lineage-bound appearance edit with palette and line references", () => {
  const original = originalRequest();
  const { evidence, lineage } = evidenceAndLineage(original);
  const result = compileAnimationAppearanceRepairProviderRequest({
    repairPlan: appearancePlan(),
    directiveFrameId: "hero-walk-right:f002",
    evidence,
    lineage,
    originalRequest: original,
  });

  assert.equal(result.frameId, "hero-walk-right:f002");
  assert.equal(result.referenceFrameId, "hero-walk-right:f001");
  assert.equal(result.candidateArtifactId, artifact("b"));
  assert.equal(result.referenceArtifactId, artifact("c"));
  assert.equal(result.repairRequest.operation, "edit");
  assert.equal(result.repairRequest.continuityPhase, "repair");
  assert.ok(result.repairRequest.references.some((entry) => entry.role === "base-image" && entry.artifactId === artifact("b")));
  assert.ok(result.repairRequest.references.some((entry) => entry.role === "palette-reference" && entry.artifactId === artifact("c")));
  assert.ok(result.repairRequest.references.some((entry) => entry.role === "line-reference" && entry.artifactId === artifact("c")));
  assert.equal(result.authority.providerExecution, false);
});

test("rejects substituted target generation lineage", () => {
  const original = originalRequest();
  const { evidence, lineage } = evidenceAndLineage(original);
  const substituted = validateProviderCandidateRequest({ ...original, creativeIntent: "Changed generation request." });
  assert.throws(
    () => compileAnimationAppearanceRepairProviderRequest({
      repairPlan: appearancePlan(),
      directiveFrameId: "hero-walk-right:f002",
      evidence,
      lineage,
      originalRequest: substituted,
    }),
    /original provider request hash differs/,
  );
});

test("caps targeted appearance repair candidate count", () => {
  const original = originalRequest();
  const { evidence, lineage } = evidenceAndLineage(original);
  assert.throws(
    () => compileAnimationAppearanceRepairProviderRequest({
      repairPlan: appearancePlan(),
      directiveFrameId: "hero-walk-right:f002",
      evidence,
      lineage,
      originalRequest: original,
      candidateCount: 3,
    }),
    /candidateCount must be an integer from 1 to 2/,
  );
});
