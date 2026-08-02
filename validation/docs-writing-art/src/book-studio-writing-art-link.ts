import { validateBookArtBriefExact } from "./book-studio-art-brief-exact";
import type { BookArtBriefV1 } from "./book-studio-art-contracts";
import { evaluateBookAuthoringAdmission } from "./book-studio-authoring-admission";
import { validateAndNormalizeBookAuthoringPacket } from "./book-studio-authoring-packet";
import { validateBookAuthoringResult } from "./book-studio-authoring-result-validation";
import type { BookAuthoringAdmissionEvidenceV1 } from "./book-studio-authoring-types";
import { validateBookCanonicalMutationPlan } from "./book-studio-canonical-mutation-plan-validate";
import type { BookCanonicalMutationPlanV1 } from "./book-studio-canonical-mutation-types";
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
  "2e16bcf338174681ef5e4d2a5abdb4ebd9b4e057",
] as const);

export interface BookWritingArtLinkInputV1 {
  outputKind: "evavo_docs_book_writing_art_link_input";
  schemaVersion: 1;
  contract: typeof BOOK_WRITING_ART_LINK_CONTRACT;
  linkId: string;
  canonicalMutationPlan: BookCanonicalMutationPlanV1;
  authoringPacket: unknown;
  writingRequest: unknown;
  writingResponse: unknown;
  authoringResult: unknown;
  admissionEvidence: unknown;
  proposedExtractedTextSha256: string;
  visualCanonSha256: string;
  artDirectionSha256: string;
  draftArtBrief: BookArtBriefV1;
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
  mutationId: string;
  canonicalMutationPlanFingerprint: string;
  projectId: string;
  programmeId: string;
  volumeId: string;
  currentManuscriptRevisionId: string;
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
  draftArtBriefFingerprint?: string;
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
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

type UnknownRecord = Record<string, unknown>;

const INPUT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "linkId",
  "canonicalMutationPlan",
  "authoringPacket",
  "writingRequest",
  "writingResponse",
  "authoringResult",
  "admissionEvidence",
  "proposedExtractedTextSha256",
  "visualCanonSha256",
  "artDirectionSha256",
  "draftArtBrief",
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
  rejectUnknown(root, INPUT_FIELDS, "Book writing-art link input", blockers);
  if (
    root.outputKind !== "evavo_docs_book_writing_art_link_input" ||
    root.schemaVersion !== 1 ||
    root.contract !== BOOK_WRITING_ART_LINK_CONTRACT
  ) {
    blockers.push("Book writing-art link identity or version is invalid.");
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
    blockers.push("Book writing-art link authority flags are invalid.");
  }

  const planBlockers = await validateBookCanonicalMutationPlan(
    root.canonicalMutationPlan,
  );
  blockers.push(...planBlockers);
  const plan = root.canonicalMutationPlan as BookCanonicalMutationPlanV1;

  const packetValidation = await validateAndNormalizeBookAuthoringPacket(
    root.authoringPacket,
  );
  if (packetValidation.status !== "ready" || !packetValidation.packet) {
    blockers.push(
      "Writing-art link requires a valid authoring packet.",
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
      "Writing-art link requires a complete exact Writing Studio response.",
      ...writingValidation.blockers,
    );
    requiredActions.push(...writingValidation.requiredActions);
  }
  const response = writingValidation.response;

  const resultValidation = await validateBookAuthoringResult(
    root.authoringPacket,
    root.authoringResult,
  );
  if (
    resultValidation.status !== "accepted_for_review" ||
    !resultValidation.result
  ) {
    blockers.push(
      "Writing-art link requires an authoring result accepted for review.",
      ...resultValidation.blockers,
    );
    requiredActions.push(...resultValidation.requiredActions);
  }
  const result = resultValidation.result;

  const admissionEvidence = parseAdmissionEvidence(
    root.admissionEvidence,
    blockers,
  );
  const admission = await evaluateBookAuthoringAdmission(
    root.authoringPacket,
    root.authoringResult,
    root.admissionEvidence,
  );
  if (admission.status !== "ready_for_website_compare_and_swap") {
    blockers.push(...admission.blockers);
    requiredActions.push(...admission.requiredActions);
  }

  const draftArtBrief = await parseExactArtBrief(
    root.draftArtBrief,
    "Draft Book Art brief",
    blockers,
  );

