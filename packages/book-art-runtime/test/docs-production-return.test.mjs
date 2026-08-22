import assert from "node:assert/strict";
import test from "node:test";

import {
  ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT,
  DOCS_BOOK_WRITING_ART_LINK_CONTRACT,
  DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT,
  fingerprintBookArtBrief,
  fingerprintDocsBookWritingArtReleaseReceipt,
} from "@evavo/art-contracts";
import { normalizeJson, sha256, stableStringify } from "@evavo/art-artifacts";

import {
  DOCS_BOOK_ART_PRODUCTION_RETURN_CONTRACT,
  compileDocsBookArtProductionReturn,
} from "../dist/docs-production-return.js";

const prefixedSha = (character) => `sha256:${character.repeat(64)}`;
const rawSha = (character) => character.repeat(64);
const fingerprint = (value) => sha256(stableStringify(normalizeJson(value)));

async function releaseFixture() {
  const evidence = [
    "evidence:authoring:1",
    prefixedSha("1"),
    prefixedSha("2"),
    prefixedSha("3"),
    prefixedSha("4"),
    prefixedSha("5"),
  ].sort();
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
      manuscriptSha256: prefixedSha("a"),
      extractedTextSha256: prefixedSha("b"),
      visualCanonSha256: prefixedSha("c"),
      artDirectionSha256: prefixedSha("d"),
      approvedEvidenceIds: evidence,
    },
    conceptTerritoryId: "territory:wren:cover:1",
    conceptTerritoryLabel: "Weathered coastal memory",
    creativeThesis:
      "A restrained maritime image binds the revised manuscript to a durable text-free cover field.",
    primarySubject: "A weathered coastal signal tower",
    supportingSubjects: ["low winter sea", "distant working vessel"],
    compositionRequirements: [
      "Keep the principal silhouette in the lower-left third.",
      "Reserve calm negative space for editable title typography.",
    ],
    mustShow: ["historically credible maritime materials"],
    mustNotShow: ["generated title text", "modern navigation equipment"],
    spoilerRestrictions: ["Do not reveal the final harbour confrontation."],
    continuityRequirements: [
      "Match the approved tower and vessel descriptions in the visual canon.",
    ],
    historicalAndMaterialRequirements: [
      "Use period-correct timber, iron and masonry construction.",
    ],
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
    linkFingerprint: prefixedSha("1"),
    mutationId: "mutation:wren:8",
    canonicalMutationPlanFingerprint: prefixedSha("2"),
    websiteMutationReceiptFingerprint: prefixedSha("3"),
    websiteMutationImportFingerprint: prefixedSha("4"),
    projectId: finalArtBrief.identity.projectId,
    programmeId: "programme:wren",
    volumeId: finalArtBrief.identity.bookId,
    manuscriptRevisionId: finalArtBrief.manuscript.manuscriptRevisionId,
    manuscriptSha256: finalArtBrief.manuscript.manuscriptSha256,
    draftArtBriefFingerprint: prefixedSha("5"),
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
    releaseFingerprint:
      await fingerprintDocsBookWritingArtReleaseReceipt(unsignedReceipt),
  };
  return {
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
  };
}

