import {
  evaluateBookUnattendedEditorialConsensusIntegrity,
} from "./book-studio-unattended-editorial-consensus-integrity";
import type {
  BookUnattendedEditorialConsensusEvaluationResultV1,
  BookUnattendedEditorialConsensusProgrammeV1,
  BookUnattendedEditorialReviewerExecutionV1,
} from "./book-studio-unattended-editorial-consensus";
import {
  canonicalBookJson,
  sha256BookText,
} from "./book-studio-project-contracts";
import {
  validateBookWritingCandidateRuntimeResult,
} from "./book-studio-writing-candidate-contracts";
import type {
  BookWritingCandidateRuntimeResultV1,
} from "./book-studio-writing-candidate-types";

export const BOOK_UNATTENDED_EDITORIAL_RUNTIME_EVIDENCE_CONTRACT =
  "evavo_docs_book_unattended_editorial_runtime_evidence_v1" as const;

const INPUT_OUTPUT_KIND =
  "evavo_docs_book_unattended_editorial_runtime_evidence_input" as const;
const EVIDENCE_OUTPUT_KIND =
  "evavo_docs_book_unattended_editorial_reviewer_runtime_evidence" as const;
const BASE_INPUT_OUTPUT_KIND =
  "evavo_docs_book_unattended_editorial_consensus_evaluation_input" as const;
const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,299}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;

type UnknownRecord = Record<string, unknown>;

export interface BookUnattendedEditorialReviewerRuntimeEvidenceV1 {
  outputKind: typeof EVIDENCE_OUTPUT_KIND;
  schemaVersion: 1;
  contract: typeof BOOK_UNATTENDED_EDITORIAL_RUNTIME_EVIDENCE_CONTRACT;
  assignmentId: string;
  runtimeResult: BookWritingCandidateRuntimeResultV1;
  evidenceFingerprint: string;
}

export interface BookUnattendedEditorialRuntimeEvidenceInputV1 {
  outputKind: typeof INPUT_OUTPUT_KIND;
  schemaVersion: 1;
  contract: typeof BOOK_UNATTENDED_EDITORIAL_RUNTIME_EVIDENCE_CONTRACT;
  programme: BookUnattendedEditorialConsensusProgrammeV1;
  reviewerExecutions: BookUnattendedEditorialReviewerExecutionV1[];
  reviewerRuntimeEvidence: BookUnattendedEditorialReviewerRuntimeEvidenceV1[];
}

const INPUT_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "programme",
  "reviewerExecutions",
  "reviewerRuntimeEvidence",
]);
const EVIDENCE_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "assignmentId",
  "runtimeResult",
  "evidenceFingerprint",
]);

/**
 * Public editorial-consensus evaluation boundary.
 *
 * The legacy evaluator validates reviewer payload semantics but accepts a
 * caller-supplied runtime-result fingerprint. This wrapper requires the full
 * Writing Candidate runtime result, revalidates it against the exact reviewer
 * assignment, and binds the canonical reviewer payload bytes to immutable
 * candidate storage before any governed-admission readiness can be returned.
 */
