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
  compileAnimationMotionRepairPlan,
  compileAnimationMotionRepairProviderRequest,
} from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;
const sha = (hex) => hex.repeat(64);

function originalRequest() {
  return validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "sprite-frame",
    continuityPhase: "key-pose",
    assetId: "hero-walk-right:f001",
    candidateFamilyId: "hero-walk-right",
    frameId: "hero-walk-right:f001",
    creativeIntent: "Author the first contact pose.",
    style: {
      styleName: "VGA adventure",
      intent: "Stable authored sprite animation.",
    },
    shot: {
      subject: "hero",
      action: "walk:contact",
      direction: "right",
    },
    target: {
      width: 96,
      height: 128,
      transparency: "required",
      outputFormat: "png",
    },
    background: {
      strategy: "chroma-key",
      matteColour: "#00ff00",
    },
    quality: "high",
    candidateCount: 1,
    references: [
      {
        artifactId: artifact("a"),
        role: "canonical-identity",
        required: true,
      },
      {
        artifactId: artifact("1"),
        role: "pose-control",
        required: true,
      },
    ],
    metadata: {
      animationDirectorPlanSha256: sha("d"),
      animationProviderCompilerVersion: "2026-08-25.2",
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
        frameArtifactId: artifact("b"),
        frameContentSha256: sha("b"),
        width: 96,
        height: 128,
        plantedLandmarkId: "leftFoot",
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
    animationProviderCompilerVersion: "2026-08-25.2",
    frames: [
      {
        frameId: "hero-walk-right:f001",
        providerRequestSha256: providerRequestSha256(request),
      },
      {
        frameId: "hero-walk-right:f002",
        providerRequestSha256: sha("9"),
      },
    ],
  });
  return { evidence, lineage };
}

function repairPlan() {
  return compileAnimationMotionRepairPlan({
    schemaVersion: "1.0",
    sequenceId: "hero-walk-right",
    passed: false,
    gates: [
      {
        id: "motion-planted-lock",
        status: "fail",
        blocking: true,
        message: "foot slide",
        evidence: {
          failures: [
            {
              landmarkId: "leftFoot",
              startFrameId: "hero-walk-right:f001",
              endFrameId: "hero-walk-right:f001",
              maximumDriftPixels: 4,
            },
          ],
        },
      },
    ],
    summary: { frameCount: 2, plantedSegments: 1, attachmentConstraintCount: 0 },
  });
}

test("compiles a candidate-bound provider edit request for failed motion QA", () => {
  const original = originalRequest();
  const { evidence, lineage } = evidenceAndLineage(original);
  const result = compileAnimationMotionRepairProviderRequest({
    repairPlan: repairPlan(),
    directiveFrameId: "hero-walk-right:f001",
    evidence,
    lineage,
    originalRequest: original,
  });

  assert.equal(result.frameId, "hero-walk-right:f001");
  assert.equal(result.candidateArtifactId, artifact("c"));
  assert.equal(result.repairRequest.operation, "edit");
  assert.equal(result.repairRequest.continuityPhase, "repair");
  assert.equal(result.repairRequest.candidateCount, 1);
  assert.ok(
    result.repairRequest.references.some(
      (entry) => entry.role === "base-image" && entry.artifactId === artifact("c"),
    ),
  );
  assert.ok(
    result.repairRequest.references.some(
      (entry) => entry.role === "canonical-identity" && entry.required,
    ),
  );
  assert.equal(result.authority.providerExecution, false);
  assert.equal(result.authority.runtimeSubmission, false);
});

test("rejects a substituted original provider request", () => {
  const original = originalRequest();
  const { evidence, lineage } = evidenceAndLineage(original);
  const substituted = validateProviderCandidateRequest({
    ...original,
    creativeIntent: "Different generation request.",
  });

  assert.throws(
    () =>
      compileAnimationMotionRepairProviderRequest({
        repairPlan: repairPlan(),
        directiveFrameId: "hero-walk-right:f001",
        evidence,
        lineage,
        originalRequest: substituted,
      }),
    /original provider request hash differs from retained lineage/,
  );
});

test("rejects mutated evidence lineage and excessive repair candidates", () => {
  const original = originalRequest();
  const { evidence, lineage } = evidenceAndLineage(original);
  lineage.frames[0].frameContentSha256 = sha("7");
  assert.throws(
    () =>
      compileAnimationMotionRepairProviderRequest({
        repairPlan: repairPlan(),
        directiveFrameId: "hero-walk-right:f001",
        evidence,
        lineage,
        originalRequest: original,
      }),
    /motion evidence lineage verification failed/,
  );

  const valid = evidenceAndLineage(original);
  assert.throws(
    () =>
      compileAnimationMotionRepairProviderRequest({
        repairPlan: repairPlan(),
        directiveFrameId: "hero-walk-right:f001",
        evidence: valid.evidence,
        lineage: valid.lineage,
        originalRequest: original,
        candidateCount: 3,
      }),
    /candidateCount must be an integer from 1 to 2/,
  );
});