async function fixture() {
  const release = await releaseFixture();
  const candidateArtifactId = "artifact_candidate_wren_cover_01";
  const artifactUnsigned = {
    outputKind: "evavo_book_art_artifact_receipt",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity: structuredClone(release.finalArtBrief.identity),
    sourceBriefFingerprint: release.finalArtBrief.briefFingerprint.replace(
      /^sha256:/,
      "",
    ),
    status: "approved",
    artifactId: "artifact_master_wren_cover_01",
    artifactReference:
      "art-studio://book-art/wren-cover/1/artifact_master_wren_cover_01",
    contentSha256: rawSha("6"),
    byteLength: 4_000_000,
    mimeType: "image/png",
    widthPx: 1800,
    heightPx: 2700,
    provenance: {
      origin: "ai_assisted",
      provider: "reviewed-provider",
      model: "reviewed-cover-model",
      modelVersion: "immutable-version-1",
      promptSha256: rawSha("7"),
      seed: "40291",
      sourceArtifactIds: [
        candidateArtifactId,
        "artifact_selection_evidence_01",
      ],
      rightsEvidenceIds: ["rights:wren:commercial:1"],
      rightsStatus: "approved_commercial",
      aiDisclosure: "ai_assisted",
    },
    technicalQualityReceiptSha256: rawSha("8"),
    selectionReceiptSha256: rawSha("9"),
    promotionReceiptSha256: rawSha("a"),
    promotedBy: "promoter:art:wren",
    promotedAt: "2026-08-03T04:00:00.000Z",
    generatedTextDetected: false,
    unresolvedRisks: [],
    publicationPerformed: false,
  };
  const artifact = {
    ...artifactUnsigned,
    artifactFingerprint: fingerprint(artifactUnsigned),
  };
  const batchUnsigned = {
    outputKind: "evavo_art_studio_book_promotion_batch",
    schemaVersion: 1,
    batchId: "promotion-batch:wren:cover:1",
    sourceArtImportBatchFingerprint: rawSha("b"),
    expectedMigrationItemIds: ["migration:wren:cover:1"],
    items: [{ migrationItemId: "migration:wren:cover:1", artifact }],
    authoritativeWritesPerformed: false,
    artifactBytesRewritten: false,
    publicationPerformed: false,
  };
  return {
    outputKind: "evavo_art_studio_docs_book_production_return_input",
    schemaVersion: 1,
    contract: DOCS_BOOK_ART_PRODUCTION_RETURN_CONTRACT,
    release,
    promotionBatch: {
      ...batchUnsigned,
      batchFingerprint: fingerprint(batchUnsigned),
    },
    migrationItemId: "migration:wren:cover:1",
    purpose: "front_cover_art",
    selection: {
      candidateSetId: "candidate-set:wren:cover:1",
      selectedCandidateId: "candidate:wren:cover:01",
      recommendedCandidateId: "candidate:wren:cover:01",
      selectedCandidateArtifactId: candidateArtifactId,
      candidateSetPlanFingerprintSha256: rawSha("c"),
      executionEvidenceFingerprintSha256: rawSha("d"),
      consensusFingerprintSha256: rawSha("e"),
      selectionReceiptSha256: artifact.selectionReceiptSha256,
      promotionReceiptSha256: artifact.promotionReceiptSha256,
      finalDocsReviewEvidenceId: "evidence:docs:wren-cover-review",
      finalDocsReviewerId: "reviewer:docs:wren",
      candidateProducerId: "producer:cover:wren",
      selectionAuthorityId: "authority:cover-selection:wren",
      productionPromotionId: "promotion:wren:cover:1",
    },
    technicalEvidence: {
      artifactId: artifact.artifactId,
      contentSha256: artifact.contentSha256,
      technicalQualityReceiptSha256: artifact.technicalQualityReceiptSha256,
      widthPx: artifact.widthPx,
      heightPx: artifact.heightPx,
      mimeType: artifact.mimeType,
      effectivePpi: 300,
      generatedTextDetected: false,
      embeddedLogoDetected: false,
      alphaPolicySatisfied: true,
      exactOutputGeometryVerified: true,
      immutableMasterVerified: true,
      inspectedAt: "2026-08-03T04:30:00.000Z",
      inspectedBy: "inspector:technical:wren",
      evidenceId: "evidence:technical:wren-cover",
    },
    returnControl: {
      returnId: "return:wren:cover:1",
      returnedAt: "2026-08-03T05:00:00.000Z",
      returnedBy: "operator:art-return:wren",
      independentAttestorId: "attestor:art-return:wren",
      attestationEvidenceIds: [
        "evidence:docs:wren-cover-review",
        "evidence:technical:wren-cover",
      ].sort(),
    },
    typographyOwnedByDocsSuite: true,
    artworkUseBindingPerformed: false,
    authoritativeDocsWritesPerformed: false,
    publicationPerformed: false,
  };
}

function refreshArtifactAndBatch(input) {
  const artifact = input.promotionBatch.items[0].artifact;
  const { artifactFingerprint: _artifactFingerprint, ...unsignedArtifact } =
    artifact;
  artifact.artifactFingerprint = fingerprint(unsignedArtifact);
  const { batchFingerprint: _batchFingerprint, ...unsignedBatch } =
    input.promotionBatch;
  input.promotionBatch.batchFingerprint = fingerprint(unsignedBatch);
}