export async function evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence(
  value: unknown,
): Promise<BookUnattendedEditorialConsensusEvaluationResultV1> {
  const blockers: string[] = [];
  const source = strictRecord(
    value,
    INPUT_KEYS,
    "Editorial runtime-evidence input",
    blockers,
  );
  literal(
    source.outputKind,
    INPUT_OUTPUT_KIND,
    "Editorial runtime-evidence input outputKind is invalid.",
    blockers,
  );
  literal(
    source.schemaVersion,
    1,
    "Editorial runtime-evidence input schemaVersion must be 1.",
    blockers,
  );
  literal(
    source.contract,
    BOOK_UNATTENDED_EDITORIAL_RUNTIME_EVIDENCE_CONTRACT,
    "Editorial runtime-evidence input contract is invalid.",
    blockers,
  );

  const programme = record(source.programme)
    ? source.programme as BookUnattendedEditorialConsensusProgrammeV1
    : undefined;
  if (!programme) {
    blockers.push("Editorial runtime evidence requires a programme object.");
    return blocked(blockers);
  }

  const executionValues = boundedArray(
    source.reviewerExecutions,
    "reviewerExecutions",
    blockers,
  );
  const evidenceValues = boundedArray(
    source.reviewerRuntimeEvidence,
    "reviewerRuntimeEvidence",
    blockers,
  );
  const reviewerExecutions = executionValues
    .filter(record)
    .map((item) => item as unknown as BookUnattendedEditorialReviewerExecutionV1);
  if (reviewerExecutions.length !== executionValues.length) {
    blockers.push("Every reviewer execution must be an object.");
  }

  const reviewerRuntimeEvidence: BookUnattendedEditorialReviewerRuntimeEvidenceV1[] = [];
  for (let index = 0; index < evidenceValues.length; index += 1) {
    const parsed = await parseRuntimeEvidence(
      evidenceValues[index],
      index,
      blockers,
    );
    if (parsed) reviewerRuntimeEvidence.push(parsed);
  }

  const assignmentIds = programme.reviewerAssignments
    .map((item) => item.assignmentId)
    .sort();
  const executionIds = reviewerExecutions
    .map((item) => item.assignmentId)
    .sort();
  const evidenceIds = reviewerRuntimeEvidence
    .map((item) => item.assignmentId)
    .sort();

  requireExactCoverage(
    assignmentIds,
    executionIds,
    "reviewerExecutions",
    blockers,
  );
  requireExactCoverage(
    assignmentIds,
    evidenceIds,
    "reviewerRuntimeEvidence",
    blockers,
  );
  rejectDuplicates(executionIds, "Reviewer execution assignment IDs", blockers);
  rejectDuplicates(evidenceIds, "Reviewer runtime-evidence assignment IDs", blockers);
  rejectDuplicates(
    reviewerExecutions.map((item) => item.executionFingerprint),
    "Reviewer execution fingerprints",
    blockers,
  );
  rejectDuplicates(
    reviewerExecutions.map((item) => item.runtimeResultFingerprint),
    "Reviewer runtime-result fingerprints",
    blockers,
  );
  rejectDuplicates(
    reviewerExecutions.map((item) => item.providerRequestId),
    "Reviewer provider request IDs",
    blockers,
  );
  rejectDuplicates(
    reviewerExecutions.map((item) => item.payload?.payloadFingerprint),
    "Reviewer payload fingerprints",
    blockers,
  );
  rejectDuplicates(
    reviewerRuntimeEvidence.map((item) => item.evidenceFingerprint),
    "Reviewer runtime-evidence fingerprints",
    blockers,
  );

  const normalizedResults: BookWritingCandidateRuntimeResultV1[] = [];
  for (const assignment of programme.reviewerAssignments) {
    const execution = reviewerExecutions.find(
      (item) => item.assignmentId === assignment.assignmentId,
    );
    const evidence = reviewerRuntimeEvidence.find(
      (item) => item.assignmentId === assignment.assignmentId,
    );
    if (!execution || !evidence) continue;

    const coordination = await validateBookWritingCandidateRuntimeResult(
      assignment.authoringPacket,
      assignment.candidateCompileInput,
      evidence.runtimeResult,
    );
    if (
      coordination.status !== "ready_for_authoring_result_validation"
      || !coordination.runtimeResult
    ) {
      blockers.push(
        ...coordination.blockers.map(
          (item) =>
            `Reviewer execution ${assignment.assignmentId} runtime result: ${item}`,
        ),
      );
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} does not contain a complete validated Writing Candidate runtime result.`,
      );
      continue;
    }
    const runtimeResult = coordination.runtimeResult;
    normalizedResults.push(runtimeResult);

    if (
      runtimeResult.runtimeRequestFingerprint
        !== assignment.runtimeRequest.runtimeRequestFingerprint
      || runtimeResult.runtimeRequestFingerprint
        !== execution.runtimeRequestFingerprint
    ) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} runtime request identity differs from the exact assignment.`,
      );
    }
    if (runtimeResult.resultFingerprint !== execution.runtimeResultFingerprint) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} runtime-result fingerprint differs from the validated runtime result.`,
      );
    }
    if (
      runtimeResult.providerRequestId !== execution.providerRequestId
      || runtimeResult.providerAttemptCount !== execution.providerAttemptCount
      || runtimeResult.providerCalled !== execution.providerCalled
      || execution.providerAttemptCount !== 1
      || execution.providerCalled !== true
      || execution.providerFallbackAllowed !== false
    ) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} provider evidence differs from the validated one-attempt runtime result.`,
      );
    }
    if (
      runtimeResult.status !== "completed"
      || runtimeResult.providerStopReason !== "completed"
      || runtimeResult.candidateEvidenceStored !== true
      || !runtimeResult.storageReceipt
    ) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} requires one complete immutable runtime result.`,
      );
      continue;
    }

    const payloadText = canonicalBookJson(execution.payload);
    const payloadSha256 = await sha256BookText(payloadText);
    const payloadByteLength = utf8ByteLength(payloadText);
    const storageReceipt = runtimeResult.storageReceipt;
    if (
      storageReceipt.candidateSha256 !== payloadSha256
      || storageReceipt.candidateByteLength !== payloadByteLength
      || runtimeResult.handoffResponse.candidateSha256 !== payloadSha256
      || runtimeResult.handoffResponse.candidateByteLength !== payloadByteLength
    ) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} payload does not match the exact immutable runtime candidate bytes.`,
      );
    }
    if (
      Date.parse(storageReceipt.storedAt) < Date.parse(execution.payload.completedAt)
      || Date.parse(runtimeResult.completedAt) < Date.parse(storageReceipt.storedAt)
    ) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} storage or completion time precedes its reviewer payload.`,
      );
    }

    const requiredQualityReceiptIds = unique([
      execution.payload.payloadFingerprint,
      ...execution.payload.receipts.map((item) => item.reviewFingerprint),
    ]);
    const missingQualityReceiptIds = requiredQualityReceiptIds.filter(
      (item) => !runtimeResult.handoffResponse.qualityReceiptIds.includes(item),
    );
    if (missingQualityReceiptIds.length) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} runtime handoff is missing payload or review receipt identities: ${missingQualityReceiptIds.join(", ")}.`,
      );
    }
  }

  rejectDuplicates(
    normalizedResults.map((item) => item.resultFingerprint),
    "Validated runtime-result fingerprints",
    blockers,
  );
  rejectDuplicates(
    normalizedResults.map((item) => item.storageReceipt?.storageReceiptFingerprint),
    "Validated runtime storage-receipt fingerprints",
    blockers,
  );
  rejectDuplicates(
    normalizedResults.map((item) => item.storageReceipt?.objectId),
    "Validated runtime candidate object IDs",
    blockers,
  );

  const uniqueBlockers = unique(blockers).sort();
  if (uniqueBlockers.length) return blocked(uniqueBlockers);

  const result = await evaluateBookUnattendedEditorialConsensusIntegrity({
    outputKind: BASE_INPUT_OUTPUT_KIND,
    schemaVersion: 1,
    contract: programme.contract,
    programme,
    reviewerExecutions,
  });
  if (
    result.status !== "blocked"
    && result.providerCallsPerformed !== reviewerRuntimeEvidence.length
  ) {
    return blocked([
      "Editorial consensus provider-call accounting differs from the exact validated runtime-evidence set.",
    ]);
  }
  return result;
}