  if (packet && plan?.currentSnapshot && plan?.proposedSnapshot) {
    match(packet.projectId, plan.projectId, "Packet project differs from canonical plan.", blockers);
    match(packet.programmeId, plan.programmeId, "Packet programme differs from canonical plan.", blockers);
    match(packet.volumeId, plan.volumeId, "Packet volume differs from canonical plan.", blockers);
    match(
      packet.manuscriptRevisionId,
      plan.currentSnapshot.manuscriptRevisionId,
      "Packet manuscript revision differs from canonical current snapshot.",
      blockers,
    );
    match(
      packet.manuscriptSha256,
      plan.currentSnapshot.manuscriptSha256,
      "Packet manuscript SHA-256 differs from canonical current snapshot.",
      blockers,
    );
  }

  if (response && result) {
    match(
      response.candidateObjectId,
      result.candidateObjectId,
      "Writing candidate object differs from authoring result.",
      blockers,
    );
    match(
      response.candidateSha256,
      result.candidateTextSha256,
      "Writing candidate SHA-256 differs from authoring result.",
      blockers,
    );
    match(
      response.candidateByteLength,
      result.candidateByteLength,
      "Writing candidate byte length differs from authoring result.",
      blockers,
    );
    if (Date.parse(result.completedAt) < Date.parse(response.completedAt)) {
      blockers.push("Authoring result predates the Writing response.");
    }
    const resultEvidence = new Set(result.producedEvidenceIds);
    for (const evidenceId of [
      ...response.voiceEvidenceIds,
      ...response.factEvidenceIds,
      ...response.qualityReceiptIds,
    ]) {
      if (!resultEvidence.has(evidenceId)) {
        blockers.push(`Authoring result is missing Writing evidence ${evidenceId}.`);
      }
    }
  }

  if (result && plan?.proposedSnapshot) {
    match(
      result.manuscriptSha256After,
      plan.proposedSnapshot.manuscriptSha256,
      "Authoring result proposed manuscript differs from canonical plan.",
      blockers,
    );
    compareChangedUnits(result.changedUnits, plan.changedUnits, blockers);
    if (Date.parse(plan.requestedAt) < Date.parse(result.completedAt)) {
      blockers.push("Canonical mutation plan predates the authoring result.");
    }
  }

  match(
    admission.admissionFingerprint,
    plan?.authoringAdmissionFingerprint,
    "Authoring admission fingerprint differs from canonical plan.",
    blockers,
  );
  match(
    admissionEvidence.proposedAfterManuscriptSha256,
    plan?.proposedSnapshot?.manuscriptSha256,
    "Admission proposed manuscript differs from canonical plan.",
    blockers,
  );

  if (draftArtBrief && plan?.proposedSnapshot) {
    match(draftArtBrief.identity.projectId, plan.projectId, "Draft Art brief project differs from plan.", blockers);
    match(draftArtBrief.identity.bookId, plan.volumeId, "Draft Art brief book differs from plan volume.", blockers);
    match(
      draftArtBrief.manuscript.manuscriptRevisionId,
      plan.proposedSnapshot.manuscriptRevisionId,
      "Draft Art brief revision differs from proposed canonical snapshot.",
      blockers,
    );
    match(
      draftArtBrief.manuscript.manuscriptSha256,
      plan.proposedSnapshot.manuscriptSha256,
      "Draft Art brief manuscript differs from proposed canonical snapshot.",
      blockers,
    );
    match(
      draftArtBrief.manuscript.extractedTextSha256,
      proposedExtractedTextSha256,
      "Draft Art brief extracted-text fingerprint differs from Docs evidence.",
      blockers,
    );
    match(
      draftArtBrief.manuscript.visualCanonSha256,
      visualCanonSha256,
      "Draft Art brief visual-canon fingerprint differs from Docs evidence.",
      blockers,
    );
    match(
      draftArtBrief.manuscript.artDirectionSha256,
      artDirectionSha256,
      "Draft Art brief art-direction fingerprint differs from Docs evidence.",
      blockers,
    );
    if (Date.parse(draftArtBrief.createdAt) < Date.parse(plan.requestedAt)) {
      blockers.push("Draft Art brief predates the canonical mutation plan.");
    }
    if (Date.parse(linkedAt) < Date.parse(draftArtBrief.createdAt)) {
      blockers.push("Writing-art link predates the draft Art brief.");
    }
  }

