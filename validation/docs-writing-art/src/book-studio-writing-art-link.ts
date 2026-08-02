import {
  validateBookArtBriefExact,
} from "./book-studio-art-brief-exact";
import type { BookArtBriefV1 } from "./book-studio-art-contracts";
import { evaluateBookAuthoringAdmission } from "./book-studio-authoring-admission";
import { validateAndNormalizeBookAuthoringPacket } from "./book-studio-authoring-packet";
import { validateBookAuthoringResult } from "./book-studio-authoring-result-validation";
import type { BookAuthoringAdmissionEvidenceV1 } from "./book-studio-authoring-types";
import type { BookManuscriptRevisionV1 } from "./book-studio-manuscript-contracts";
import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
import { validateBookWritingHandoffResponse } from "./book-studio-writing-handoff-response";

export const BOOK_WRITING_ART_LINK_CONTRACT =
  "evavo_docs_book_writing_art_link_v1" as const;

export const BOOK_WRITING_ART_COMPATIBLE_WRITING_STUDIO_COMMITS = Object.freeze([
  "6e523d1d8a06101f732dad4b81e50d61d247120c",
  "c776a9e7f856815dbb92ffec08426cd12f176bea",
] as const);
export const BOOK_WRITING_ART_COMPATIBLE_ART_STUDIO_COMMITS = Object.freeze([
  "2f804d8ec4bd3067d72f114a4d4ed8242c3fa585",
] as const);

export interface BookWritingArtLinkInputV1 {
  outputKind: "evavo_docs_book_writing_art_link_input";
  schemaVersion: 1;
  contract: typeof BOOK_WRITING_ART_LINK_CONTRACT;
  linkId: string;
  authoringPacket: unknown;
  writingRequest: unknown;
  writingResponse: unknown;
  authoringResult: unknown;
  admissionEvidence: unknown;
  proposedManuscriptRevision: BookManuscriptRevisionV1;
  proposedExtractedTextSha256: string;
  visualCanonSha256: string;
  artDirectionSha256: string;
  artBrief: BookArtBriefV1;
  writingStudioMainCommit: string;
  artStudioMainCommit: string;
  linkedAt: string;
  linkedBy: string;
  crossRepositoryRuntimeSourceImportAllowed: false;
  writingStudioMayCallArtStudioDirectly: false;
  websiteCompatibilityWriterRequired: true;
  docsSuiteCanonicalWriterEnabled: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookWritingArtLinkReceiptV1 {
  outputKind: "evavo_docs_book_writing_art_link_receipt";
  schemaVersion: 1;
  contract: typeof BOOK_WRITING_ART_LINK_CONTRACT;
  status: "ready_for_website_compare_and_swap" | "needs_work" | "blocked";
  linkId: string;
  projectId: string;
  volumeId: string;
  priorManuscriptRevisionId: string;
  proposedManuscriptRevisionId: string;
  beforeManuscriptSha256: string;
  proposedAfterManuscriptSha256: string;
  proposedExtractedTextSha256: string;
  visualCanonSha256: string;
  artDirectionSha256: string;
  writingRequestFingerprint?: string;
  writingResponseFingerprint?: string;
  authoringResultFingerprint?: string;
  admissionFingerprint?: string;
  artBriefFingerprint?: string;
  writingStudioMainCommit: string;
  artStudioMainCommit: string;
  requiredEvidenceIds: string[];
  blockers: string[];
  requiredActions: string[];
  linkFingerprint: string;
  crossRepositoryRuntimeSourceImportAllowed: false;
  writingStudioMayCallArtStudioDirectly: false;
  websiteCompatibilityWriterRequired: true;
  docsSuiteCanonicalWriterEnabled: false;
  artStudioCandidateMayBeFinal: false;
  selectionRequired: true;
  promotionRequired: true;
  bookUseBindingRequired: true;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,199}$/;
const OBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:+@/-]{1,299}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

type UnknownRecord = Record<string, unknown>;

const FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "linkId",
  "authoringPacket",
  "writingRequest",
  "writingResponse",
  "authoringResult",
  "admissionEvidence",
  "proposedManuscriptRevision",
  "proposedExtractedTextSha256",
  "visualCanonSha256",
  "artDirectionSha256",
  "artBrief",
  "writingStudioMainCommit",
  "artStudioMainCommit",
  "linkedAt",
  "linkedBy",
  "crossRepositoryRuntimeSourceImportAllowed",
  "writingStudioMayCallArtStudioDirectly",
  "websiteCompatibilityWriterRequired",
  "docsSuiteCanonicalWriterEnabled",
  "runtimeCutoverApproved",
  "publicationPerformed",
]);
const ADMISSION_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "packetFingerprint",
  "resultFingerprint",
  "phraseOverlapReceiptFingerprint",
  "continuityReceiptFingerprint",
  "factualIntegrityReceiptFingerprint",
  "antiGenericityReceiptFingerprint",
  "independentReviewReceiptFingerprint",
  "phraseOverlapPassed",
  "continuityPassed",
  "factualIntegrityPassed",
  "antiGenericityPassed",
  "independentReviewPassed",
  "humanReviewRequired",
  "humanReviewRecorded",
  "beforeManuscriptSha256",
  "proposedAfterManuscriptSha256",
  "evidenceIds",
  "evidenceFingerprint",
]);
const WRITING_COMMITS = new Set<string>(
  BOOK_WRITING_ART_COMPATIBLE_WRITING_STUDIO_COMMITS,
);
const ART_COMMITS = new Set<string>(
  BOOK_WRITING_ART_COMPATIBLE_ART_STUDIO_COMMITS,
);

