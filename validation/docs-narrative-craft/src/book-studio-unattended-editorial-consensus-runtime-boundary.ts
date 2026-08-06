import {
  BOOK_UNATTENDED_EDITORIAL_CONSENSUS_CONTRACT,
  type BookUnattendedEditorialConsensusEvaluationResultV1,
} from "./book-studio-unattended-editorial-consensus";
import {
  evaluateBookUnattendedEditorialConsensusIntegrity,
} from "./book-studio-unattended-editorial-consensus-integrity";
import {
  evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence as evaluateRuntimeEvidenceUnchecked,
  type BookUnattendedEditorialRuntimeEvidenceInputV1,
} from "./book-studio-unattended-editorial-consensus-runtime-evidence";

const MAX_REVIEWERS = 8;
const MIN_REVIEWERS = 2;
const BASE_INPUT_OUTPUT_KIND =
  "evavo_docs_book_unattended_editorial_consensus_evaluation_input" as const;

type UnknownRecord = Record<string, unknown>;

/**
 * Bounded package-root entrypoint for unattended editorial consensus.
 *
 * The deeper evaluator performs exact runtime-result validation. This public
 * boundary first bounds cardinality, then validates the complete programme and
 * reviewer payload semantics before dereferencing nested assignment or payload
 * fields. Malformed callers therefore fail closed rather than throwing or
 * forcing an unbounded traversal.
 */
export async function evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence(
  value: unknown,
): Promise<BookUnattendedEditorialConsensusEvaluationResultV1> {
  if (!record(value)) {
    return blocked("Editorial runtime-evidence input must be an object.");
  }
  const programme = value.programme;
  if (!record(programme)) {
    return blocked("Editorial runtime evidence requires a programme object.");
  }
  const reviewerAssignments = programme.reviewerAssignments;
  if (!boundedReviewerArray(reviewerAssignments)) {
    return blocked(
      `programme.reviewerAssignments must contain between ${MIN_REVIEWERS} and ${MAX_REVIEWERS} entries.`,
    );
  }
  if (!reviewerAssignments.every(record)) {
    return blocked("Every programme reviewer assignment must be an object.");
  }
  if (!boundedReviewerArray(value.reviewerExecutions)) {
    return blocked(
      `reviewerExecutions must contain between ${MIN_REVIEWERS} and ${MAX_REVIEWERS} entries.`,
    );
  }
  if (!value.reviewerExecutions.every(record)) {
    return blocked("Every reviewer execution must be an object.");
  }
  if (!boundedReviewerArray(value.reviewerRuntimeEvidence)) {
    return blocked(
      `reviewerRuntimeEvidence must contain between ${MIN_REVIEWERS} and ${MAX_REVIEWERS} entries.`,
    );
  }
  if (!value.reviewerRuntimeEvidence.every(record)) {
    return blocked("Every reviewer runtime-evidence entry must be an object.");
  }

  const input = value as unknown as BookUnattendedEditorialRuntimeEvidenceInputV1;
  let semanticResult: BookUnattendedEditorialConsensusEvaluationResultV1;
  try {
    semanticResult = await evaluateBookUnattendedEditorialConsensusIntegrity({
      outputKind: BASE_INPUT_OUTPUT_KIND,
      schemaVersion: 1,
      contract: BOOK_UNATTENDED_EDITORIAL_CONSENSUS_CONTRACT,
      programme: input.programme,
      reviewerExecutions: input.reviewerExecutions,
    });
  } catch {
    return blocked(
      "Editorial programme or reviewer semantics could not be validated safely.",
      [
        "Recompile the exact editorial programme and reviewer payloads before runtime-evidence evaluation.",
      ],
    );
  }
  if (semanticResult.status === "blocked") {
    return blocked(semanticResult.blockers, semanticResult.requiredActions);
  }

  let temporalBlockers: string[];
  try {
    temporalBlockers = validateRuntimeChronology(input);
  } catch {
    return blocked(
      "Editorial runtime chronology could not be validated safely.",
      [
        "Rebuild the bounded runtime-evidence packet from structurally valid reviewer runtime results.",
      ],
    );
  }
  if (temporalBlockers.length) {
    return blocked(temporalBlockers, [
      "Reconcile reviewer completion, immutable storage, handoff and runtime timestamps before evaluation.",
    ]);
  }

  let runtimeResult: BookUnattendedEditorialConsensusEvaluationResultV1;
  try {
    runtimeResult = await evaluateRuntimeEvidenceUnchecked(input);
  } catch {
    return blocked(
      "Editorial runtime evidence could not be validated safely.",
      [
        "Rebuild the bounded runtime-evidence packet from validated immutable execution receipts.",
      ],
    );
  }
  if (
    runtimeResult.status !== "blocked"
    && semanticResult.evaluation?.evaluationFingerprint
      !== runtimeResult.evaluation?.evaluationFingerprint
  ) {
    return blocked(
      "Editorial semantic evaluation changed while runtime evidence was being validated.",
      [
        "Recompile and evaluate one immutable editorial programme and execution set.",
      ],
    );
  }
  return runtimeResult;
}

