import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtProductionWorkOrder,
} from "@evavo/art-contracts";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

import { compileBookArtProviderShadowJob } from "../dist/index.js";
import {
  compareBookArtProviderShadowParity,
  fingerprintWebsiteBookArtProviderShadowObservation,
  validateWebsiteBookArtProviderShadowObservation,
} from "../dist/parity.js";

const sha = (character) => character.repeat(64);

function brief() {
  return {
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: BOOK_ART_HANDOFF_CONTRACT,
    identity: {
      workspaceId: "workspace-1",
      projectId: "project-1",
      bookId: "book-1",
      editionId: "paperback-1",
      requestId: "request-1",
    },
    purpose: "front_cover_art",
    manuscript: {
      manuscriptRevisionId: "manuscript-4",
      manuscriptSha256: sha("a"),
      extractedTextSha256: sha("b"),
      visualCanonSha256: sha("c"),
      artDirectionSha256: sha("d"),
      approvedEvidenceIds: ["evidence-1"],
    },
    conceptTerritoryId: "manuscript-first",
    conceptTerritoryLabel: "Manuscript first",
    creativeThesis:
      "A restrained image built around one manuscript-specific object and protected editable typography.",
    primarySubject: "The exact manuscript-specific object",
    supportingSubjects: [],
    compositionRequirements: ["Protect the upper-right title field."],
    mustShow: ["One exact manuscript-specific object."],
    mustNotShow: ["Generated lettering", "Unapproved characters"],
    spoilerRestrictions: ["Do not reveal the final identity."],
    continuityRequirements: ["Match approved period state."],
    historicalAndMaterialRequirements: ["Use period-correct construction."],
    negativeSpaceRequirements: ["Keep quiet space for editable type."],
    output: {
      widthPx: 3000,
      heightPx: 4800,
      minimumPpi: 300,
      allowedMimeTypes: ["image/png", "image/tiff"],
      colourIntent: "rgb",
      alpha: "allowed",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    rightsEvidenceIds: ["rights-1"],
    createdAt: "2026-08-02T00:00:00.000Z",
    briefFingerprint: sha("e"),
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
}

async function compilation() {
  const workOrder = await compileBookArtProductionWorkOrder(brief());
  assert.equal(workOrder.status, "ready", workOrder.blockers.join("\n"));
  assert.ok(workOrder.workOrder);
  const compiled = await compileBookArtProviderShadowJob({
    outputKind: "evavo_book_art_provider_shadow_job_input",
    schemaVersion: 1,
    executionId: "book-art-parity-1",
    requestedAt: "2026-08-02T06:00:00.000Z",
    workOrder: workOrder.workOrder,
    adapterPolicy: {
      allowedAdapterIds: ["fixture-image"],
      preferredAdapterId: "fixture-image",
      preferredModel: "fixture-transparent-v1",
    },
  });
  assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
  assert.ok(compiled.plan);
  return compiled;
}

function notSubmittedObservation(plan) {
  const unsigned = {
    outputKind: "evavo_website_book_art_provider_shadow_observation",
    schemaVersion: 1,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: "a".repeat(40),
    observedAt: "2026-08-02T06:05:00.000Z",
    identity: plan.identity,
    executionId: plan.executionId,
    sourceBriefFingerprint: plan.sourceBriefFingerprint,
    workOrderFingerprintSha256: plan.workOrderFingerprintSha256,
    normalizedProviderRequestSha256: plan.normalizedProviderRequestSha256,
    outcome: "not-submitted",
    requestedCandidateCount: 1,
    attemptCount: 0,
    providerFallbackUsed: false,
    providerExecutionObserved: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    providerCandidateMayBeFinal: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  return {
    ...unsigned,
    observationFingerprintSha256:
      fingerprintWebsiteBookArtProviderShadowObservation(unsigned),
  };
}

test("shared parity reports matching not-submitted observations as incomplete and read-only", async () => {
  const compiled = await compilation();
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-parity-"));
  try {
    const result = await compareBookArtProviderShadowParity(
      compiled,
      notSubmittedObservation(compiled.plan),
      {
        runtime: new LocalRuntimeRepository({ root: path.join(root, "runtime") }),
        artifacts: new LocalArtifactStore({ root: path.join(root, "artifacts") }),
      },
    );
    assert.equal(result.status, "incomplete", result.blockers.join("\n"));
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.mismatches, []);
    assert.equal(result.comparison.identityMatched, true);
    assert.equal(result.comparison.normalizedProviderRequestMatched, true);
    assert.equal(result.comparison.outcomeMatched, true);
    assert.equal(result.comparison.attemptBoundaryMatched, true);
    assert.equal(result.parityReadOnly, true);
    assert.equal(result.providerCallPerformedByParity, false);
    assert.equal(result.artifactWritesPerformedByParity, false);
    assert.equal(result.visualSimilarityEvaluated, false);
    assert.equal(result.structuralParityMatched, false);
    assert.equal(result.cutoverEligible, false);
    assert.equal(result.websiteRuntimeStillActive, true);
    assert.equal(result.websiteSourceDeletionAllowed, false);
    assert.match(result.parityFingerprintSha256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Website parity observation fingerprint fails closed after request tampering", async () => {
  const compiled = await compilation();
  const observation = notSubmittedObservation(compiled.plan);
  const tampered = {
    ...observation,
    normalizedProviderRequestSha256: "f".repeat(64),
  };
  const validation = validateWebsiteBookArtProviderShadowObservation(tampered);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.issues.some((entry) => entry.includes("fingerprint does not match")),
  );
});
