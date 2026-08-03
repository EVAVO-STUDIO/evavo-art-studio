import type {
  BookArtBriefV1,
  BookArtIdentityV1,
} from "./book-production.js";
import {
  compileBookArtProductionWorkOrder,
  fingerprintBookArtBrief,
  type BookArtProductionWorkOrderV1,
} from "./book-production-profile.js";

export const DOCS_BOOK_ART_RELEASE_SCHEMA_VERSION = 1 as const;
export const DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT =
  "evavo_docs_book_writing_art_release_v1" as const;
export const DOCS_BOOK_WRITING_ART_LINK_CONTRACT =
  "evavo_docs_book_writing_art_link_v1" as const;
export const ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT =
  "evavo_art_studio_docs_book_release_v1" as const;

export const DOCS_BOOK_RELEASE_COMPATIBLE_DOCS_SUITE_COMMITS = Object.freeze([
  "d7e5cd0f79ebcb211c502d33a90f84e93763f23c",
] as const);
export const DOCS_BOOK_RELEASE_COMPATIBLE_WRITING_STUDIO_COMMITS = Object.freeze([
  "c776a9e7f856815dbb92ffec08426cd12f176bea",
] as const);
export const DOCS_BOOK_RELEASE_COMPATIBLE_ART_STUDIO_RECEIVER_COMMITS =
  Object.freeze([
    "e9e96fd54a9e9d9c16bbd8faa2231caebb840c45",
  ] as const);

export interface DocsBookWritingArtReleaseReceiptV1 {
  outputKind: "evavo_docs_book_writing_art_release_receipt";
  schemaVersion: 1;
  contract: typeof DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT;
  status: "ready_for_art_shadow" | "needs_work" | "blocked";
  linkContract: typeof DOCS_BOOK_WRITING_ART_LINK_CONTRACT;
  linkFingerprint: string;
  mutationId: string;
  canonicalMutationPlanFingerprint: string;
  websiteMutationReceiptFingerprint?: string;
  websiteMutationImportFingerprint?: string;
  projectId: string;
  programmeId: string;
  volumeId: string;
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  draftArtBriefFingerprint?: string;
  finalArtBriefFingerprint?: string;
  writingStudioMainCommit: string;
  artStudioMainCommit: string;
  releasedAt: string;
  releasedBy: string;
  requiredEvidenceIds: string[];
  blockers: string[];
  requiredActions: string[];
  releaseFingerprint: string;
  websiteCanonicalMutationVerified: boolean;
  exactFinalArtBriefVerified: boolean;
  writingStudioMayCallArtStudioDirectly: false;
  docsSuiteCanonicalWriterEnabled: false;
  artStudioCandidateMayBeFinal: false;
  selectionRequired: true;
  promotionRequired: true;
  bookUseBindingRequired: true;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface DocsBookArtReleaseEnvelopeV1 {
  outputKind: "evavo_art_studio_docs_book_release_envelope";
  schemaVersion: typeof DOCS_BOOK_ART_RELEASE_SCHEMA_VERSION;
  contract: typeof ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT;
  sourceRepository: "EVAVO-STUDIO/evavo-docs-suite";
  targetRepository: "EVAVO-STUDIO/evavo-art-studio";
  docsSuiteCommit: string;
  receivedAt: string;
  releaseReceipt: DocsBookWritingArtReleaseReceiptV1;
  finalArtBrief: BookArtBriefV1;
  crossRepositoryRuntimeSourceImportAllowed: false;
  writingStudioMayCallArtStudioDirectly: false;
  authoritativeBookWritesAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface DocsBookArtReleaseCompilationResultV1 {
  outputKind: "evavo_art_studio_docs_book_release_compilation_result";
  schemaVersion: typeof DOCS_BOOK_ART_RELEASE_SCHEMA_VERSION;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  releaseReceipt?: DocsBookWritingArtReleaseReceiptV1;
  workOrder?: BookArtProductionWorkOrderV1;
  blockers: string[];
  warnings: string[];
  releaseVerified: boolean;
  exactFinalArtBriefVerified: boolean;
  shadowOnly: true;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  authoritativeBookWritesPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ENVELOPE_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "sourceRepository",
  "targetRepository",
  "docsSuiteCommit",
  "receivedAt",
  "releaseReceipt",
  "finalArtBrief",
  "crossRepositoryRuntimeSourceImportAllowed",
  "writingStudioMayCallArtStudioDirectly",
  "authoritativeBookWritesAllowed",
  "runtimeCutoverApproved",
  "publicationPerformed",
]);
const RECEIPT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "status",
  "linkContract",
  "linkFingerprint",
  "mutationId",
  "canonicalMutationPlanFingerprint",
  "websiteMutationReceiptFingerprint",
  "websiteMutationImportFingerprint",
  "projectId",
  "programmeId",
  "volumeId",
  "manuscriptRevisionId",
  "manuscriptSha256",
  "draftArtBriefFingerprint",
  "finalArtBriefFingerprint",
  "writingStudioMainCommit",
  "artStudioMainCommit",
  "releasedAt",
  "releasedBy",
  "requiredEvidenceIds",
  "blockers",
  "requiredActions",
  "releaseFingerprint",
  "websiteCanonicalMutationVerified",
  "exactFinalArtBriefVerified",
  "writingStudioMayCallArtStudioDirectly",
  "docsSuiteCanonicalWriterEnabled",
  "artStudioCandidateMayBeFinal",
  "selectionRequired",
  "promotionRequired",
  "bookUseBindingRequired",
  "runtimeCutoverApproved",
  "publicationPerformed",
]);
const DOCS_COMMITS = new Set<string>(
  DOCS_BOOK_RELEASE_COMPATIBLE_DOCS_SUITE_COMMITS,
);
const WRITING_COMMITS = new Set<string>(
  DOCS_BOOK_RELEASE_COMPATIBLE_WRITING_STUDIO_COMMITS,
);
const ART_RECEIVER_COMMITS = new Set<string>(
  DOCS_BOOK_RELEASE_COMPATIBLE_ART_STUDIO_RECEIVER_COMMITS,
);

