import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT,
  DOCS_BOOK_WRITING_ART_LINK_CONTRACT,
  DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT,
  fingerprintBookArtBrief,
  fingerprintDocsBookWritingArtReleaseReceipt,
} from "@evavo/art-contracts";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

import {
  compileDocsBookArtReleaseShadowJob,
  submitDocsBookArtReleaseShadowJob,
} from "../dist/docs-release.js";

const sha = (character) => `sha256:${character.repeat(64)}`;
const policy = { allowedAdapterIds: ["fixture-image"] };

async function request() {
  const evidence = ["evidence:authoring:1", sha("1"), sha("2"), sha("3"), sha("4"), sha("5")].sort();
  const finalArtBrief = {
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity: {
      workspaceId: "workspace:wren",
      projectId: "project:wren",
      bookId: "volume:wren:1",
      editionId: "edition:wren:paperback",
      requestId: "art-request:wren:cover:release:1",
    },
    purpose: "front_cover_art",
    manuscript: {
      manuscriptRevisionId: "revision:wren:8",
      manuscriptSha256: sha("a"),
      extractedTextSha256: sha("b"),
      visualCanonSha256: sha("c"),
      artDirectionSha256: sha("d"),
      approvedEvidenceIds: evidence,
    },
    conceptTerritoryId: "territory:wren:cover:1",
    conceptTerritoryLabel: "Weathered coastal memory",
    creativeThesis: "A restrained maritime image binds the revised manuscript to a durable text-free cover field.",
    primarySubject: "A weathered coastal signal tower",
    supportingSubjects: ["low winter sea", "distant working vessel"],
    compositionRequirements: ["Keep the principal silhouette in the lower-left third.", "Reserve calm negative space for editable title typography."],
    mustShow: ["historically credible maritime materials"],
    mustNotShow: ["generated title text", "modern navigation equipment"],
    spoilerRestrictions: ["Do not reveal the final harbour confrontation."],
    continuityRequirements: ["Match the approved tower and vessel descriptions in the visual canon."],
    historicalAndMaterialRequirements: ["Use period-correct timber, iron and masonry construction."],
    negativeSpaceRequirements: ["Keep the upper third visually quiet."],
    output: {
      widthPx: 1800,
      heightPx: 2700,
      minimumPpi: 300,
      allowedMimeTypes: ["image/png", "image/tiff"],
      colourIntent: "cmyk_conversion_required",
      alpha: "forbidden",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    rightsEvidenceIds: ["rights:wren:commercial:1"],
    createdAt: "2026-08-03T00:55:00.000Z",
    briefFingerprint: "",
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
  finalArtBrief.briefFingerprint = await fingerprintBookArtBrief(finalArtBrief);
  const unsignedReceipt = {
    outputKind: "evavo_docs_book_writing_art_release_receipt",
    schemaVersion: 1,
    contract: DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT,
    status: "ready_for_art_shadow",
    linkContract: DOCS_BOOK_WRITING_ART_LINK_CONTRACT,
    linkFingerprint: sha("1"),
    mutationId: "mutation:wren:8",
    canonicalMutationPlanFingerprint: sha("2"),
    websiteMutationReceiptFingerprint: sha("3"),
    websiteMutationImportFingerprint: sha("4"),
    projectId: finalArtBrief.identity.projectId,
    programmeId: "programme:wren",
    volumeId: finalArtBrief.identity.bookId,
    manuscriptRevisionId: finalArtBrief.manuscript.manuscriptRevisionId,
    manuscriptSha256: finalArtBrief.manuscript.manuscriptSha256,
    draftArtBriefFingerprint: sha("5"),
    finalArtBriefFingerprint: finalArtBrief.briefFingerprint,
    writingStudioMainCommit: "c776a9e7f856815dbb92ffec08426cd12f176bea",
    artStudioMainCommit: "e9e96fd54a9e9d9c16bbd8faa2231caebb840c45",
    releasedAt: "2026-08-03T01:00:00.000Z",
    releasedBy: "docs-suite-shadow",
    requiredEvidenceIds: evidence,
    blockers: [],
    requiredActions: [],
    websiteCanonicalMutationVerified: true,
    exactFinalArtBriefVerified: true,
    writingStudioMayCallArtStudioDirectly: false,
    docsSuiteCanonicalWriterEnabled: false,
    artStudioCandidateMayBeFinal: false,
    selectionRequired: true,
    promotionRequired: true,
    bookUseBindingRequired: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const releaseReceipt = {
    ...unsignedReceipt,
    releaseFingerprint: await fingerprintDocsBookWritingArtReleaseReceipt(unsignedReceipt),
  };
  return {
    outputKind: "evavo_docs_book_art_release_shadow_job_input",
    schemaVersion: 1,
    executionId: "execution:wren:cover:release:1",
    requestedAt: "2026-08-03T01:06:00.000Z",
    release: {
      outputKind: "evavo_art_studio_docs_book_release_envelope",
      schemaVersion: 1,
      contract: ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT,
      sourceRepository: "EVAVO-STUDIO/evavo-docs-suite",
      targetRepository: "EVAVO-STUDIO/evavo-art-studio",
      docsSuiteCommit: "d7e5cd0f79ebcb211c502d33a90f84e93763f23c",
      receivedAt: "2026-08-03T01:05:00.000Z",
      releaseReceipt,
      finalArtBrief,
      crossRepositoryRuntimeSourceImportAllowed: false,
      writingStudioMayCallArtStudioDirectly: false,
      authoritativeBookWritesAllowed: false,
      runtimeCutoverApproved: false,
      publicationPerformed: false,
    },
    adapterPolicy: policy,
  };
}

test("compiles a verified Docs release into one no-fallback provider job", async () => {
  const result = await compileDocsBookArtReleaseShadowJob(await request());
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  assert.equal(result.releaseVerified, true);
  assert.equal(result.exactFinalArtBriefVerified, true);
  assert.equal(result.plan.runtimeSubmission.maximumAttempts, 1);
  assert.equal(result.plan.normalizedProviderRequest.candidateCount, 1);
  assert.equal(result.plan.normalizedProviderRequest.selection.allowFallback, false);
  assert.equal(result.providerCallPerformed, false);
  assert.equal(result.selectionPerformed, false);
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.bookUseBindingCreated, false);
});

test("submits duplicate Docs releases idempotently without calling a provider", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-docs-book-release-"));
  try {
    const runtime = new LocalRuntimeRepository({ root });
    const input = await request();
    const first = await submitDocsBookArtReleaseShadowJob(input, {
      runtime,
      actor: "docs-release-test",
      now: new Date("2026-08-03T01:06:00.000Z"),
    });
    const second = await submitDocsBookArtReleaseShadowJob(input, {
      runtime,
      actor: "docs-release-test",
      now: new Date("2026-08-03T01:07:00.000Z"),
    });
    assert.equal(first.status, "submitted", first.blockers.join("\n"));
    assert.equal(second.status, "submitted", second.blockers.join("\n"));
    assert.equal(first.job.id, second.job.id);
    assert.equal(first.job.spec.maximumAttempts, 1);
    assert.equal(first.providerCallPerformed, false);
    assert.equal(first.candidateArtifactsWritten, false);
    assert.equal(first.authoritativeBookWritesPerformed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks a tampered Docs release before durable submission", async () => {
  const input = await request();
  input.release.releaseReceipt = {
    ...input.release.releaseReceipt,
    manuscriptSha256: sha("f"),
  };
  const result = await compileDocsBookArtReleaseShadowJob(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("release fingerprint")));
  assert.equal(result.providerCallPerformed, false);
});