export async function fingerprintBookUnattendedEditorialReviewerRuntimeEvidence(
  value:
    | Omit<BookUnattendedEditorialReviewerRuntimeEvidenceV1, "evidenceFingerprint">
    | BookUnattendedEditorialReviewerRuntimeEvidenceV1,
): Promise<string> {
  const { evidenceFingerprint: _discarded, ...unsigned } =
    value as BookUnattendedEditorialReviewerRuntimeEvidenceV1;
  return sha256BookText(canonicalBookJson(unsigned));
}

export function listBookUnattendedEditorialRuntimeEvidenceCapabilities() {
  return Object.freeze({
    outputKind:
      "evavo_docs_book_unattended_editorial_runtime_evidence_capabilities",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_EDITORIAL_RUNTIME_EVIDENCE_CONTRACT,
    exactAssignmentMultiplicityRequired: true,
    fullWritingRuntimeResultRequired: true,
    runtimeResultRevalidationRequired: true,
    payloadBoundToImmutableCandidateBytes: true,
    payloadAndReviewReceiptIdsRequiredInRuntimeHandoff: true,
    duplicateProviderRequestIdsAllowed: false,
    duplicateRuntimeResultsAllowed: false,
    providerFallbackAllowed: false,
    providerAuthenticationClaimed: false,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  });
}

