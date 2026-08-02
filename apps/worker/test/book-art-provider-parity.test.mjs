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
import {
  FixtureImageProviderAdapter,
  ProviderRegistry,
} from "@evavo/art-providers";
import { LocalRuntimeRepository, RuntimeWorker } from "@evavo/art-runtime";

import {
  compileBookArtProviderShadowJob,
  submitBookArtProviderShadowJob,
} from "@evavo/art-book-runtime";
import { inspectBookArtProviderShadowJob } from "@evavo/art-book-runtime/inspection";
import {
  compareBookArtProviderShadowParity,
  fingerprintWebsiteBookArtProviderShadowObservation,
} from "@evavo/art-book-runtime/parity";
import {
  createProviderHandlers,
  providerWorkerCapabilities,
} from "../dist/provider-handlers.js";

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

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-parity-worker-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const workOrder = await compileBookArtProductionWorkOrder(brief());
  assert.equal(workOrder.status, "ready", workOrder.blockers.join("\n"));
  assert.ok(workOrder.workOrder);
  const request = {
    outputKind: "evavo_book_art_provider_shadow_job_input",
    schemaVersion: 1,
    executionId: "book-art-parity-worker-1",
    requestedAt: "2026-08-02T06:00:00.000Z",
    workOrder: workOrder.workOrder,
    adapterPolicy: {
      allowedAdapterIds: ["fixture-image"],
      preferredAdapterId: "fixture-image",
      preferredModel: "fixture-transparent-v1",
    },
  };
  const compilation = await compileBookArtProviderShadowJob(request);
  assert.equal(compilation.status, "ready", compilation.blockers.join("\n"));
  assert.ok(compilation.plan);
  return { root, runtime, artifacts, request, compilation };
}

function successfulObservation(plan, candidate, model = "fixture-transparent-v1") {
  const unsigned = {
    outputKind: "evavo_website_book_art_provider_shadow_observation",
    schemaVersion: 1,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: "b".repeat(40),
    observedAt: "2026-08-02T06:10:00.000Z",
    identity: plan.identity,
    executionId: plan.executionId,
    sourceBriefFingerprint: plan.sourceBriefFingerprint,
    workOrderFingerprintSha256: plan.workOrderFingerprintSha256,
    normalizedProviderRequestSha256: plan.normalizedProviderRequestSha256,
    outcome: "candidate-produced",
    requestedCandidateCount: 1,
    attemptCount: 1,
    providerFallbackUsed: false,
    providerExecutionObserved: true,
    candidateArtifactsWritten: true,
    adapterId: "fixture-image",
    model,
    candidate: {
      contentSha256: candidate.contentSha256,
      byteLength: candidate.sizeBytes,
      mediaType: candidate.mediaType,
      storageClass: "intermediate",
      approvalState: "unapproved",
      finalDeliverable: false,
      requiresMastering: true,
      requiresBlockingQa: true,
    },
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

test("Book Art parity matches independently observed one-attempt unapproved candidates", async () => {
  const fx = await fixture();
  try {
    const submission = await submitBookArtProviderShadowJob(fx.request, {
      runtime: fx.runtime,
      actor: "book-art-parity-test",
    });
    assert.equal(submission.status, "submitted", submission.blockers.join("\n"));
    const registry = new ProviderRegistry([new FixtureImageProviderAdapter()]);
    const worker = new RuntimeWorker({
      runtime: fx.runtime,
      artifacts: fx.artifacts,
      worker: {
        id: "book-art-parity-worker",
        capabilities: providerWorkerCapabilities(registry),
        queues: ["provider"],
      },
      handlers: createProviderHandlers(registry),
    });
    assert.equal((await worker.runOnce()).succeeded, 1);

    const inspection = await inspectBookArtProviderShadowJob(fx.compilation, {
      runtime: fx.runtime,
      artifacts: fx.artifacts,
    });
    assert.equal(inspection.status, "succeeded", inspection.blockers.join("\n"));
    assert.ok(inspection.candidate);

    const matched = await compareBookArtProviderShadowParity(
      fx.compilation,
      successfulObservation(fx.compilation.plan, inspection.candidate),
      { runtime: fx.runtime, artifacts: fx.artifacts },
    );
    assert.equal(matched.status, "matched", matched.mismatches.join("\n"));
    assert.deepEqual(matched.blockers, []);
    assert.deepEqual(matched.mismatches, []);
    assert.equal(matched.comparison.identityMatched, true);
    assert.equal(matched.comparison.outcomeMatched, true);
    assert.equal(matched.comparison.attemptBoundaryMatched, true);
    assert.equal(matched.comparison.providerPolicyMatched, true);
    assert.equal(matched.comparison.adapterMatched, true);
    assert.equal(matched.comparison.modelMatched, true);
    assert.equal(matched.comparison.candidateBoundaryMatched, true);
    assert.equal(matched.structuralParityMatched, true);
    assert.equal(matched.visualSimilarityEvaluated, false);
    assert.equal(matched.candidateBytesExpectedEqual, false);
    assert.equal(matched.observationPeriodSatisfied, false);
    assert.equal(matched.cutoverEligible, false);
    assert.equal(matched.websiteSourceDeletionAllowed, false);
    assert.equal(matched.runtimeCutoverApproved, false);
    assert.equal(matched.publicationPerformed, false);

    const differentModel = await compareBookArtProviderShadowParity(
      fx.compilation,
      successfulObservation(
        fx.compilation.plan,
        inspection.candidate,
        "fixture-different-v1",
      ),
      { runtime: fx.runtime, artifacts: fx.artifacts },
    );
    assert.equal(differentModel.status, "mismatched");
    assert.equal(differentModel.comparison.modelMatched, false);
    assert.ok(
      differentModel.mismatches.some((entry) =>
        entry.includes("different provider models"),
      ),
    );
    assert.equal(differentModel.cutoverEligible, false);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});