function validateRuntimeChronology(
  input: BookUnattendedEditorialRuntimeEvidenceInputV1,
): string[] {
  const blockers: string[] = [];
  for (const assignment of input.programme.reviewerAssignments) {
    const execution = input.reviewerExecutions.find(
      (item) => item.assignmentId === assignment.assignmentId,
    );
    const evidence = input.reviewerRuntimeEvidence.find(
      (item) => item.assignmentId === assignment.assignmentId,
    );
    if (!execution || !evidence) continue;

    const runtimeResult = evidence.runtimeResult;
    if (runtimeResult.blockers.length) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} reports unresolved runtime blockers.`,
      );
    }
    if (runtimeResult.handoffResponse.unresolvedRiskIds.length) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} reports unresolved handoff risks.`,
      );
    }

    const requestedAt = Date.parse(assignment.runtimeRequest.requestedAt);
    const payloadCompletedAt = Date.parse(execution.payload.completedAt);
    const storedAt = runtimeResult.storageReceipt
      ? Date.parse(runtimeResult.storageReceipt.storedAt)
      : Number.NaN;
    const handoffCompletedAt = Date.parse(
      runtimeResult.handoffResponse.completedAt,
    );
    const runtimeCompletedAt = Date.parse(runtimeResult.completedAt);

    if (
      Number.isFinite(requestedAt)
      && Number.isFinite(payloadCompletedAt)
      && payloadCompletedAt < requestedAt
    ) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} payload predates its exact runtime request.`,
      );
    }
    if (
      Number.isFinite(payloadCompletedAt)
      && Number.isFinite(storedAt)
      && storedAt < payloadCompletedAt
    ) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} immutable storage predates its reviewer payload.`,
      );
    }
    if (
      Number.isFinite(storedAt)
      && Number.isFinite(handoffCompletedAt)
      && handoffCompletedAt < storedAt
    ) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} handoff completion predates immutable storage.`,
      );
    }
    if (
      Number.isFinite(handoffCompletedAt)
      && Number.isFinite(runtimeCompletedAt)
      && runtimeCompletedAt < handoffCompletedAt
    ) {
      blockers.push(
        `Reviewer execution ${assignment.assignmentId} runtime completion predates its handoff response.`,
      );
    }
  }
  return unique(blockers).sort();
}

function boundedReviewerArray(value: unknown): value is UnknownRecord[] {
  return Array.isArray(value)
    && value.length >= MIN_REVIEWERS
    && value.length <= MAX_REVIEWERS;
}

function record(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function blocked(
  value: string | string[],
  requiredActions = [
    "Supply one bounded exact runtime-evidence entry for every bounded reviewer assignment.",
  ],
): BookUnattendedEditorialConsensusEvaluationResultV1 {
  const blockers = unique(Array.isArray(value) ? value : [value]).sort();
  return {
    outputKind:
      "evavo_docs_book_unattended_editorial_consensus_evaluation_result",
    schemaVersion: 1,
    status: "blocked",
    blockers,
    requiredActions: unique(requiredActions).sort(),
    providerCallsPerformed: 0,
    providerFallbackAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