type UnknownRecord = Record<string, unknown>;

export async function fingerprintDocsBookWritingArtReleaseReceipt(
  value:
    | Omit<DocsBookWritingArtReleaseReceiptV1, "releaseFingerprint">
    | DocsBookWritingArtReleaseReceiptV1,
): Promise<string> {
  const { releaseFingerprint: _discarded, ...unsigned } =
    value as DocsBookWritingArtReleaseReceiptV1;
  return sha256Prefixed(canonicalJson(unsigned));
}

export async function compileDocsBookArtReleaseEnvelope(
  value: unknown,
): Promise<DocsBookArtReleaseCompilationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = record(value);
  if (!input) {
    return blocked(emptyIdentity(), ["Docs Book Art release envelope must be one object."], warnings);
  }
  rejectUnknown(input, ENVELOPE_FIELDS, "Docs Book Art release envelope", blockers);
  if (
    input.outputKind !== "evavo_art_studio_docs_book_release_envelope" ||
    input.schemaVersion !== DOCS_BOOK_ART_RELEASE_SCHEMA_VERSION ||
    input.contract !== ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT
  ) {
    blockers.push("Docs Book Art release envelope kind, version or contract is invalid.");
  }
  if (
    input.sourceRepository !== "EVAVO-STUDIO/evavo-docs-suite" ||
    input.targetRepository !== "EVAVO-STUDIO/evavo-art-studio"
  ) {
    blockers.push("Docs Book Art release source or target repository is invalid.");
  }
  const docsSuiteCommit = gitCommit(
    input.docsSuiteCommit,
    "Docs Suite release commit",
    blockers,
  );
  if (docsSuiteCommit && !DOCS_COMMITS.has(docsSuiteCommit)) {
    blockers.push("Docs Suite release commit is not in the reviewed compatibility set.");
  }
  const receivedAt = timestamp(input.receivedAt, "receivedAt", blockers);
  if (
    input.crossRepositoryRuntimeSourceImportAllowed !== false ||
    input.writingStudioMayCallArtStudioDirectly !== false ||
    input.authoritativeBookWritesAllowed !== false ||
    input.runtimeCutoverApproved !== false ||
    input.publicationPerformed !== false
  ) {
    blockers.push("Docs Book Art release envelope authority flags are invalid.");
  }

  const receiptRecord = record(input.releaseReceipt);
  let receipt: DocsBookWritingArtReleaseReceiptV1 | undefined;
  if (!receiptRecord) {
    blockers.push("Docs Book Art release receipt must be one object.");
  } else {
    rejectUnknown(receiptRecord, RECEIPT_FIELDS, "Docs Book Art release receipt", blockers);
    receipt = receiptRecord as unknown as DocsBookWritingArtReleaseReceiptV1;
    validateReleaseReceipt(receipt, blockers);
    if (isTimestamp(receipt.releasedAt) && receivedAt) {
      if (Date.parse(receivedAt) < Date.parse(receipt.releasedAt)) {
        blockers.push("Art Studio received the release before Docs Suite released it.");
      }
    }
    if (SHA256.test(receipt.releaseFingerprint)) {
      const expected = await fingerprintDocsBookWritingArtReleaseReceipt(receipt);
      if (receipt.releaseFingerprint !== expected) {
        blockers.push(
          "Docs Book Art release fingerprint differs from its exact canonical contents.",
        );
      }
    }
  }

  const workOrderCompilation = await compileBookArtProductionWorkOrder(
    input.finalArtBrief,
  );
  blockers.push(...workOrderCompilation.blockers);
  warnings.push(...workOrderCompilation.warnings);
  const workOrder = workOrderCompilation.workOrder;
  const identity = workOrderCompilation.identity;
  const brief = input.finalArtBrief as BookArtBriefV1;
  let exactFinalArtBriefVerified = false;
  if (workOrderCompilation.status === "ready" && workOrder && receipt) {
    const expectedBriefFingerprint = await fingerprintBookArtBrief(brief);
    exactFinalArtBriefVerified =
      brief.briefFingerprint === expectedBriefFingerprint &&
      receipt.finalArtBriefFingerprint === expectedBriefFingerprint;
    if (!exactFinalArtBriefVerified) {
      blockers.push(
        "Docs release final Art brief fingerprint differs from the exact received brief.",
      );
    }
    match(
      receipt.projectId,
      brief.identity.projectId,
      "Docs release project differs from the final Art brief.",
      blockers,
    );
    match(
      receipt.volumeId,
      brief.identity.bookId,
      "Docs release volume differs from the final Art brief book.",
      blockers,
    );
    match(
      receipt.manuscriptRevisionId,
      brief.manuscript.manuscriptRevisionId,
      "Docs release manuscript revision differs from the final Art brief.",
      blockers,
    );
    match(
      receipt.manuscriptSha256,
      brief.manuscript.manuscriptSha256,
      "Docs release manuscript SHA-256 differs from the final Art brief.",
      blockers,
    );
    const approvedEvidence = new Set(brief.manuscript.approvedEvidenceIds);
    for (const evidenceId of receipt.requiredEvidenceIds) {
      if (!approvedEvidence.has(evidenceId)) {
        blockers.push(
          `Final Art brief is missing Docs release evidence ${evidenceId}.`,
        );
      }
    }
  }

  const finalBlockers = unique(blockers);
  if (finalBlockers.length || !receipt || !workOrder) {
    return blocked(identity, finalBlockers, unique(warnings), receipt);
  }
  warnings.push(
    "The verified Docs release authorizes only an Art Studio shadow provider job; it does not approve the provider candidate, promotion, Book-use binding, runtime cutover or publication.",
  );
  return {
    outputKind: "evavo_art_studio_docs_book_release_compilation_result",
    schemaVersion: DOCS_BOOK_ART_RELEASE_SCHEMA_VERSION,
    status: "ready",
    identity,
    releaseReceipt: receipt,
    workOrder,
    blockers: [],
    warnings: unique(warnings),
    releaseVerified: true,
    exactFinalArtBriefVerified,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function validateReleaseReceipt(
  receipt: DocsBookWritingArtReleaseReceiptV1,
  blockers: string[],
): void {
  if (
    receipt.outputKind !== "evavo_docs_book_writing_art_release_receipt" ||
    receipt.schemaVersion !== 1 ||
    receipt.contract !== DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT ||
    receipt.linkContract !== DOCS_BOOK_WRITING_ART_LINK_CONTRACT
  ) {
    blockers.push("Docs Book Art release receipt identity or version is invalid.");
  }
  if (receipt.status !== "ready_for_art_shadow") {
    blockers.push("Docs Book Art release must be ready_for_art_shadow.");
  }
  for (const [label, value] of [
    ["linkFingerprint", receipt.linkFingerprint],
    ["canonicalMutationPlanFingerprint", receipt.canonicalMutationPlanFingerprint],
    ["websiteMutationReceiptFingerprint", receipt.websiteMutationReceiptFingerprint],
    ["websiteMutationImportFingerprint", receipt.websiteMutationImportFingerprint],
    ["manuscriptSha256", receipt.manuscriptSha256],
    ["draftArtBriefFingerprint", receipt.draftArtBriefFingerprint],
    ["finalArtBriefFingerprint", receipt.finalArtBriefFingerprint],
    ["releaseFingerprint", receipt.releaseFingerprint],
  ] as const) {
    if (typeof value !== "string" || !SHA256.test(value)) {
      blockers.push(`Docs Book Art release ${label} must be an exact sha256: digest.`);
    }
  }
  for (const [label, value] of [
    ["mutationId", receipt.mutationId],
    ["projectId", receipt.projectId],
    ["programmeId", receipt.programmeId],
    ["volumeId", receipt.volumeId],
    ["manuscriptRevisionId", receipt.manuscriptRevisionId],
  ] as const) {
    if (!SAFE_ID.test(value)) {
      blockers.push(`Docs Book Art release ${label} is invalid.`);
    }
  }
  if (!isTimestamp(receipt.releasedAt)) {
    blockers.push("Docs Book Art release releasedAt must be canonical UTC ISO-8601.");
  }
  if (
    typeof receipt.releasedBy !== "string" ||
    receipt.releasedBy !== receipt.releasedBy.trim() ||
    receipt.releasedBy.length < 1 ||
    receipt.releasedBy.length > 300 ||
    /[\u0000-\u001f\u007f]/.test(receipt.releasedBy)
  ) {
    blockers.push("Docs Book Art release releasedBy is invalid.");
  }
  if (
    !GIT_COMMIT.test(receipt.writingStudioMainCommit) ||
    !WRITING_COMMITS.has(receipt.writingStudioMainCommit)
  ) {
    blockers.push("Docs Book Art release Writing Studio commit is incompatible.");
  }
  if (
    !GIT_COMMIT.test(receipt.artStudioMainCommit) ||
    !ART_RECEIVER_COMMITS.has(receipt.artStudioMainCommit)
  ) {
    blockers.push("Docs Book Art release Art Studio receiver commit is incompatible.");
  }
  if (
    !Array.isArray(receipt.requiredEvidenceIds) ||
    receipt.requiredEvidenceIds.length < 1 ||
    receipt.requiredEvidenceIds.length > 16_384 ||
    receipt.requiredEvidenceIds.some((entry) => !SAFE_ID.test(entry)) ||
    new Set(receipt.requiredEvidenceIds).size !== receipt.requiredEvidenceIds.length ||
    !sameOrder(receipt.requiredEvidenceIds, [...receipt.requiredEvidenceIds].sort())
  ) {
    blockers.push(
      "Docs Book Art release requiredEvidenceIds must be non-empty, unique, safe and canonically sorted.",
    );
  }
  if (
    !Array.isArray(receipt.blockers) ||
    receipt.blockers.length !== 0 ||
    !Array.isArray(receipt.requiredActions) ||
    receipt.requiredActions.length !== 0
  ) {
    blockers.push("A ready Docs Book Art release cannot retain blockers or required actions.");
  }
  if (
    receipt.websiteCanonicalMutationVerified !== true ||
    receipt.exactFinalArtBriefVerified !== true ||
    receipt.writingStudioMayCallArtStudioDirectly !== false ||
    receipt.docsSuiteCanonicalWriterEnabled !== false ||
    receipt.artStudioCandidateMayBeFinal !== false ||
    receipt.selectionRequired !== true ||
    receipt.promotionRequired !== true ||
    receipt.bookUseBindingRequired !== true ||
    receipt.runtimeCutoverApproved !== false ||
    receipt.publicationPerformed !== false
  ) {
    blockers.push("Docs Book Art release authority and finality flags are invalid.");
  }
}

function blocked(
  identity: BookArtIdentityV1,
  blockers: string[],
  warnings: string[],
  releaseReceipt?: DocsBookWritingArtReleaseReceiptV1,
): DocsBookArtReleaseCompilationResultV1 {
  return {
    outputKind: "evavo_art_studio_docs_book_release_compilation_result",
    schemaVersion: DOCS_BOOK_ART_RELEASE_SCHEMA_VERSION,
    status: "blocked",
    identity,
    ...(releaseReceipt === undefined ? {} : { releaseReceipt }),
    blockers: unique(blockers),
    warnings: unique(warnings),
    releaseVerified: false,
    exactFinalArtBriefVerified: false,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function emptyIdentity(): BookArtIdentityV1 {
  return {
    workspaceId: "invalid",
    projectId: "invalid",
    bookId: "invalid",
    requestId: "invalid",
  };
}

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
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

function gitCommit(
  value: unknown,
  label: string,
  blockers: string[],
): string | undefined {
  if (typeof value !== "string" || !GIT_COMMIT.test(value)) {
    blockers.push(`${label} must be an exact 40-character Git commit.`);
    return undefined;
  }
  return value;
}

function timestamp(
  value: unknown,
  label: string,
  blockers: string[],
): string | undefined {
  if (!isTimestamp(value)) {
    blockers.push(`${label} must be canonical UTC ISO-8601.`);
    return undefined;
  }
  return value;
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_TIMESTAMP.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(Date.parse(value)).toISOString() === value
  );
}

function match(
  left: unknown,
  right: unknown,
  message: string,
  blockers: string[],
): void {
  if (left !== right) blockers.push(message);
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as UnknownRecord)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

async function sha256Prefixed(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}
