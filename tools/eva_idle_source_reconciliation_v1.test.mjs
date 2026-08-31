import assert from "node:assert/strict";
import test from "node:test";

import {
  EVA_IDLE_SOURCE_RECONCILIATION_VERSION,
  compileEvaIdleSourceReconciliation,
} from "./eva_idle_source_reconciliation_v1.mjs";

const hex = (char) => char.repeat(64);
const sha = (char) => `sha256:${hex(char)}`;
const artifact = (char) => `artifact_${hex(char)}`;

function profileEntry() {
  return {
    clipId: "idle-primary",
    plan: {
      profileId: "eva-female:idle-primary:r1",
      contentDigest: sha("a"),
      request: {
        subject: {
          subjectId: "eva-female",
          identityLockId: "eva-female-identity-lock",
          identityRevision: 1,
        },
        delivery: {
          canvas: { width: 1024, height: 1536 },
          alphaRequired: true,
          trim: false,
        },
      },
      drawings: [
        { id: "idle-rest", ordinal: 1 },
        { id: "idle-inhale", ordinal: 2 },
        { id: "idle-exhale", ordinal: 3 },
        { id: "idle-settle", ordinal: 4 },
      ],
    },
  };
}

function source(id, drawingId, char, priority = 100) {
  return {
    sourceId: id,
    reviewDecisionId: `${id}:review`,
    reviewDecisionDigest: sha(char),
    inspectionEvidenceDigest: sha(char === "f" ? "e" : "f"),
    artifactId: artifact(char),
    contentDigest: sha(char),
    byteLength: 123456,
    mediaType: "image/png",
    width: 1024,
    height: 1536,
    meaningfulAlpha: true,
    reviewStatus: "sealed",
    decision: "keep",
    identityLockId: "eva-female-identity-lock",
    identityRevision: 1,
    eligibleDrawingIds: [drawingId],
    reusePriority: priority,
  };
}

test("reuses only sealed semantically eligible exact-canvas EVA sources", () => {
  const result = compileEvaIdleSourceReconciliation({
    profileEntry: profileEntry(),
    reviewedSources: [
      source("source-rest", "idle-rest", "b"),
      source("source-exhale", "idle-exhale", "c"),
    ],
  });

  assert.equal(result.schema, EVA_IDLE_SOURCE_RECONCILIATION_VERSION);
  assert.equal(result.reusedDrawingCount, 2);
  assert.deepEqual(
    result.selections.map((entry) => entry.drawingId),
    ["idle-rest", "idle-exhale"],
  );
  assert.deepEqual(result.unresolvedDrawingIds, ["idle-inhale", "idle-settle"]);
  assert.equal(result.nextRoute, "route-unresolved-drawings");
  assert.ok(result.selections.every((entry) => entry.candidate.adapterId === "eva-reviewed-source-reuse-v1"));
  assert.equal(result.authority.sourceSemanticAssignment, false);
  assert.equal(result.authority.providerExecution, false);
});

test("does not reuse an artifact reserved by another accepted drawing", () => {
  const reused = source("source-rest", "idle-rest", "d");
  const result = compileEvaIdleSourceReconciliation({
    profileEntry: profileEntry(),
    reviewedSources: [reused],
    reservedArtifactIds: [reused.artifactId],
  });
  assert.equal(result.reusedDrawingCount, 0);
  assert.deepEqual(result.unresolvedDrawingIds, [
    "idle-rest",
    "idle-inhale",
    "idle-exhale",
    "idle-settle",
  ]);
});

test("fails closed when a source has not been sealed as keep by visual review", () => {
  const candidate = source("source-rest", "idle-rest", "e");
  candidate.reviewStatus = "open";
  assert.throws(
    () => compileEvaIdleSourceReconciliation({
      profileEntry: profileEntry(),
      reviewedSources: [candidate],
    }),
    /EVA_IDLE_SOURCE_NOT_SEALED_KEEP/u,
  );
});

test("fails closed on identity revision drift", () => {
  const candidate = source("source-rest", "idle-rest", "f");
  candidate.identityRevision = 2;
  assert.throws(
    () => compileEvaIdleSourceReconciliation({
      profileEntry: profileEntry(),
      reviewedSources: [candidate],
    }),
    /EVA_IDLE_SOURCE_IDENTITY_REVISION_MISMATCH/u,
  );
});