test("returns one exact promoted Book cover to Docs without crossing authority", async () => {
  const result = await compileDocsBookArtProductionReturn(await fixture());
  assert.equal(
    result.status,
    "ready_for_docs_book_use_binding",
    result.blockerIds.join("\n"),
  );
  assert.equal(result.readyForDocsBookUseBinding, true);
  assert.equal(result.artStudioSelectionPerformed, true);
  assert.equal(result.artStudioPromotionPerformed, true);
  assert.equal(result.typographyOwnedByDocsSuite, true);
  assert.equal(result.typographyApplied, false);
  assert.equal(result.artworkUseBindingCreated, false);
  assert.equal(result.fullWrapComposed, false);
  assert.equal(result.barcodeApplied, false);
  assert.equal(result.authoritativeDocsWritesPerformed, false);
  assert.equal(result.retailerUploadPerformed, false);
  assert.equal(result.publicationPerformed, false);
});

test("blocks a tampered canonical Docs release", async () => {
  const input = await fixture();
  input.release.releaseReceipt = {
    ...input.release.releaseReceipt,
    manuscriptSha256: prefixedSha("f"),
  };
  const result = await compileDocsBookArtProductionReturn(input);
  assert.equal(result.status, "blocked");
  assert.ok(
    result.blockerIds.some((entry) => entry.includes("release fingerprint")),
  );
});

test("blocks a selected candidate that differs from consensus", async () => {
  const input = await fixture();
  input.selection.recommendedCandidateId = "candidate:wren:cover:02";
  const result = await compileDocsBookArtProductionReturn(input);
  assert.equal(result.status, "blocked");
  assert.ok(
    result.blockerIds.includes(
      "selection:selected_candidate_not_consensus_recommendation",
    ),
  );
});

test("blocks broken source-candidate lineage", async () => {
  const input = await fixture();
  input.promotionBatch.items[0].artifact.provenance.sourceArtifactIds = [
    "artifact_other_candidate_wren_01",
  ];
  refreshArtifactAndBatch(input);
  const result = await compileDocsBookArtProductionReturn(input);
  assert.equal(result.status, "blocked");
  assert.ok(
    result.blockerIds.includes(
      "selection:selected_candidate_artifact_not_in_lineage",
    ),
  );
});

test("blocks byte, generated-text and embedded-logo contamination", async () => {
  const input = await fixture();
  input.promotionBatch.items[0].artifact.contentSha256 = rawSha("f");
  input.promotionBatch.items[0].artifact.generatedTextDetected = true;
  input.technicalEvidence.generatedTextDetected = true;
  input.technicalEvidence.embeddedLogoDetected = true;
  refreshArtifactAndBatch(input);
  const result = await compileDocsBookArtProductionReturn(input);
  assert.equal(result.status, "blocked");
  assert.ok(
    result.blockerIds.includes(
      "selectedArtifact:technical_content_hash_mismatch",
    ),
  );
  assert.ok(
    result.blockerIds.includes(
      "technicalEvidence.generatedTextDetected:must_be_false",
    ),
  );
  assert.equal(result.textFreeArtworkVerified, false);
});

test("blocks collapsed reviewer, inspector and attestor roles", async () => {
  const input = await fixture();
  input.returnControl.independentAttestorId =
    input.technicalEvidence.inspectedBy;
  const result = await compileDocsBookArtProductionReturn(input);
  assert.equal(result.status, "blocked");
  assert.ok(
    result.blockerIds.includes("reviewerSeparation:distinct_roles_required"),
  );
});

test("blocks forged artifact and stale promotion-batch fingerprints", async () => {
  const input = await fixture();
  input.promotionBatch.items[0].artifact.artifactFingerprint = rawSha("0");
  const { batchFingerprint: _batchFingerprint, ...unsignedBatch } =
    input.promotionBatch;
  input.promotionBatch.batchFingerprint = fingerprint(unsignedBatch);
  let result = await compileDocsBookArtProductionReturn(input);
  assert.equal(result.status, "blocked");
  assert.ok(
    result.blockerIds.includes(
      "selectedArtifact:artifact_fingerprint_mismatch",
    ),
  );

  const stale = await fixture();
  stale.promotionBatch.batchFingerprint = rawSha("0");
  result = await compileDocsBookArtProductionReturn(stale);
  assert.equal(result.status, "blocked");
  assert.ok(
    result.blockerIds.includes("promotionBatch:batch_fingerprint_mismatch"),
  );
});
