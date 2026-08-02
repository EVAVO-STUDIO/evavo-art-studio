import assert from "node:assert/strict";
import test from "node:test";

import { sealBookArtBrief } from "./src/book-studio-art-brief-exact.ts";
import {
  fingerprintBookCanonicalMutationPlan,
} from "./src/book-studio-canonical-mutation-plan-validate.ts";
import {
  fingerprintWebsiteCanonicalMutationReceipt,
} from "./src/book-studio-canonical-mutation-receipt-parse.ts";
import {
  importWebsiteCanonicalMutationReceipt,
} from "./src/book-studio-canonical-mutation-receipt-import.ts";
import {
  canonicalJson,
  sha256Text,
} from "./src/book-studio-canonical-mutation-shared.ts";
import {
  fingerprintBookCanonicalSnapshot,
} from "./src/book-studio-canonical-mutation-snapshot.ts";
import {
  compileBookWritingArtLink,
} from "./src/book-studio-writing-art-link.ts";
import {
  compileBookWritingArtRelease,
} from "./src/book-studio-writing-art-release.ts";

const sha = (character) => `sha256:${character.repeat(64)}`;
const WRITING_MAIN = "c776a9e7f856815dbb92ffec08426cd12f176bea";
const ART_MAIN = "2e16bcf338174681ef5e4d2a5abdb4ebd9b4e057";
const unique = (values) => [...new Set(values)];

async function snapshot({
  snapshotId,
  revisionNumber,
  manuscriptRevisionId,
  parentRevisionId,
  manuscriptObjectId,
  storageVersion,
  manuscriptSha256,
  textSha256,
}) {
  const orderedUnits = [
    { unitId: "unit:001", ordinal: 1, textSha256 },
  ];
  const unsigned = {
    snapshotId,
    projectId: "project:wren",
    programmeId: "programme:wren",
    volumeId: "volume:wren-1",
    revisionNumber,
    manuscriptRevisionId,
    ...(parentRevisionId === undefined ? {} : { parentRevisionId }),
    manuscriptObjectId,
    manuscriptStorageVersion: storageVersion,
    manuscriptByteLength: 2500 + revisionNumber,
    manuscriptSha256,
    orderedUnits,
    unitSequenceSha256: await sha256Text(canonicalJson(orderedUnits)),
    sourceCoverageFingerprint: sha("9"),
  };
  return {
    ...unsigned,
    stateFingerprint: await fingerprintBookCanonicalSnapshot(unsigned),
  };
}