  const requiredEvidenceIds = unique([
    ...(packet?.contextEvidenceIds ?? []),
    ...(writingValidation.request?.requiredEvidenceIds ?? []),
    ...(result?.producedEvidenceIds ?? []),
    ...(response?.voiceEvidenceIds ?? []),
    ...(response?.factEvidenceIds ?? []),
    ...(response?.qualityReceiptIds ?? []),
    ...admissionEvidence.evidenceIds,
    admissionEvidence.evidenceFingerprint,
    admissionEvidence.phraseOverlapReceiptFingerprint,
    admissionEvidence.continuityReceiptFingerprint,
    admissionEvidence.factualIntegrityReceiptFingerprint,
    admissionEvidence.antiGenericityReceiptFingerprint,
    admissionEvidence.independentReviewReceiptFingerprint,
    plan?.planFingerprint ?? "",
    plan?.authoringAdmissionFingerprint ?? "",
    plan?.reviewCraftAdmissionFingerprint ?? "",
    plan?.executionTaskFingerprint ?? "",
    plan?.executionReceiptFingerprint ?? "",
    ...(plan?.evidenceIds ?? []),
    ...(plan?.structuralChangeEvidenceIds ?? []),
  ].filter(Boolean)).sort();
  const approvedEvidence = new Set(
    draftArtBrief?.manuscript.approvedEvidenceIds ?? [],
  );
  for (const evidenceId of requiredEvidenceIds) {
    if (!approvedEvidence.has(evidenceId)) {
      blockers.push(`Draft Art brief is missing approved link evidence ${evidenceId}.`);
    }
  }

  const finalBlockers = unique(blockers);
  const finalActions = unique(requiredActions);
  const status: BookWritingArtLinkReceiptV1["status"] = finalBlockers.length
    ? "blocked"
    : finalActions.length
      ? "needs_work"
      : "ready_for_website_compare_and_swap";
  const unsigned: Omit<BookWritingArtLinkReceiptV1, "linkFingerprint"> = {
    outputKind: "evavo_docs_book_writing_art_link_receipt",
    schemaVersion: 1,
    contract: BOOK_WRITING_ART_LINK_CONTRACT,
    status,
    linkId,
    mutationId: plan?.mutationId ?? "invalid-id",
    canonicalMutationPlanFingerprint:
      plan?.planFingerprint ?? `sha256:${"0".repeat(64)}`,
    projectId: plan?.projectId ?? "invalid-id",
    programmeId: plan?.programmeId ?? "invalid-id",
    volumeId: plan?.volumeId ?? "invalid-id",
    currentManuscriptRevisionId:
      plan?.currentSnapshot?.manuscriptRevisionId ?? "invalid-id",
    proposedManuscriptRevisionId:
      plan?.proposedSnapshot?.manuscriptRevisionId ?? "invalid-id",
    beforeManuscriptSha256:
      plan?.currentSnapshot?.manuscriptSha256 ?? `sha256:${"0".repeat(64)}`,
    proposedAfterManuscriptSha256:
      plan?.proposedSnapshot?.manuscriptSha256 ?? `sha256:${"0".repeat(64)}`,
    proposedExtractedTextSha256,
    visualCanonSha256,
    artDirectionSha256,
    ...(writingValidation.request?.requestFingerprint === undefined
      ? {}
      : { writingRequestFingerprint: writingValidation.request.requestFingerprint }),
    ...(response?.responseFingerprint === undefined
      ? {}
      : { writingResponseFingerprint: response.responseFingerprint }),
    ...(result?.resultFingerprint === undefined
      ? {}
      : { authoringResultFingerprint: result.resultFingerprint }),
    admissionFingerprint: admission.admissionFingerprint,
    ...(draftArtBrief?.briefFingerprint === undefined
      ? {}
      : { draftArtBriefFingerprint: draftArtBrief.briefFingerprint }),
    writingStudioMainCommit,
    artStudioMainCommit,
    requiredEvidenceIds,
    blockers: finalBlockers,
    requiredActions: finalActions,
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
    ...unsigned,
    linkFingerprint: await sha256BookText(canonicalBookJson(unsigned)),
  };
}

function compareChangedUnits(
  resultUnits: Array<{ unitId: string; beforeSha256: string; afterSha256: string }>,
  planUnits: Array<{
    unitId: string;
    beforeSha256?: string;
    afterSha256?: string;
  }>,
  blockers: string[],
): void {
  const resultById = new Map(resultUnits.map((unit) => [unit.unitId, unit]));
  const planById = new Map(planUnits.map((unit) => [unit.unitId, unit]));
  if (resultById.size !== planById.size) {
    blockers.push("Authoring result changed-unit coverage differs from canonical plan.");
  }
  for (const [unitId, planUnit] of planById) {
    const resultUnit = resultById.get(unitId);
    if (
      !resultUnit ||
      resultUnit.beforeSha256 !== planUnit.beforeSha256 ||
      resultUnit.afterSha256 !== planUnit.afterSha256
    ) {
      blockers.push(`Authoring result change ${unitId} differs from canonical plan.`);
    }
  }
}

