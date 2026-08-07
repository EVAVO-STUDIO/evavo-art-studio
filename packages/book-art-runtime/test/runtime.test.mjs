import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtProductionWorkOrder,
  fingerprintBookArtBrief,
} from "@evavo/art-contracts";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

import {
  BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
  compileBookArtProviderShadowJob,
  submitBookArtProviderShadowJob,
} from "../dist/index.js";

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
      approvedEvidenceIds: [
        "docs-main-966e240f03a0912a0ff0c0c890bf0fe0e9a6dd77",
        "docs-writing-art-link-evidence",
        "docs-website-mutation-receipt-evidence",
      ],
    },
    conceptTerritoryId: "manuscript-first",
    conceptTerritoryLabel: "Manuscript first",
    creativeThesis:
      "A restrained image built around one manuscript-specific object and a protected editable title field.",
    primarySubject: "The weathered object identified by approved visual canon",
    supportingSubjects: [],
    compositionRequirements: ["Protect the upper-right title field."],
    mustShow: ["One exact manuscript-specific object."],
    mustNotShow: ["Generated lettering", "Unapproved characters"],
    spoilerRestrictions: ["Do not reveal the final identity."],
    continuityRequirements: ["Match the approved object and period state."],
    historicalAndMaterialRequirements: [
      "Use period-correct material construction.",
    ],
    negativeSpaceRequirements: [
      "Keep 30 percent quiet space for editable type.",
    ],
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

async function shadowInput() {
  const compiled = await compileBookArtProductionWorkOrder(await brief());
  assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
  assert.ok(compiled.workOrder);
  return {
    outputKind: "evavo_book_art_provider_shadow_job_input",
    schemaVersion: 1,
    executionId: "shared-runtime-test-1",
    requestedAt: "2026-08-02T06:00:00.000Z",
    workOrder: compiled.workOrder,
    adapterPolicy: {
      allowedAdapterIds: ["fixture-image"],
      preferredAdapterId: "fixture-image",
      preferredModel: "fixture-transparent-v1",
    },
  };
}

test("rejects a tampered final Docs Suite brief before work-order or provider-job compilation", async () => {
  const value = await brief();
  value.primarySubject += " altered after Docs release";
  const compiled = await compileBookArtProductionWorkOrder(value);
  assert.equal(compiled.status, "blocked");
  assert.ok(
    compiled.blockers.some((item) =>
      item.includes("fingerprint differs from its exact canonical contents"),
    ),
  );
  assert.equal(compiled.workOrder, undefined);
});

test("shared Book Art runtime compiles the exact no-fallback one-attempt contract", async () => {
  const input = await shadowInput();
  const first = await compileBookArtProviderShadowJob(input);
  const second = await compileBookArtProviderShadowJob(structuredClone(input));

  assert.equal(first.status, "ready", first.blockers.join("\n"));
  assert.ok(first.plan);
  assert.deepEqual(first.plan, second.plan);
  assert.equal(first.plan.contract, BOOK_ART_PROVIDER_RUNTIME_CONTRACT);
  assert.equal(first.plan.runtimeSubmission.maximumAttempts, 1);
  assert.deepEqual(
    first.plan.runtimeSubmission.requiredCapabilityProfile,
    first.plan.routingInspection.requiredCapabilities,
  );
  assert.equal(first.plan.normalizedProviderRequest.candidateCount, 1);
  assert.equal(first.plan.normalizedProviderRequest.selection.allowFallback, false);
  assert.equal(first.providerCallPerformed, false);
  assert.equal(first.candidateArtifactsWritten, false);
  assert.equal(first.selectionPerformed, false);
  assert.equal(first.promotionPerformed, false);
  assert.equal(first.publicationPerformed, false);
});

test("shared Book Art runtime submission remains durable and idempotent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-package-"));
  try {
    const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
    const input = await shadowInput();
    const first = await submitBookArtProviderShadowJob(input, {
      runtime,
      actor: "book-art-package-test:first",
    });
    const duplicate = await submitBookArtProviderShadowJob(structuredClone(input), {
      runtime,
      actor: "book-art-package-test:duplicate",
    });

    assert.equal(first.status, "submitted", first.blockers.join("\n"));
    assert.equal(duplicate.status, "submitted", duplicate.blockers.join("\n"));
    assert.ok(first.job);
    assert.ok(duplicate.job);
    assert.equal(first.job.id, duplicate.job.id);
    assert.equal(first.job.specHash, duplicate.job.specHash);
    assert.equal(first.job.attemptLimit, 1);
    assert.equal((await runtime.list()).length, 1);
    assert.equal(
      (await runtime.events()).filter((entry) => entry.type === "job.submitted")
        .length,
      1,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
