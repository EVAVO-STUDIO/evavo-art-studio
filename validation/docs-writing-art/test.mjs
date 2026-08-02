import assert from "node:assert/strict";
import test from "node:test";

import {
  sealBookArtBrief,
} from "./src/book-studio-art-brief-exact.ts";
import {
  sealWebsiteBookManuscriptCompareAndSwapReceipt,
} from "./src/book-studio-website-manuscript-cas.ts";
import {
  compileBookWritingArtLink,
} from "./src/book-studio-writing-art-link.ts";
import {
  compileBookWritingArtRelease,
} from "./src/book-studio-writing-art-release.ts";

const sha = (character) => `sha256:${character.repeat(64)}`;
const WRITING_MAIN = "c776a9e7f856815dbb92ffec08426cd12f176bea";
const ART_RUNTIME_MAIN = "2f804d8ec4bd3067d72f114a4d4ed8242c3fa585";
const unique = (values) => [...new Set(values)];

async function fixture() {
  const packet = {
    projectId: "project:wren",
    volumeId: "volume:wren:1",
    manuscriptRevisionId: "revision:wren:7",
    manuscriptSha256: sha("a"),
    contextEvidenceIds: ["evidence:packet:1"],
  };
  const request = {
    manuscriptRevisionId: packet.manuscriptRevisionId,
    requestFingerprint: sha("1"),
    requiredEvidenceIds: ["evidence:request:1"],
  };
  const response = {
    candidateObjectId: "candidate:wren:1",
    candidateSha256: sha("b"),
    candidateByteLength: 2400,
    voiceEvidenceIds: ["evidence:voice:1"],
    factEvidenceIds: ["evidence:fact:1"],
    qualityReceiptIds: ["evidence:quality:1"],
    completedAt: "2026-08-02T00:20:00.000Z",
    responseFingerprint: sha("2"),
  };
  const result = {
    candidateObjectId: response.candidateObjectId,
    candidateTextSha256: response.candidateSha256,
    candidateByteLength: response.candidateByteLength,
    completedAt: "2026-08-02T00:25:00.000Z",
    producedEvidenceIds: [
      "evidence:result:1",
      ...response.voiceEvidenceIds,
      ...response.factEvidenceIds,
      ...response.qualityReceiptIds,
    ],
    manuscriptSha256After: sha("c"),
    resultFingerprint: sha("3"),
  };
  const admissionEvidence = {
    outputKind: "evavo_docs_book_authoring_admission_evidence",
    schemaVersion: 1,
    packetFingerprint: sha("4"),
    resultFingerprint: result.resultFingerprint,
    phraseOverlapReceiptFingerprint: sha("5"),
    continuityReceiptFingerprint: sha("6"),
    factualIntegrityReceiptFingerprint: sha("7"),
    antiGenericityReceiptFingerprint: sha("8"),
    independentReviewReceiptFingerprint: sha("9"),
    phraseOverlapPassed: true,
    continuityPassed: true,
    factualIntegrityPassed: true,
    antiGenericityPassed: true,
    independentReviewPassed: true,
    humanReviewRequired: true,
    humanReviewRecorded: true,
    beforeManuscriptSha256: packet.manuscriptSha256,
    proposedAfterManuscriptSha256: result.manuscriptSha256After,
    evidenceIds: ["evidence:admission:1"],
    evidenceFingerprint: sha("d"),
  };
  const proposedRevision = {
    revisionId: "revision:wren:8",
    parentRevisionId: packet.manuscriptRevisionId,
    projectId: packet.projectId,
    volumeId: packet.volumeId,
    manuscriptObjectId: "object:manuscript:wren:8",
    manuscriptStorageVersion: "version:8",
    manuscriptByteLength: 5000,
    manuscriptSha256: result.manuscriptSha256After,
    unitSequenceSha256: sha("e"),
    orderedUnitIds: ["unit:wren:1", "unit:wren:2"],
    createdAt: "2026-08-02T00:35:00.000Z",
    createdBy: "docs-suite-shadow",
    canonical: false,
  };
  const requiredEvidence = unique([
    ...packet.contextEvidenceIds,
    ...request.requiredEvidenceIds,
    ...result.producedEvidenceIds,
    ...response.voiceEvidenceIds,
    ...response.factEvidenceIds,
    ...response.qualityReceiptIds,
    ...admissionEvidence.evidenceIds,
    admissionEvidence.evidenceFingerprint,
    admissionEvidence.phraseOverlapReceiptFingerprint,
    admissionEvidence.continuityReceiptFingerprint,
    admissionEvidence.factualIntegrityReceiptFingerprint,
    admissionEvidence.antiGenericityReceiptFingerprint,
    admissionEvidence.independentReviewReceiptFingerprint,
  ]);
  const draftBrief = await sealBookArtBrief({
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity: {
      workspaceId: "workspace:wren",
      projectId: packet.projectId,
      bookId: packet.volumeId,
      editionId: "edition:wren:paperback",
      requestId: "art-request:wren:1",
    },
    purpose: "front_cover_art",
    manuscript: {
      manuscriptRevisionId: proposedRevision.revisionId,
      manuscriptSha256: proposedRevision.manuscriptSha256,
      extractedTextSha256: sha("f"),
      visualCanonSha256: sha("0"),
      artDirectionSha256: sha("1"),
      approvedEvidenceIds: requiredEvidence,
    },
    conceptTerritoryId: "territory:wren:1",
    conceptTerritoryLabel: "Weathered coastal memory",
    creativeThesis:
      "A restrained maritime image binds the revised manuscript to a durable, text-free cover field.",
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
    createdAt: "2026-08-02T00:45:00.000Z",
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  });
  const linkInput = {
    outputKind: "evavo_docs_book_writing_art_link_input",
    schemaVersion: 1,
    contract: "evavo_docs_book_writing_art_link_v1",
    linkId: "link:wren:1",
    authoringPacket: packet,
    writingRequest: request,
    writingResponse: response,
    authoringResult: result,
    admissionEvidence,
    proposedManuscriptRevision: proposedRevision,
    proposedExtractedTextSha256: draftBrief.manuscript.extractedTextSha256,
    visualCanonSha256: draftBrief.manuscript.visualCanonSha256,
    artDirectionSha256: draftBrief.manuscript.artDirectionSha256,
    artBrief: draftBrief,
    writingStudioMainCommit: WRITING_MAIN,
    artStudioMainCommit: ART_RUNTIME_MAIN,
    linkedAt: "2026-08-02T00:46:00.000Z",
    linkedBy: "docs-suite-shadow",
    crossRepositoryRuntimeSourceImportAllowed: false,
    writingStudioMayCallArtStudioDirectly: false,
    websiteCompatibilityWriterRequired: true,
    docsSuiteCanonicalWriterEnabled: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const linkReceipt = await compileBookWritingArtLink(linkInput);
  assert.equal(
    linkReceipt.status,
    "ready_for_website_compare_and_swap",
    linkReceipt.blockers.join("\n"),
  );
  const casReceipt = await sealWebsiteBookManuscriptCompareAndSwapReceipt({
    outputKind: "evavo_website_book_manuscript_compare_and_swap_receipt",
    schemaVersion: 1,
    contract: "evavo_website_book_manuscript_cas_v1",
    sourceRepository: "EVAVO-STUDIO/Website",
    writerMode: "website_compatibility",
    operationId: "website-cas:wren:8",
    projectId: packet.projectId,
    volumeId: packet.volumeId,
    priorRevisionId: packet.manuscriptRevisionId,
    nextRevisionId: proposedRevision.revisionId,
    beforeManuscriptSha256: packet.manuscriptSha256,
    afterManuscriptSha256: proposedRevision.manuscriptSha256,
    compareAndSwapRequestFingerprint: linkReceipt.linkFingerprint,
    status: "committed",
    evidenceIds: ["evidence:website-cas:1"],
    committedAt: "2026-08-02T00:50:00.000Z",
    committedBy: "website-compatibility-writer",
    canonicalManuscriptMutationPerformed: true,
    docsSuiteCanonicalWriterEnabled: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  });
  const { briefFingerprint: _discarded, ...draftUnsigned } = draftBrief;
  const finalBrief = await sealBookArtBrief({
    ...draftUnsigned,
    manuscript: {
      ...draftBrief.manuscript,
      approvedEvidenceIds: unique([
        ...draftBrief.manuscript.approvedEvidenceIds,
        ...casReceipt.evidenceIds,
        casReceipt.receiptFingerprint,
      ]),
    },
    createdAt: "2026-08-02T00:55:00.000Z",
  });
  return {
    packet,
    request,
    response,
    result,
    admissionEvidence,
    proposedRevision,
    draftBrief,
    finalBrief,
    linkInput,
    linkReceipt,
    casReceipt,
  };
}

function releaseInput(fixture, overrides = {}) {
  return {
    outputKind: "evavo_docs_book_writing_art_release_input",
    schemaVersion: 1,
    contract: "evavo_docs_book_writing_art_release_v1",
    link: fixture.linkInput,
    websiteCompareAndSwapReceipt: fixture.casReceipt,
    artBrief: fixture.finalBrief,
    releasedAt: "2026-08-02T01:00:00.000Z",
    releasedBy: "docs-suite-shadow",
    writingStudioMayCallArtStudioDirectly: false,
    docsSuiteCanonicalWriterEnabled: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
    ...overrides,
  };
}

test("mirrored exact production chain reaches only Art shadow readiness", async () => {
  const value = await fixture();
  const release = await compileBookWritingArtRelease(releaseInput(value));
  assert.equal(release.status, "ready_for_art_shadow", release.blockers.join("\n"));
  assert.equal(release.websiteCompareAndSwapVerified, true);
  assert.equal(release.exactArtBriefVerified, true);
  assert.equal(release.artStudioCandidateMayBeFinal, false);
  assert.equal(release.selectionRequired, true);
  assert.equal(release.promotionRequired, true);
  assert.equal(release.bookUseBindingRequired, true);
  assert.equal(release.runtimeCutoverApproved, false);
  assert.equal(release.publicationPerformed, false);
});

test("mirrored exact source blocks stale brief fingerprints and hidden fields", async () => {
  const value = await fixture();
  const stale = {
    ...value.linkInput,
    artBrief: {
      ...value.draftBrief,
      primarySubject: "Tampered subject without resealing",
    },
  };
  assert.equal((await compileBookWritingArtLink(stale)).status, "blocked");

  await assert.rejects(
    () =>
      sealBookArtBrief({
        ...value.draftBrief,
        briefFingerprint: undefined,
        providerCredential: "must-not-enter-brief",
      }),
    /unsupported fields: providerCredential/,
  );
});

test("mirrored exact source blocks incompatible commits and direct Writing-to-Art authority", async () => {
  const value = await fixture();
  assert.equal(
    (
      await compileBookWritingArtLink({
        ...value.linkInput,
        artStudioMainCommit: "f".repeat(40),
      })
    ).status,
    "blocked",
  );
  assert.equal(
    (
      await compileBookWritingArtLink({
        ...value.linkInput,
        writingStudioMayCallArtStudioDirectly: true,
      })
    ).status,
    "blocked",
  );
});

test("mirrored exact source binds Website CAS to the exact link", async () => {
  const value = await fixture();
  const { receiptFingerprint: _discarded, ...unsigned } = value.casReceipt;
  const unbound = await sealWebsiteBookManuscriptCompareAndSwapReceipt({
    ...unsigned,
    compareAndSwapRequestFingerprint: sha("f"),
  });
  const release = await compileBookWritingArtRelease(
    releaseInput(value, { websiteCompareAndSwapReceipt: unbound }),
  );
  assert.equal(release.status, "blocked");
  assert.ok(
    release.blockers.some((entry) => entry.includes("request fingerprint differs")),
  );
});

test("mirrored exact source blocks missing CAS evidence and creative-intent drift", async () => {
  const value = await fixture();
  const missing = new Set([
    ...value.casReceipt.evidenceIds,
    value.casReceipt.receiptFingerprint,
  ]);
  const { briefFingerprint: _finalFingerprint, ...finalUnsigned } = value.finalBrief;
  const missingBrief = await sealBookArtBrief({
    ...finalUnsigned,
    manuscript: {
      ...value.finalBrief.manuscript,
      approvedEvidenceIds: value.finalBrief.manuscript.approvedEvidenceIds.filter(
        (entry) => !missing.has(entry),
      ),
    },
  });
  const missingRelease = await compileBookWritingArtRelease(
    releaseInput(value, { artBrief: missingBrief }),
  );
  assert.equal(missingRelease.status, "blocked");

  const changedBrief = await sealBookArtBrief({
    ...finalUnsigned,
    primarySubject: "A different unrelated subject",
  });
  const changedRelease = await compileBookWritingArtRelease(
    releaseInput(value, { artBrief: changedBrief }),
  );
  assert.equal(changedRelease.status, "blocked");
  assert.ok(
    changedRelease.blockers.some((entry) => entry.includes("creative intent differs")),
  );
});

test("mirrored exact source blocks impossible revision, brief and release chronology", async () => {
  const value = await fixture();
  const earlyRevision = await compileBookWritingArtLink({
    ...value.linkInput,
    proposedManuscriptRevision: {
      ...value.proposedRevision,
      createdAt: "2026-08-02T00:19:00.000Z",
    },
  });
  assert.equal(earlyRevision.status, "blocked");

  const { briefFingerprint: _fingerprint, ...unsigned } = value.finalBrief;
  const earlyBrief = await sealBookArtBrief({
    ...unsigned,
    createdAt: "2026-08-02T00:49:00.000Z",
  });
  assert.equal(
    (
      await compileBookWritingArtRelease(
        releaseInput(value, { artBrief: earlyBrief }),
      )
    ).status,
    "blocked",
  );
  assert.equal(
    (
      await compileBookWritingArtRelease(
        releaseInput(value, { releasedAt: "2026-08-02T00:54:00.000Z" }),
      )
    ).status,
    "blocked",
  );
});

test("mirrored CAS sealing rejects unknown fields and authority escalation", async () => {
  const value = await fixture();
  const { receiptFingerprint: _discarded, ...unsigned } = value.casReceipt;
  await assert.rejects(
    () =>
      sealWebsiteBookManuscriptCompareAndSwapReceipt({
        ...unsigned,
        providerCredential: "must-not-enter-receipt",
      }),
    /unsupported fields: providerCredential/,
  );
});