async function buildScenario() {
  const packet = {
    projectId: "project:wren",
    programmeId: "programme:wren",
    volumeId: "volume:wren-1",
    manuscriptRevisionId: "revision:wren-1:7",
    manuscriptSha256: sha("a"),
    contextEvidenceIds: ["evidence:context:1"],
  };
  const writingRequest = {
    manuscriptRevisionId: packet.manuscriptRevisionId,
    requestFingerprint: sha("1"),
    requiredEvidenceIds: ["evidence:writing:1"],
  };
  const writingResponse = {
    candidateObjectId: "candidate:wren:001",
    candidateSha256: sha("b"),
    candidateByteLength: 2500,
    voiceEvidenceIds: ["voice-evidence:1"],
    factEvidenceIds: ["fact-evidence:1"],
    qualityReceiptIds: ["quality-receipt:1"],
    completedAt: "2026-08-02T00:10:00.000Z",
    responseFingerprint: sha("2"),
  };
  const authoringResult = {
    candidateObjectId: writingResponse.candidateObjectId,
    candidateTextSha256: writingResponse.candidateSha256,
    candidateByteLength: writingResponse.candidateByteLength,
    completedAt: "2026-08-02T00:20:00.000Z",
    producedEvidenceIds: [
      "evidence:result:1",
      ...writingResponse.voiceEvidenceIds,
      ...writingResponse.factEvidenceIds,
      ...writingResponse.qualityReceiptIds,
    ],
    manuscriptSha256After: sha("c"),
    changedUnits: [
      {
        unitId: "unit:001",
        beforeSha256: sha("d"),
        afterSha256: sha("e"),
      },
    ],
    resultFingerprint: sha("3"),
  };
  const admissionEvidence = {
    outputKind: "evavo_docs_book_authoring_admission_evidence",
    schemaVersion: 1,
    packetFingerprint: sha("4"),
    resultFingerprint: authoringResult.resultFingerprint,
    phraseOverlapReceiptFingerprint: sha("5"),
    continuityReceiptFingerprint: sha("6"),
    factualIntegrityReceiptFingerprint: sha("7"),
    antiGenericityReceiptFingerprint: sha("8"),
    independentReviewReceiptFingerprint: sha("f"),
    phraseOverlapPassed: true,
    continuityPassed: true,
    factualIntegrityPassed: true,
    antiGenericityPassed: true,
    independentReviewPassed: true,
    humanReviewRequired: true,
    humanReviewRecorded: true,
    beforeManuscriptSha256: packet.manuscriptSha256,
    proposedAfterManuscriptSha256: authoringResult.manuscriptSha256After,
    evidenceIds: ["evidence:admission:1"],
    evidenceFingerprint: sha("0"),
  };

  const currentSnapshot = await snapshot({
    snapshotId: "snapshot:wren:7",
    revisionNumber: 7,
    manuscriptRevisionId: packet.manuscriptRevisionId,
    parentRevisionId: "revision:wren-1:6",
    manuscriptObjectId: "object/manuscript/wren/7",
    storageVersion: "v7",
    manuscriptSha256: packet.manuscriptSha256,
    textSha256: authoringResult.changedUnits[0].beforeSha256,
  });
  const proposedSnapshot = await snapshot({
    snapshotId: "snapshot:wren:8",
    revisionNumber: 8,
    manuscriptRevisionId: "revision:wren-1:8",
    parentRevisionId: packet.manuscriptRevisionId,
    manuscriptObjectId: "object/manuscript/wren/8",
    storageVersion: "v8",
    manuscriptSha256: authoringResult.manuscriptSha256After,
    textSha256: authoringResult.changedUnits[0].afterSha256,
  });
  const unsignedPlan = {
    outputKind: "evavo_docs_book_canonical_mutation_plan",
    schemaVersion: 1,
    contract: "evavo_docs_book_canonical_mutation_v1",
    status: "ready_for_website_compare_and_swap",
    mutationId: "mutation:wren:8",
    idempotencyKey: "idempotency:wren:8",
    mutationKind: "text_only",
    projectId: packet.projectId,
    programmeId: packet.programmeId,
    volumeId: packet.volumeId,
    currentSnapshot,
    proposedSnapshot,
    changedUnits: [
      {
        unitId: "unit:001",
        beforeSha256: authoringResult.changedUnits[0].beforeSha256,
        afterSha256: authoringResult.changedUnits[0].afterSha256,
        changeKind: "modified",
        actionIds: ["revise-manuscript-text"],
        evidenceIds: ["evidence:change:1"],
      },
    ],
    authoringAdmissionFingerprint: admissionEvidence.evidenceFingerprint,
    authoringAdmissionObjectId: "object/admission/authoring/wren/8",
    reviewCraftAdmissionFingerprint: sha("1"),
    reviewCraftAdmissionObjectId: "object/admission/review/wren/8",
    executionTaskId: "task:wren:8",
    executionTaskFingerprint: sha("2"),
    executionReceiptId: "receipt:wren:8",
    executionReceiptFingerprint: sha("3"),
    structuralChangeEvidenceIds: [],
    expectedWebsiteStateRevision: currentSnapshot.revisionNumber,
    expectedWebsiteStateFingerprint: currentSnapshot.stateFingerprint,
    requestedAt: "2026-08-02T00:30:00.000Z",
    requestedBy: "docs-suite-shadow",
    evidenceIds: ["evidence:canonical-plan:1"],
    rollbackSnapshotObjectId: currentSnapshot.manuscriptObjectId,
    rollbackSnapshotSha256: currentSnapshot.manuscriptSha256,
    blockers: [],
    warnings: [],
    websiteCompatibilityWriterRequired: true,
    docsSuiteCanonicalWriterEnabled: false,
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const canonicalMutationPlan = {
    ...unsignedPlan,
    planFingerprint: await fingerprintBookCanonicalMutationPlan(unsignedPlan),
  };

  const linkEvidence = unique([
    ...packet.contextEvidenceIds,
    ...writingRequest.requiredEvidenceIds,
    ...authoringResult.producedEvidenceIds,
    ...writingResponse.voiceEvidenceIds,
    ...writingResponse.factEvidenceIds,
    ...writingResponse.qualityReceiptIds,
    ...admissionEvidence.evidenceIds,
    admissionEvidence.evidenceFingerprint,
    admissionEvidence.phraseOverlapReceiptFingerprint,
    admissionEvidence.continuityReceiptFingerprint,
    admissionEvidence.factualIntegrityReceiptFingerprint,
    admissionEvidence.antiGenericityReceiptFingerprint,
    admissionEvidence.independentReviewReceiptFingerprint,
    canonicalMutationPlan.planFingerprint,
    canonicalMutationPlan.authoringAdmissionFingerprint,
    canonicalMutationPlan.reviewCraftAdmissionFingerprint,
    canonicalMutationPlan.executionTaskFingerprint,
    canonicalMutationPlan.executionReceiptFingerprint,
    ...canonicalMutationPlan.evidenceIds,
  ]);
  const draftArtBrief = await sealBookArtBrief({
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity: {
      workspaceId: "workspace:wren",
      projectId: packet.projectId,
      bookId: packet.volumeId,
      editionId: "edition:wren:paperback",
      requestId: "art-request:wren:cover:1",
    },
    purpose: "front_cover_art",
    manuscript: {
      manuscriptRevisionId: proposedSnapshot.manuscriptRevisionId,
      manuscriptSha256: proposedSnapshot.manuscriptSha256,
      extractedTextSha256: sha("4"),
      visualCanonSha256: sha("5"),
      artDirectionSha256: sha("6"),
      approvedEvidenceIds: linkEvidence,
    },
    conceptTerritoryId: "territory:wren:cover:1",
    conceptTerritoryLabel: "Weathered coastal memory",
    creativeThesis:
      "A restrained maritime image binds the revised manuscript to a durable text-free cover field.",
    primarySubject: "A weathered coastal signal tower",
    supportingSubjects: ["low winter sea"],
    compositionRequirements: ["Reserve quiet upper space for editable typography."],
    mustShow: ["period-correct working harbour materials"],
    mustNotShow: ["generated title text"],
    spoilerRestrictions: ["Do not reveal the final confrontation."],
    continuityRequirements: ["Match the approved visual canon."],
    historicalAndMaterialRequirements: ["Use period-correct timber and iron."],
    negativeSpaceRequirements: ["Keep the upper third visually quiet."],
    output: {
      widthPx: 1800,
      heightPx: 2700,
      minimumPpi: 300,
      allowedMimeTypes: ["image/png"],
      colourIntent: "cmyk_conversion_required",
      alpha: "forbidden",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    rightsEvidenceIds: ["rights:wren:commercial:1"],
    createdAt: "2026-08-02T00:35:00.000Z",
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  });
  const link = {
    outputKind: "evavo_docs_book_writing_art_link_input",
    schemaVersion: 1,
    contract: "evavo_docs_book_writing_art_link_v1",
    linkId: "writing-art-link:wren:1",
    canonicalMutationPlan,
    authoringPacket: packet,
    writingRequest,
    writingResponse,
    authoringResult,
    admissionEvidence,
    proposedExtractedTextSha256: draftArtBrief.manuscript.extractedTextSha256,
    visualCanonSha256: draftArtBrief.manuscript.visualCanonSha256,
    artDirectionSha256: draftArtBrief.manuscript.artDirectionSha256,
    draftArtBrief,
    writingStudioMainCommit: WRITING_MAIN,
    artStudioMainCommit: ART_MAIN,
    linkedAt: "2026-08-02T00:36:00.000Z",
    linkedBy: "docs-suite-shadow",
    crossRepositoryRuntimeSourceImportAllowed: false,
    writingStudioMayCallArtStudioDirectly: false,
    websiteCompatibilityWriterRequired: true,
    docsSuiteCanonicalWriterEnabled: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const linkReceipt = await compileBookWritingArtLink(link);
  assert.equal(
    linkReceipt.status,
    "ready_for_website_compare_and_swap",
    linkReceipt.blockers.join("\n"),
  );

  const unsignedWebsiteReceipt = {
    outputKind: "evavo_website_book_canonical_mutation_receipt",
    schemaVersion: 1,
    mutationId: canonicalMutationPlan.mutationId,
    idempotencyKey: canonicalMutationPlan.idempotencyKey,
    planFingerprint: canonicalMutationPlan.planFingerprint,
    transactionId: "transaction:wren:8",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: "a".repeat(40),
    sourcePath: "tools/evavo-doc-studio/storage/book-studio/mutations/wren-8.json",
    sourceBlobSha1: "b".repeat(40),
    expectedStateRevision: canonicalMutationPlan.expectedWebsiteStateRevision,
    observedStateRevisionBefore:
      canonicalMutationPlan.expectedWebsiteStateRevision,
    observedStateRevisionAfter:
      canonicalMutationPlan.expectedWebsiteStateRevision + 1,
    expectedStateFingerprint:
      canonicalMutationPlan.expectedWebsiteStateFingerprint,
    observedStateFingerprintBefore:
      canonicalMutationPlan.expectedWebsiteStateFingerprint,
    observedStateFingerprintAfter: proposedSnapshot.stateFingerprint,
    manuscriptRevisionIdBefore: currentSnapshot.manuscriptRevisionId,
    manuscriptRevisionIdAfter: proposedSnapshot.manuscriptRevisionId,
    manuscriptSha256Before: currentSnapshot.manuscriptSha256,
    manuscriptSha256After: proposedSnapshot.manuscriptSha256,
    compareAndSwapSucceeded: true,
    idempotentReplay: false,
    persistedAt: "2026-08-02T00:40:00.000Z",
    persistedBy: "website-compatibility-writer",
    rollbackSnapshotObjectId: currentSnapshot.manuscriptObjectId,
    rollbackSnapshotSha256: currentSnapshot.manuscriptSha256,
    canonicalManuscriptMutationPerformed: true,
    publicationPerformed: false,
  };
  const websiteMutationReceipt = {
    ...unsignedWebsiteReceipt,
    receiptFingerprint: await fingerprintWebsiteCanonicalMutationReceipt(
      unsignedWebsiteReceipt,
    ),
  };
  const websiteImport = await importWebsiteCanonicalMutationReceipt({
    outputKind: "evavo_docs_website_canonical_mutation_receipt_import_input",
    schemaVersion: 1,
    plan: canonicalMutationPlan,
    receipt: websiteMutationReceipt,
    importedAt: "2026-08-02T00:42:00.000Z",
    importedBy: "docs-suite-shadow",
  });
  assert.equal(
    websiteImport.status,
    "ready_for_shadow_observation",
    websiteImport.blockers.join("\n"),
  );

  const { briefFingerprint: _discarded, ...draftUnsigned } = draftArtBrief;
  const finalArtBrief = await sealBookArtBrief({
    ...draftUnsigned,
    manuscript: {
      ...draftArtBrief.manuscript,
      approvedEvidenceIds: unique([
        ...draftArtBrief.manuscript.approvedEvidenceIds,
        linkReceipt.linkFingerprint,
        draftArtBrief.briefFingerprint,
        canonicalMutationPlan.planFingerprint,
        ...canonicalMutationPlan.evidenceIds,
        websiteImport.importFingerprint,
        websiteMutationReceipt.receiptFingerprint,
      ]),
    },
    createdAt: "2026-08-02T00:45:00.000Z",
  });
  const release = {
    outputKind: "evavo_docs_book_writing_art_release_input",
    schemaVersion: 1,
    contract: "evavo_docs_book_writing_art_release_v1",
    link,
    websiteMutationReceipt,
    receiptImportedAt: "2026-08-02T00:42:00.000Z",
    receiptImportedBy: "docs-suite-shadow",
    finalArtBrief,
    releasedAt: "2026-08-02T00:50:00.000Z",
    releasedBy: "docs-suite-shadow",
    writingStudioMayCallArtStudioDirectly: false,
    docsSuiteCanonicalWriterEnabled: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  return {
    packet,
    writingResponse,
    authoringResult,
    canonicalMutationPlan,
    draftArtBrief,
    link,
    linkReceipt,
    websiteMutationReceipt,
    websiteImport,
    finalArtBrief,
    release,
  };
}

test("canonical moved-Writing chain reaches only Art shadow readiness", async () => {
  const value = await buildScenario();
  const release = await compileBookWritingArtRelease(value.release);
  assert.equal(release.status, "ready_for_art_shadow", release.blockers.join("\n"));
  assert.equal(release.writingStudioMainCommit, WRITING_MAIN);
  assert.equal(release.artStudioMainCommit, ART_MAIN);
  assert.equal(release.websiteCanonicalMutationVerified, true);
  assert.equal(release.exactFinalArtBriefVerified, true);
  assert.equal(release.artStudioCandidateMayBeFinal, false);
  assert.equal(release.selectionRequired, true);
  assert.equal(release.promotionRequired, true);
  assert.equal(release.bookUseBindingRequired, true);
  assert.equal(release.runtimeCutoverApproved, false);
  assert.equal(release.publicationPerformed, false);
});

test("canonical link blocks Writing candidate and commit drift", async () => {
  const value = await buildScenario();
  for (const attack of [
    {
      ...value.link,
      writingResponse: {
        ...value.writingResponse,
        candidateSha256: sha("f"),
      },
    },
    { ...value.link, writingStudioMainCommit: "f".repeat(40) },
    { ...value.link, artStudioMainCommit: "e".repeat(40) },
    { ...value.link, writingStudioMayCallArtStudioDirectly: true },
  ]) {
    const result = await compileBookWritingArtLink(attack);
    assert.equal(result.status, "blocked");
  }
});

test("canonical link blocks stale and hidden Book Art brief state", async () => {
  const value = await buildScenario();
  const stale = await compileBookWritingArtLink({
    ...value.link,
    draftArtBrief: {
      ...value.draftArtBrief,
      creativeThesis: `${value.draftArtBrief.creativeThesis} Tampered.`,
    },
  });
  assert.equal(stale.status, "blocked");
  assert.ok(stale.blockers.some((entry) => entry.includes("fingerprint differs")));

  const hidden = await compileBookWritingArtLink({
    ...value.link,
    draftArtBrief: {
      ...value.draftArtBrief,
      adapterPolicy: { allowedAdapterIds: ["unreviewed"] },
    },
  });
  assert.equal(hidden.status, "blocked");
  assert.ok(hidden.blockers.some((entry) => entry.includes("unsupported fields")));
});

test("canonical release blocks failed and substituted Website receipts", async () => {
  const value = await buildScenario();
  const failed = {
    ...value.websiteMutationReceipt,
    compareAndSwapSucceeded: false,
  };
  failed.receiptFingerprint = await fingerprintWebsiteCanonicalMutationReceipt(
    failed,
  );
  const failedResult = await compileBookWritingArtRelease({
    ...value.release,
    websiteMutationReceipt: failed,
  });
  assert.equal(failedResult.status, "blocked");
  assert.ok(
    failedResult.blockers.some((entry) =>
      entry.includes("does not prove a successful"),
    ),
  );

  const substituted = {
    ...value.websiteMutationReceipt,
    planFingerprint: sha("f"),
  };
  substituted.receiptFingerprint =
    await fingerprintWebsiteCanonicalMutationReceipt(substituted);
  const substitutedResult = await compileBookWritingArtRelease({
    ...value.release,
    websiteMutationReceipt: substituted,
  });
  assert.equal(substitutedResult.status, "blocked");
  assert.ok(
    substitutedResult.blockers.some((entry) =>
      entry.includes("does not belong to the exact canonical mutation plan"),
    ),
  );
});

test("canonical release requires post-mutation evidence and unchanged intent", async () => {
  const value = await buildScenario();
  const { briefFingerprint: _fingerprint, ...unsigned } = value.finalArtBrief;
  const missingEvidence = await sealBookArtBrief({
    ...unsigned,
    manuscript: {
      ...value.finalArtBrief.manuscript,
      approvedEvidenceIds:
        value.finalArtBrief.manuscript.approvedEvidenceIds.filter(
          (entry) => entry !== value.websiteImport.importFingerprint,
        ),
    },
  });
  const missingResult = await compileBookWritingArtRelease({
    ...value.release,
    finalArtBrief: missingEvidence,
  });
  assert.equal(missingResult.status, "blocked");
  assert.ok(
    missingResult.blockers.some((entry) =>
      entry.includes("missing approved release evidence"),
    ),
  );

  const changedIntent = await sealBookArtBrief({
    ...unsigned,
    primarySubject: "An unrelated modern city skyline",
  });
  const changedResult = await compileBookWritingArtRelease({
    ...value.release,
    finalArtBrief: changedIntent,
  });
  assert.equal(changedResult.status, "blocked");
  assert.ok(
    changedResult.blockers.some((entry) =>
      entry.includes("creative intent differs"),
    ),
  );
});