export async function compileBookWritingArtLink(
  input: unknown,
): Promise<BookWritingArtLinkReceiptV1> {
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  const root = record(input, "Book writing-art link input", blockers);
  rejectUnknown(root, FIELDS, "Book writing-art link input", blockers);

  if (root.outputKind !== "evavo_docs_book_writing_art_link_input") {
    blockers.push("Book writing-art link outputKind is invalid.");
  }
  if (root.schemaVersion !== 1) {
    blockers.push("Book writing-art link schemaVersion is invalid.");
  }
  if (root.contract !== BOOK_WRITING_ART_LINK_CONTRACT) {
    blockers.push("Book writing-art link contract is invalid.");
  }
  const linkId = id(root.linkId, "linkId", blockers);
  const proposedExtractedTextSha256 = digest(
    root.proposedExtractedTextSha256,
    "proposedExtractedTextSha256",
    blockers,
  );
  const visualCanonSha256 = digest(
    root.visualCanonSha256,
    "visualCanonSha256",
    blockers,
  );
  const artDirectionSha256 = digest(
    root.artDirectionSha256,
    "artDirectionSha256",
    blockers,
  );
  const writingStudioMainCommit = compatibleGitCommit(
    root.writingStudioMainCommit,
    "writingStudioMainCommit",
    WRITING_COMMITS,
    blockers,
  );
  const artStudioMainCommit = compatibleGitCommit(
    root.artStudioMainCommit,
    "artStudioMainCommit",
    ART_COMMITS,
    blockers,
  );
  const linkedAt = timestamp(root.linkedAt, "linkedAt", blockers);
  text(root.linkedBy, "linkedBy", blockers, 300);
  if (
    root.crossRepositoryRuntimeSourceImportAllowed !== false ||
    root.writingStudioMayCallArtStudioDirectly !== false ||
    root.websiteCompatibilityWriterRequired !== true ||
    root.docsSuiteCanonicalWriterEnabled !== false ||
    root.runtimeCutoverApproved !== false ||
    root.publicationPerformed !== false
  ) {
    blockers.push(
      "Book writing-art linking must preserve data-contract-only integration, the Website compatibility writer and every cutover and publication gate.",
    );
  }

  const packetValidation = await validateAndNormalizeBookAuthoringPacket(
    root.authoringPacket,
  );
  if (packetValidation.status !== "ready" || !packetValidation.packet) {
    blockers.push(
      "Book writing-art linking requires a valid authoring packet.",
      ...packetValidation.blockers,
    );
  }
  const packet = packetValidation.packet;

  const writingValidation = await validateBookWritingHandoffResponse(
    root.authoringPacket,
    root.writingRequest,
    root.writingResponse,
  );
  if (writingValidation.status !== "ready" || !writingValidation.response) {
    blockers.push(
      "Book writing-art linking requires a complete exact Writing Studio response.",
      ...writingValidation.blockers,
    );
    requiredActions.push(...writingValidation.requiredActions);
  }
  const response = writingValidation.response;

  const authoringValidation = await validateBookAuthoringResult(
    root.authoringPacket,
    root.authoringResult,
  );
  if (
    authoringValidation.status !== "accepted_for_review" ||
    !authoringValidation.result
  ) {
    blockers.push(
      "Book writing-art linking requires an authoring result accepted for review.",
      ...authoringValidation.blockers,
    );
    requiredActions.push(...authoringValidation.requiredActions);
  }
  const result = authoringValidation.result;

  const admission = await evaluateBookAuthoringAdmission(
    root.authoringPacket,
    root.authoringResult,
    root.admissionEvidence,
  );
  if (admission.status !== "ready_for_website_compare_and_swap") {
    requiredActions.push(...admission.requiredActions);
    if (admission.status === "blocked") blockers.push(...admission.blockers);
  }

  const proposedRevision = parseRevision(
    root.proposedManuscriptRevision,
    blockers,
  );
  const admissionEvidence = parseAdmissionEvidence(
    root.admissionEvidence,
    blockers,
  );
  const artBrief = await parseArtBrief(root.artBrief, blockers);

  if (packet) {
    match(
      packet.projectId,
      proposedRevision.projectId,
      "Proposed revision projectId differs from the authoring packet.",
      blockers,
    );
    match(
      packet.volumeId,
      proposedRevision.volumeId,
      "Proposed revision volumeId differs from the authoring packet.",
      blockers,
    );
    match(
      packet.manuscriptRevisionId,
      proposedRevision.parentRevisionId,
      "Proposed revision parent differs from the authoring packet revision.",
      blockers,
    );
    if (proposedRevision.revisionId === packet.manuscriptRevisionId) {
      blockers.push("The proposed manuscript revision must have a new identity.");
    }
    match(
      packet.manuscriptRevisionId,
      writingValidation.request?.manuscriptRevisionId,
      "Writing request manuscript revision differs from the authoring packet.",
      blockers,
    );
  }

  if (result && response) {
    match(
      response.candidateObjectId,
      result.candidateObjectId,
      "Writing candidate object differs from the authoring result.",
      blockers,
    );
    match(
      response.candidateSha256,
      result.candidateTextSha256,
      "Writing candidate SHA-256 differs from the authoring result.",
      blockers,
    );
    match(
      response.candidateByteLength,
      result.candidateByteLength,
      "Writing candidate byte length differs from the authoring result.",
      blockers,
    );
    if (Date.parse(result.completedAt) < Date.parse(response.completedAt)) {
      blockers.push("Authoring result completedAt predates the Writing response.");
    }
    if (Date.parse(proposedRevision.createdAt) < Date.parse(result.completedAt)) {
      blockers.push("Proposed manuscript revision predates the authoring result.");
    }
    const resultEvidence = new Set(result.producedEvidenceIds);
    for (const evidenceId of [
      ...response.voiceEvidenceIds,
      ...response.factEvidenceIds,
      ...response.qualityReceiptIds,
    ]) {
      if (!resultEvidence.has(evidenceId)) {
        blockers.push(
          `Authoring result is missing Writing Studio evidence ${evidenceId}.`,
        );
      }
    }
    match(
      result.manuscriptSha256After,
      proposedRevision.manuscriptSha256,
      "Proposed manuscript revision does not match the admitted authoring result.",
      blockers,
    );
  }

  if (result) {
    match(
      admissionEvidence.proposedAfterManuscriptSha256,
      result.manuscriptSha256After,
      "Admission proposed manuscript SHA-256 differs from the authoring result.",
      blockers,
    );
  }
  match(
    admissionEvidence.proposedAfterManuscriptSha256,
    proposedRevision.manuscriptSha256,
    "Proposed manuscript revision differs from admission evidence.",
    blockers,
  );

  if (artBrief) {
    match(
      artBrief.identity.projectId,
      proposedRevision.projectId,
      "Art brief projectId differs from the proposed manuscript revision.",
      blockers,
    );
    match(
      artBrief.identity.bookId,
      proposedRevision.volumeId,
      "Art brief bookId must equal the Docs Suite volumeId.",
      blockers,
    );
    match(
      artBrief.manuscript.manuscriptRevisionId,
      proposedRevision.revisionId,
      "Art brief manuscript revision differs from the proposed manuscript revision.",
      blockers,
    );
    match(
      artBrief.manuscript.manuscriptSha256,
      proposedRevision.manuscriptSha256,
      "Art brief manuscript SHA-256 differs from the proposed manuscript revision.",
      blockers,
    );
    match(
      artBrief.manuscript.extractedTextSha256,
      proposedExtractedTextSha256,
      "Art brief extracted-text SHA-256 differs from Docs Suite evidence.",
      blockers,
    );
    match(
      artBrief.manuscript.visualCanonSha256,
      visualCanonSha256,
      "Art brief visual-canon SHA-256 differs from Docs Suite evidence.",
      blockers,
    );
    match(
      artBrief.manuscript.artDirectionSha256,
      artDirectionSha256,
      "Art brief art-direction SHA-256 differs from Docs Suite evidence.",
      blockers,
    );
    if (Date.parse(artBrief.createdAt) < Date.parse(proposedRevision.createdAt)) {
      blockers.push("Art brief createdAt predates the proposed manuscript revision.");
    }
    if (Date.parse(linkedAt) < Date.parse(artBrief.createdAt)) {
      blockers.push("Writing-art link timestamp predates the Book Art brief.");
    }
  }

  const admissionReceiptFingerprints = [
    admissionEvidence.evidenceFingerprint,
    admissionEvidence.phraseOverlapReceiptFingerprint,
    admissionEvidence.continuityReceiptFingerprint,
    admissionEvidence.factualIntegrityReceiptFingerprint,
    admissionEvidence.antiGenericityReceiptFingerprint,
    admissionEvidence.independentReviewReceiptFingerprint,
  ];
  const requiredEvidenceIds = unique([
    ...(packet?.contextEvidenceIds ?? []),
    ...(writingValidation.request?.requiredEvidenceIds ?? []),
    ...(result?.producedEvidenceIds ?? []),
    ...(response?.voiceEvidenceIds ?? []),
    ...(response?.factEvidenceIds ?? []),
    ...(response?.qualityReceiptIds ?? []),
    ...admissionEvidence.evidenceIds,
    ...admissionReceiptFingerprints,
  ]).sort();
  const approvedEvidence = new Set(
    artBrief?.manuscript.approvedEvidenceIds ?? [],
  );
  for (const evidenceId of requiredEvidenceIds) {
    if (!approvedEvidence.has(evidenceId)) {
      blockers.push(
        `Book Art brief is missing approved writing or admission evidence ${evidenceId}.`,
      );
    }
  }

  if (proposedRevision.canonical !== false) {
    blockers.push("The proposed manuscript revision cannot be marked canonical.");
  }
  if (
    artBrief?.providerCandidateMayBeFinal !== false ||
    artBrief?.publicationPerformed !== false
  ) {
    blockers.push(
      "The Book Art brief cannot grant provider finality or publication authority.",
    );
  }

  const uniqueBlockers = unique(blockers);
  const uniqueActions = unique(requiredActions);
  const status: BookWritingArtLinkReceiptV1["status"] = uniqueBlockers.length
    ? "blocked"
    : admission.status === "ready_for_website_compare_and_swap" &&
        uniqueActions.length === 0
      ? "ready_for_website_compare_and_swap"
      : "needs_work";
  const withoutFingerprint: Omit<
    BookWritingArtLinkReceiptV1,
    "linkFingerprint"
  > = {
    outputKind: "evavo_docs_book_writing_art_link_receipt",
    schemaVersion: 1,
    contract: BOOK_WRITING_ART_LINK_CONTRACT,
    status,
    linkId,
    projectId: proposedRevision.projectId,
    volumeId: proposedRevision.volumeId,
    priorManuscriptRevisionId: packet?.manuscriptRevisionId ?? "invalid-id",
    proposedManuscriptRevisionId: proposedRevision.revisionId,
    beforeManuscriptSha256:
      packet?.manuscriptSha256 ?? `sha256:${"0".repeat(64)}`,
    proposedAfterManuscriptSha256: proposedRevision.manuscriptSha256,
    proposedExtractedTextSha256,
    visualCanonSha256,
    artDirectionSha256,
    ...(writingValidation.request?.requestFingerprint === undefined
      ? {}
      : {
          writingRequestFingerprint:
            writingValidation.request.requestFingerprint,
        }),
    ...(response?.responseFingerprint === undefined
      ? {}
      : { writingResponseFingerprint: response.responseFingerprint }),
    ...(result?.resultFingerprint === undefined
      ? {}
      : { authoringResultFingerprint: result.resultFingerprint }),
    admissionFingerprint: admission.admissionFingerprint,
    ...(artBrief?.briefFingerprint === undefined
      ? {}
      : { artBriefFingerprint: artBrief.briefFingerprint }),
    writingStudioMainCommit,
    artStudioMainCommit,
    requiredEvidenceIds,
    blockers: uniqueBlockers,
    requiredActions: uniqueActions,
    crossRepositoryRuntimeSourceImportAllowed: false,
    writingStudioMayCallArtStudioDirectly: false,
    websiteCompatibilityWriterRequired: true,
    docsSuiteCanonicalWriterEnabled: false,
    artStudioCandidateMayBeFinal: false,
    selectionRequired: true,
    promotionRequired: true,
    bookUseBindingRequired: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  return {
    ...withoutFingerprint,
    linkFingerprint: await sha256BookText(canonicalBookJson(withoutFingerprint)),
  };
}

async function parseArtBrief(
  value: unknown,
  blockers: string[],
): Promise<BookArtBriefV1 | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push("Book Art brief must be an object.");
    return undefined;
  }
  const artBrief = value as BookArtBriefV1;
  const validation = await validateBookArtBriefExact(artBrief);
  if (!validation.valid) {
    blockers.push(
      "Book writing-art linking requires an exact valid Book Art brief.",
      ...validation.issues,
    );
    return undefined;
  }
  return artBrief;
}