async function parseExactArtBrief(
  value: unknown,
  label: string,
  blockers: string[],
): Promise<BookArtBriefV1 | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push(`${label} must be an object.`);
    return undefined;
  }
  const brief = value as BookArtBriefV1;
  const validation = await validateBookArtBriefExact(brief);
  if (!validation.valid) {
    blockers.push(`${label} is invalid.`, ...validation.issues);
    return undefined;
  }
  return brief;
}

function parseAdmissionEvidence(
  value: unknown,
  blockers: string[],
): BookAuthoringAdmissionEvidenceV1 {
  const source = record(value, "Admission evidence", blockers);
  rejectUnknown(source, ADMISSION_FIELDS, "Admission evidence", blockers);
  if (
    source.outputKind !== "evavo_docs_book_authoring_admission_evidence" ||
    source.schemaVersion !== 1
  ) {
    blockers.push("Admission evidence identity or version is invalid.");
  }
  return {
    outputKind: "evavo_docs_book_authoring_admission_evidence",
    schemaVersion: 1,
    packetFingerprint: digest(source.packetFingerprint, "packetFingerprint", blockers),
    resultFingerprint: digest(source.resultFingerprint, "resultFingerprint", blockers),
    phraseOverlapReceiptFingerprint: digest(source.phraseOverlapReceiptFingerprint, "phraseOverlapReceiptFingerprint", blockers),
    continuityReceiptFingerprint: digest(source.continuityReceiptFingerprint, "continuityReceiptFingerprint", blockers),
    factualIntegrityReceiptFingerprint: digest(source.factualIntegrityReceiptFingerprint, "factualIntegrityReceiptFingerprint", blockers),
    antiGenericityReceiptFingerprint: digest(source.antiGenericityReceiptFingerprint, "antiGenericityReceiptFingerprint", blockers),
    independentReviewReceiptFingerprint: digest(source.independentReviewReceiptFingerprint, "independentReviewReceiptFingerprint", blockers),
    phraseOverlapPassed: source.phraseOverlapPassed === true,
    continuityPassed: source.continuityPassed === true,
    factualIntegrityPassed: source.factualIntegrityPassed === true,
    antiGenericityPassed: source.antiGenericityPassed === true,
    independentReviewPassed: source.independentReviewPassed === true,
    humanReviewRequired: source.humanReviewRequired === true,
    humanReviewRecorded: source.humanReviewRecorded === true,
    beforeManuscriptSha256: digest(source.beforeManuscriptSha256, "beforeManuscriptSha256", blockers),
    proposedAfterManuscriptSha256: digest(source.proposedAfterManuscriptSha256, "proposedAfterManuscriptSha256", blockers),
    evidenceIds: ids(source.evidenceIds, "evidenceIds", blockers, 16_384, true),
    evidenceFingerprint: digest(source.evidenceFingerprint, "evidenceFingerprint", blockers),
  };
}

function record(value: unknown, label: string, blockers: string[]): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push(`${label} must be an object.`);
    return {};
  }
  return value as UnknownRecord;
}
function rejectUnknown(value: UnknownRecord, allowed: Set<string>, label: string, blockers: string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) blockers.push(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
}
function id(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    blockers.push(`${label} is invalid.`);
    return "invalid-id";
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
function ids(value: unknown, label: string, blockers: string[], maximum: number, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > maximum || (required && value.length < 1)) {
    blockers.push(`${label} is invalid or unbounded.`);
    return [];
  }
  const result = value.map((item) => id(item, label, blockers));
  if (new Set(result).size !== result.length) blockers.push(`${label} contains duplicates.`);
  return unique(result);
}
function compatibleGitCommit(value: unknown, label: string, compatible: Set<string>, blockers: string[]): string {
  if (typeof value !== "string" || !GIT_COMMIT.test(value) || /^0{40}$/.test(value)) {
    blockers.push(`${label} must be a non-zero exact 40-character Git commit.`);
    return "0".repeat(40);
  }
  if (!compatible.has(value)) blockers.push(`${label} is not in the reviewed compatibility set.`);
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
function text(value: unknown, label: string, blockers: string[], maximum: number): string {
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
function match(left: unknown, right: unknown, message: string, blockers: string[]): void {
  if (left !== right) blockers.push(message);
}
function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