async function parseRuntimeEvidence(
  value: unknown,
  index: number,
  blockers: string[],
): Promise<BookUnattendedEditorialReviewerRuntimeEvidenceV1 | undefined> {
  const source = strictRecord(
    value,
    EVIDENCE_KEYS,
    `Reviewer runtime evidence ${index + 1}`,
    blockers,
  );
  literal(
    source.outputKind,
    EVIDENCE_OUTPUT_KIND,
    `Reviewer runtime evidence ${index + 1} outputKind is invalid.`,
    blockers,
  );
  literal(
    source.schemaVersion,
    1,
    `Reviewer runtime evidence ${index + 1} schemaVersion must be 1.`,
    blockers,
  );
  literal(
    source.contract,
    BOOK_UNATTENDED_EDITORIAL_RUNTIME_EVIDENCE_CONTRACT,
    `Reviewer runtime evidence ${index + 1} contract is invalid.`,
    blockers,
  );
  const assignmentId = identifier(
    source.assignmentId,
    `reviewerRuntimeEvidence[${index}].assignmentId`,
    blockers,
  );
  const runtimeResult = record(source.runtimeResult)
    ? source.runtimeResult as BookWritingCandidateRuntimeResultV1
    : undefined;
  if (!runtimeResult) {
    blockers.push(
      `Reviewer runtime evidence ${index + 1} requires a runtimeResult object.`,
    );
  }
  const evidenceFingerprint = digest(
    source.evidenceFingerprint,
    `reviewerRuntimeEvidence[${index}].evidenceFingerprint`,
    blockers,
  );
  if (!assignmentId || !runtimeResult || !evidenceFingerprint) return undefined;
  const unsigned = {
    outputKind: EVIDENCE_OUTPUT_KIND,
    schemaVersion: 1 as const,
    contract: BOOK_UNATTENDED_EDITORIAL_RUNTIME_EVIDENCE_CONTRACT,
    assignmentId,
    runtimeResult,
  };
  if (
    evidenceFingerprint
      !== await fingerprintBookUnattendedEditorialReviewerRuntimeEvidence(unsigned)
  ) {
    blockers.push(
      `Reviewer runtime evidence ${assignmentId} fingerprint differs from its exact contents.`,
    );
  }
  return { ...unsigned, evidenceFingerprint };
}

function blocked(
  blockers: string[],
): BookUnattendedEditorialConsensusEvaluationResultV1 {
  return {
    outputKind:
      "evavo_docs_book_unattended_editorial_consensus_evaluation_result",
    schemaVersion: 1,
    status: "blocked",
    blockers: unique(blockers).sort(),
    requiredActions: [
      "Reconcile the exact reviewer assignment, provider runtime result, immutable stored payload and review receipts before evaluating editorial consensus.",
    ],
    providerCallsPerformed: 0,
    providerFallbackAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

function strictRecord(
  value: unknown,
  allowedKeys: Set<string>,
  label: string,
  blockers: string[],
): UnknownRecord {
  if (!record(value)) {
    blockers.push(`${label} must be an object.`);
    return {};
  }
  const source = value as UnknownRecord;
  const unknownKeys = Object.keys(source).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    blockers.push(`${label} contains unknown fields: ${unknownKeys.sort().join(", ")}.`);
  }
  return source;
}

function record(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedArray(
  value: unknown,
  label: string,
  blockers: string[],
): unknown[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) {
    blockers.push(`${label} must contain between 2 and 8 entries.`);
    return [];
  }
  return value;
}

function literal(
  value: unknown,
  expected: unknown,
  message: string,
  blockers: string[],
): void {
  if (value !== expected) blockers.push(message);
}

function identifier(
  value: unknown,
  label: string,
  blockers: string[],
): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    blockers.push(`${label} is invalid.`);
    return "";
  }
  return value;
}

function digest(
  value: unknown,
  label: string,
  blockers: string[],
): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    blockers.push(`${label} is invalid.`);
    return "";
  }
  return value;
}

function requireExactCoverage(
  expected: string[],
  observed: string[],
  label: string,
  blockers: string[],
): void {
  if (
    expected.length !== observed.length
    || canonicalBookJson(expected) !== canonicalBookJson(observed)
  ) {
    blockers.push(`${label} must cover every reviewer assignment exactly once.`);
  }
}

function rejectDuplicates(
  values: Array<string | undefined>,
  label: string,
  blockers: string[],
): void {
  const present = values.filter((item): item is string => Boolean(item));
  if (present.length !== values.length || new Set(present).size !== present.length) {
    blockers.push(`${label} must be present and unique.`);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function utf8ByteLength(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) length += 1;
    else if (codePoint <= 0x7ff) length += 2;
    else if (codePoint <= 0xffff) length += 3;
    else length += 4;
  }
  return length;
}
