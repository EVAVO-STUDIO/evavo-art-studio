import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtProductionWorkOrder,
  fingerprintBookArtBrief,
} from "@evavo/art-contracts";
import { compileBookArtProviderShadowJob } from "@evavo/art-book-runtime";
import { fingerprintWebsiteBookArtProviderShadowObservation } from "@evavo/art-book-runtime/parity";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

import { createArtStudioApiServer } from "../dist/index.js";

const token = "book-art-api-parity-token-abcdefghijklmnopqrstuvwxyz";
const sha = (character) => character.repeat(64);

async function brief() {
  const value = {
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
    creativeThesis: "A restrained manuscript-specific image with editable type space.",
    primarySubject: "The exact manuscript-specific object",
    supportingSubjects: [],
    compositionRequirements: ["Protect the upper-right title field."],
    mustShow: ["One exact manuscript-specific object."],
    mustNotShow: ["Generated lettering"],
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
    briefFingerprint: "",
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
  value.briefFingerprint = await fingerprintBookArtBrief(value);
  return value;
}

function policy() {
  return {
    allowedAdapterIds: ["fixture-image"],
    preferredAdapterId: "fixture-image",
    preferredModel: "fixture-transparent-v1",
  };
}

async function envelope() {
  const workOrder = await compileBookArtProductionWorkOrder(await brief());
  assert.equal(workOrder.status, "ready", workOrder.blockers.join("\n"));
  assert.ok(workOrder.workOrder);
  const request = {
    outputKind: "evavo_book_art_provider_shadow_job_input",
    schemaVersion: 1,
    executionId: "book-art-api-parity-1",
    requestedAt: "2026-08-02T06:00:00.000Z",
    workOrder: workOrder.workOrder,
  };
  const compilation = await compileBookArtProviderShadowJob({
    ...request,
    adapterPolicy: policy(),
  });
  assert.equal(compilation.status, "ready", compilation.blockers.join("\n"));
  assert.ok(compilation.plan);
  const unsigned = {
    outputKind: "evavo_website_book_art_provider_shadow_observation",
    schemaVersion: 1,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: "c".repeat(40),
    observedAt: "2026-08-02T06:05:00.000Z",
    identity: compilation.plan.identity,
    executionId: compilation.plan.executionId,
    sourceBriefFingerprint: compilation.plan.sourceBriefFingerprint,
    workOrderFingerprintSha256: compilation.plan.workOrderFingerprintSha256,
    normalizedProviderRequestSha256:
      compilation.plan.normalizedProviderRequestSha256,
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
    request,
    websiteObservation: {
      ...unsigned,
      observationFingerprintSha256:
        fingerprintWebsiteBookArtProviderShadowObservation(unsigned),
    },
  };
}

async function withServer(options, run) {
  const server = createArtStudioApiServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("Book Art REST parity is protected, read-only and reports matching incomplete state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-api-parity-"));
  try {
    const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
    const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
    const body = await envelope();
    await withServer(
      {
        runtime,
        artifacts,
        allowWrites: true,
        writeToken: token,
        bookArtProviderAdapterPolicy: policy(),
      },
      async (base) => {
        const denied = await fetch(`${base}/v1/book-art/provider-jobs/parity`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        assert.equal(denied.status, 401);
        assert.equal(
          (await denied.json()).error.code,
          "BOOK_ART_RUNTIME_UNAUTHORIZED",
        );

        const response = await fetch(`${base}/v1/book-art/provider-jobs/parity`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        assert.equal(response.status, 200, text);
        const result = JSON.parse(text);
        assert.equal(result.status, "incomplete", result.blockers.join("\n"));
        assert.deepEqual(result.blockers, []);
        assert.deepEqual(result.mismatches, []);
        assert.equal(result.parityReadOnly, true);
        assert.equal(result.providerCallPerformedByParity, false);
        assert.equal(result.artifactWritesPerformedByParity, false);
        assert.equal(result.visualSimilarityEvaluated, false);
        assert.equal(result.cutoverEligible, false);
        assert.equal(result.websiteRuntimeStillActive, true);
        assert.equal(result.runtimeCutoverApproved, false);
        assert.equal(result.publicationPerformed, false);
        assert.equal((await runtime.list()).length, 0);
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