function parseRevision(
  value: unknown,
  blockers: string[],
): BookManuscriptRevisionV1 {
  const source = record(value, "proposedManuscriptRevision", blockers);
  rejectUnknown(
    source,
    new Set([
      "revisionId",
      "parentRevisionId",
      "projectId",
      "volumeId",
      "manuscriptObjectId",
      "manuscriptStorageVersion",
      "manuscriptByteLength",
      "manuscriptSha256",
      "unitSequenceSha256",
      "orderedUnitIds",
      "createdAt",
      "createdBy",
      "canonical",
    ]),
    "proposedManuscriptRevision",
    blockers,
  );
  const parentRevisionId = id(
    source.parentRevisionId,
    "parentRevisionId",
    blockers,
  );
  const revision: BookManuscriptRevisionV1 = {
    revisionId: id(source.revisionId, "revisionId", blockers),
    parentRevisionId,
    projectId: id(source.projectId, "revision projectId", blockers),
    volumeId: id(source.volumeId, "revision volumeId", blockers),
    manuscriptObjectId: objectId(
      source.manuscriptObjectId,
      "manuscriptObjectId",
      blockers,
    ),
    manuscriptStorageVersion: text(
      source.manuscriptStorageVersion,
      "manuscriptStorageVersion",
      blockers,
      300,
    ),
    manuscriptByteLength: integer(
      source.manuscriptByteLength,
      "manuscriptByteLength",
      blockers,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    manuscriptSha256: digest(
      source.manuscriptSha256,
      "revision manuscriptSha256",
      blockers,
    ),
    unitSequenceSha256: digest(
      source.unitSequenceSha256,
      "unitSequenceSha256",
      blockers,
    ),
    orderedUnitIds: ids(
      source.orderedUnitIds,
      "orderedUnitIds",
      blockers,
      1_000_000,
      true,
    ),
    createdAt: timestamp(source.createdAt, "revision createdAt", blockers),
    createdBy: text(source.createdBy, "revision createdBy", blockers, 300),
    canonical: false,
  };
  if (source.canonical !== false) {
    blockers.push("proposedManuscriptRevision.canonical must remain false.");
  }
  return revision;
}

function parseAdmissionEvidence(
  value: unknown,
  blockers: string[],
): BookAuthoringAdmissionEvidenceV1 {
  const source = record(value, "admissionEvidence", blockers);
  rejectUnknown(source, ADMISSION_FIELDS, "admissionEvidence", blockers);
  if (source.outputKind !== "evavo_docs_book_authoring_admission_evidence") {
    blockers.push("admissionEvidence outputKind is invalid.");
  }
  if (source.schemaVersion !== 1) {
    blockers.push("admissionEvidence schemaVersion is invalid.");
  }
  for (const field of [
    "phraseOverlapPassed",
    "continuityPassed",
    "factualIntegrityPassed",
    "antiGenericityPassed",
    "independentReviewPassed",
    "humanReviewRequired",
    "humanReviewRecorded",
  ]) {
    if (source[field] !== true && source[field] !== false) {
      blockers.push(`admissionEvidence ${field} must be boolean.`);
    }
  }
  return {
    outputKind: "evavo_docs_book_authoring_admission_evidence",
    schemaVersion: 1,
    packetFingerprint: digest(
      source.packetFingerprint,
      "admission packetFingerprint",
      blockers,
    ),
    resultFingerprint: digest(
      source.resultFingerprint,
      "admission resultFingerprint",
      blockers,
    ),
    phraseOverlapReceiptFingerprint: digest(
      source.phraseOverlapReceiptFingerprint,
      "phraseOverlapReceiptFingerprint",
      blockers,
    ),
    continuityReceiptFingerprint: digest(
      source.continuityReceiptFingerprint,
      "continuityReceiptFingerprint",
      blockers,
    ),
    factualIntegrityReceiptFingerprint: digest(
      source.factualIntegrityReceiptFingerprint,
      "factualIntegrityReceiptFingerprint",
      blockers,
    ),
    antiGenericityReceiptFingerprint: digest(
      source.antiGenericityReceiptFingerprint,
      "antiGenericityReceiptFingerprint",
      blockers,
    ),
    independentReviewReceiptFingerprint: digest(
      source.independentReviewReceiptFingerprint,
      "independentReviewReceiptFingerprint",
      blockers,
    ),
    phraseOverlapPassed: source.phraseOverlapPassed === true,
    continuityPassed: source.continuityPassed === true,
    factualIntegrityPassed: source.factualIntegrityPassed === true,
    antiGenericityPassed: source.antiGenericityPassed === true,
    independentReviewPassed: source.independentReviewPassed === true,
    humanReviewRequired: source.humanReviewRequired === true,
    humanReviewRecorded: source.humanReviewRecorded === true,
    beforeManuscriptSha256: digest(
      source.beforeManuscriptSha256,
      "beforeManuscriptSha256",
      blockers,
    ),
    proposedAfterManuscriptSha256: digest(
      source.proposedAfterManuscriptSha256,
      "proposedAfterManuscriptSha256",
      blockers,
    ),
    evidenceIds: ids(
      source.evidenceIds,
      "admission evidenceIds",
      blockers,
      16_384,
      true,
    ),
    evidenceFingerprint: digest(
      source.evidenceFingerprint,
      "admission evidenceFingerprint",
      blockers,
    ),
  };
}

function record(
  value: unknown,
  label: string,
  blockers: string[],
): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push(`${label} must be an object.`);
    return {};
  }
  return value as UnknownRecord;
}
function rejectUnknown(
  value: UnknownRecord,
  allowed: Set<string>,
  label: string,
  blockers: string[],
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) {
    blockers.push(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
  }
}
function id(value: unknown, label: string, blockers: string[]): string {
  if (
    typeof value !== "string" ||
    !SAFE_ID.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  ) {
    blockers.push(`${label} is invalid.`);
    return "invalid-id";
  }
  return value;
}
function objectId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !OBJECT_ID.test(value)) {
    blockers.push(`${label} is invalid.`);
    return "invalid-object";
  }
  return value;
}
function digest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    blockers.push(`${label} must be an exact sha256: digest.`);
    return `sha256:${"0".repeat(64)}`;
  }
  return value;
}
function compatibleGitCommit(
  value: unknown,
  label: string,
  compatible: Set<string>,
  blockers: string[],
): string {
  if (
    typeof value !== "string" ||
    !GIT_COMMIT.test(value) ||
    /^0{40}$/.test(value)
  ) {
    blockers.push(`${label} must be a non-zero exact 40-character Git commit.`);
    return "0".repeat(40);
  }
  if (!compatible.has(value)) {
    blockers.push(`${label} is not in the reviewed compatibility set.`);
  }
  return value;
}
function timestamp(value: unknown, label: string, blockers: string[]): string {
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    blockers.push(`${label} must be canonical UTC ISO-8601.`);
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}
function text(
  value: unknown,
  label: string,
  blockers: string[],
  maximum: number,
): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    blockers.push(`${label} is invalid.`);
    return "invalid";
  }
  return value;
}
function integer(
  value: unknown,
  label: string,
  blockers: string[],
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    blockers.push(`${label} is invalid.`);
    return minimum;
  }
  return Number(value);
}
function ids(
  value: unknown,
  label: string,
  blockers: string[],
  maximum: number,
  required: boolean,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    (required && value.length < 1)
  ) {
    blockers.push(`${label} is invalid or unbounded.`);
    return [];
  }
  const result = value.map((item) => id(item, label, blockers));
  if (new Set(result).size !== result.length) {
    blockers.push(`${label} contains duplicates.`);
  }
  return unique(result);
}
function match(
  left: unknown,
  right: unknown,
  message: string,
  blockers: string[],
): void {
  if (left !== right) blockers.push(message);
}
function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
