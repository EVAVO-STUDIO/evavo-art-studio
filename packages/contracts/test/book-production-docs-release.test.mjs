import assert from "node:assert/strict";
import test from "node:test";

import {
  ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT,
  DOCS_BOOK_WRITING_ART_LINK_CONTRACT,
  DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT,
  compileDocsBookArtReleaseEnvelope,
  fingerprintBookArtBrief,
  fingerprintDocsBookWritingArtReleaseReceipt,
} from "../dist/index.js";

const sha = (character) => `sha256:${character.repeat(64)}`;
const DOCS_MAIN = "d7e5cd0f79ebcb211c502d33a90f84e93763f23c";
const WRITING_MAIN = "c776a9e7f856815dbb92ffec08426cd12f176bea";
const ART_RECEIVER = "e9e96fd54a9e9d9c16bbd8faa2231caebb840c45";

async function brief(overrides = {}) {
  const evidence = [
    "evidence:authoring:1",
    sha("1"),
    sha("2"),
    sha("3"),
    sha("4"),
    sha("5"),
  ].sort();
  const value = {
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity: {
      workspaceId: "workspace:wren",
      projectId: "project:wren",
      bookId: "volume:wren:1",
      editionId: "edition:wren:paperback",
      requestId: "art-request:wren:cover:1",
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
    ...overrides,
  };
  value.briefFingerprint = await fingerprintBookArtBrief(value);
  return value;
}

async function receipt(finalBrief, overrides = {}) {
  const unsigned = {
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
    projectId: finalBrief.identity.projectId,
    programmeId: "programme:wren",
    volumeId: finalBrief.identity.bookId,
    manuscriptRevisionId: finalBrief.manuscript.manuscriptRevisionId,
    manuscriptSha256: finalBrief.manuscript.manuscriptSha256,
    draftArtBriefFingerprint: sha("5"),
    finalArtBriefFingerprint: finalBrief.briefFingerprint,
    writingStudioMainCommit: WRITING_MAIN,
    artStudioMainCommit: ART_RECEIVER,
    releasedAt: "2026-08-03T01:00:00.000Z",
    releasedBy: "docs-suite-shadow",
    requiredEvidenceIds: [...finalBrief.manuscript.approvedEvidenceIds].sort(),
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
    ...overrides,
  };
  return {
    ...unsigned,
    releaseFingerprint:
      await fingerprintDocsBookWritingArtReleaseReceipt(unsigned),
  };
}

async function envelope(overrides = {}) {
  const finalArtBrief = await brief();
  const releaseReceipt = await receipt(finalArtBrief);
  return {
    outputKind: "evavo_art_studio_docs_book_release_envelope",
    schemaVersion: 1,
    contract: ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT,
    sourceRepository: "EVAVO-STUDIO/evavo-docs-suite",
    targetRepository: "EVAVO-STUDIO/evavo-art-studio",
    docsSuiteCommit: DOCS_MAIN,
    receivedAt: "2026-08-03T01:05:00.000Z",
    releaseReceipt,
    finalArtBrief,
    crossRepositoryRuntimeSourceImportAllowed: false,
    writingStudioMayCallArtStudioDirectly: false,
    authoritativeBookWritesAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
    ...overrides,
  };
}

test("verifies one exact Docs Suite writing-to-art release and compiles its final brief", async () => {
  const result = await compileDocsBookArtReleaseEnvelope(await envelope());
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  assert.equal(result.releaseVerified, true);
  assert.equal(result.exactFinalArtBriefVerified, true);
  assert.equal(result.workOrder.sourceBriefFingerprint, result.releaseReceipt.finalArtBriefFingerprint);
  assert.equal(result.workOrder.identity.projectId, "project:wren");
  assert.equal(result.workOrder.authoritativeWritesPerformed, false);
  assert.equal(result.workOrder.providerCandidateMayBeFinal, false);
  assert.equal(result.selectionPerformed, false);
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.bookUseBindingCreated, false);
  assert.equal(result.runtimeCutoverApproved, false);
  assert.equal(result.publicationPerformed, false);
});

test("rejects release receipt, final brief and manuscript drift", async () => {
  const value = await envelope();
  const attacks = [
    {
      ...value,
      releaseReceipt: {
        ...value.releaseReceipt,
        manuscriptSha256: sha("f"),
      },
    },
    {
      ...value,
      finalArtBrief: {
        ...value.finalArtBrief,
        creativeThesis: `${value.finalArtBrief.creativeThesis} Tampered.`,
      },
    },
    {
      ...value,
      releaseReceipt: await receipt(value.finalArtBrief, {
        manuscriptRevisionId: "revision:wren:9",
      }),
    },
  ];
  for (const attack of attacks) {
    const result = await compileDocsBookArtReleaseEnvelope(attack);
    assert.equal(result.status, "blocked");
  }
});

test("rejects missing release evidence and incompatible repository commits", async () => {
  const value = await envelope();
  const missingEvidenceBrief = await brief({
    manuscript: {
      ...value.finalArtBrief.manuscript,
      approvedEvidenceIds: value.finalArtBrief.manuscript.approvedEvidenceIds.filter(
        (entry) => entry !== sha("4"),
      ),
    },
  });
  const missingEvidenceReceipt = await receipt(missingEvidenceBrief, {
    requiredEvidenceIds: value.releaseReceipt.requiredEvidenceIds,
  });
  for (const attack of [
    {
      ...value,
      finalArtBrief: missingEvidenceBrief,
      releaseReceipt: missingEvidenceReceipt,
    },
    { ...value, docsSuiteCommit: "f".repeat(40) },
    {
      ...value,
      releaseReceipt: await receipt(value.finalArtBrief, {
        writingStudioMainCommit: "e".repeat(40),
      }),
    },
    {
      ...value,
      releaseReceipt: await receipt(value.finalArtBrief, {
        artStudioMainCommit: "d".repeat(40),
      }),
    },
  ]) {
    const result = await compileDocsBookArtReleaseEnvelope(attack);
    assert.equal(result.status, "blocked");
  }
});

test("rejects authority escalation, unknown fields and impossible chronology", async () => {
  const value = await envelope();
  for (const attack of [
    { ...value, authoritativeBookWritesAllowed: true },
    { ...value, extraAuthority: true },
    {
      ...value,
      releaseReceipt: await receipt(value.finalArtBrief, {
        artStudioCandidateMayBeFinal: true,
      }),
    },
    {
      ...value,
      receivedAt: "2026-08-03T00:59:00.000Z",
    },
  ]) {
    const result = await compileDocsBookArtReleaseEnvelope(attack);
    assert.equal(result.status, "blocked");
  }
});
