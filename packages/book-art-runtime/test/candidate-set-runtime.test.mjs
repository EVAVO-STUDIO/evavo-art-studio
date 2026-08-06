import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BOOK_ART_CANDIDATE_SET_CONTRACT,
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtCandidateSetWorkOrder,
  compileBookArtProductionWorkOrder,
  fingerprintBookArtBrief,
} from "@evavo/art-contracts";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

import {
  BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT,
  compileBookArtCandidateSetProviderJob,
  submitBookArtCandidateSetProviderJob,
} from "../dist/candidate-set.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

async function candidateSetWorkOrder() {
  const brief = {
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
      manuscriptSha256: digest("a"),
      extractedTextSha256: digest("b"),
      visualCanonSha256: digest("c"),
      artDirectionSha256: digest("d"),
      approvedEvidenceIds: [
        "docs-main-evidence",
        "docs-writing-art-link-evidence",
        "docs-visual-canon-evidence",
      ],
    },
    conceptTerritoryId: "manuscript-first",
    conceptTerritoryLabel: "Manuscript first",
    creativeThesis:
      "Use the admitted damaged brass seal and flood-marked ledger cloth as the exact narrative mechanism, with no generic poster symbolism.",
    primarySubject: "The admitted damaged brass transit seal",
    supportingSubjects: ["Flood-marked ledger cloth"],
    compositionRequirements: [
      "Use an asymmetrical low anchor and protect editable title space.",
    ],
    mustShow: ["The split lower seal tooth"],
    mustNotShow: ["Generated lettering", "Generic fantasy emblems"],
    spoilerRestrictions: ["Do not identify the final owner."],
    continuityRequirements: ["Match the admitted seal damage exactly."],
    historicalAndMaterialRequirements: ["Use 1871 brass and iron construction."],
    negativeSpaceRequirements: ["Protect the upper-right title field."],
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
    rightsEvidenceIds: ["rights-project-owned-visual-canon"],
    createdAt: "2026-08-06T00:00:00.000Z",
    briefFingerprint: "",
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
  brief.briefFingerprint = await fingerprintBookArtBrief(brief);
  const base = await compileBookArtProductionWorkOrder(brief);
  assert.equal(base.status, "ready", base.blockers.join("\n"));
  const set = await compileBookArtCandidateSetWorkOrder({
    outputKind: "evavo_book_art_candidate_set_work_order_compile_input",
    schemaVersion: 1,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    baseWorkOrder: base.workOrder,
    candidateCount: 4,
    requestedAt: "2026-08-06T00:05:00.000Z",
    requestedBy: "book-automation",
    providerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
  });
  assert.equal(set.status, "ready", set.blockers.join("\n"));
  return set.workOrder;
}

async function runtimeInput() {
  return {
    outputKind: "evavo_book_art_candidate_set_provider_job_input",
    schemaVersion: 1,
    executionId: "candidate-set-runtime-test-1",
    requestedAt: "2026-08-06T00:10:00.000Z",
    workOrder: await candidateSetWorkOrder(),
    adapterPolicy: {
      allowedAdapterIds: ["fixture-image"],
      preferredAdapterId: "fixture-image",
      preferredModel: "fixture-transparent-v1",
    },
  };
}

test("compiles one durable no-fallback job that requires the exact four-output set", async () => {
  const input = await runtimeInput();
  const first = await compileBookArtCandidateSetProviderJob(input);
  const second = await compileBookArtCandidateSetProviderJob(
    structuredClone(input),
  );
  assert.equal(first.status, "ready", first.blockers.join("\n"));
  assert.ok(first.plan);
  assert.deepEqual(first.plan, second.plan);
  assert.equal(first.plan.contract, BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT);
  assert.equal(first.plan.candidateCount, 4);
  assert.equal(first.plan.normalizedProviderRequest.candidateCount, 4);
  assert.equal(first.plan.runtimeSubmission.kind, "art.candidate.generate");
  assert.equal(first.plan.runtimeSubmission.maximumAttempts, 1);
  assert.equal(first.plan.normalizedProviderRequest.selection.allowFallback, false);
  assert.equal(first.oneProviderAttemptForEntireSet, true);
  assert.equal(first.selectionPerformed, false);
  assert.equal(first.promotionPerformed, false);
});

test("submits idempotently without creating four provider attempts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-set-"));
  try {
    const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
    const input = await runtimeInput();
    const first = await submitBookArtCandidateSetProviderJob(input, {
      runtime,
      actor: "candidate-set-test:first",
    });
    const duplicate = await submitBookArtCandidateSetProviderJob(
      structuredClone(input),
      {
        runtime,
        actor: "candidate-set-test:duplicate",
      },
    );
    assert.equal(first.status, "submitted", first.blockers.join("\n"));
    assert.equal(duplicate.status, "submitted", duplicate.blockers.join("\n"));
    assert.equal(first.job.id, duplicate.job.id);
    assert.equal(first.job.attemptLimit, 1);
    assert.equal(first.job.spec.payload.candidateCount, 4);
    assert.equal((await runtime.list()).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks candidate-count and fallback tampering before submission", async () => {
  const input = await runtimeInput();
  input.workOrder.providerRequest.candidateCount = 2;
  input.workOrder.candidateCount = 2;
  input.workOrder.providerRequest.selection.allowFallback = true;
  const result = await compileBookArtCandidateSetProviderJob(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /candidate|fallback|fingerprint/i);
});
