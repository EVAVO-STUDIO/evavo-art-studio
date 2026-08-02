import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactStore,
} from "@evavo/art-artifacts";
import type { BookArtIdentityV1 } from "@evavo/art-contracts";
import type { RuntimeFailureClassification } from "@evavo/art-runtime";

import type { BookArtProviderShadowJobCompilationResultV1 } from "./index.js";
import {
  inspectBookArtProviderShadowJob,
  type BookArtProviderShadowJobInspectionResultV1,
  type InspectBookArtProviderShadowJobOptions,
} from "./inspection.js";

export type WebsiteBookArtProviderShadowOutcome =
  | "not-submitted"
  | "pending"
  | "failed"
  | "candidate-produced";

export interface WebsiteBookArtProviderShadowFailureV1 {
  readonly classification: RuntimeFailureClassification;
  readonly code: string;
}

export interface WebsiteBookArtProviderShadowCandidateV1 {
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly storageClass: "intermediate";
  readonly approvalState: "unapproved";
  readonly finalDeliverable: false;
  readonly requiresMastering: true;
  readonly requiresBlockingQa: true;
}

export interface WebsiteBookArtProviderShadowObservationV1 {
  readonly outputKind: "evavo_website_book_art_provider_shadow_observation";
  readonly schemaVersion: 1;
  readonly sourceRepository: "EVAVO-STUDIO/Website";
  readonly sourceCommitSha: string;
  readonly observedAt: string;
  readonly identity: BookArtIdentityV1;
  readonly executionId: string;
  readonly sourceBriefFingerprint: string;
  readonly workOrderFingerprintSha256: string;
  readonly normalizedProviderRequestSha256: string;
  readonly outcome: WebsiteBookArtProviderShadowOutcome;
  readonly requestedCandidateCount: 1;
  readonly attemptCount: number;
  readonly providerFallbackUsed: false;
  readonly providerExecutionObserved: boolean;
  readonly candidateArtifactsWritten: boolean;
  readonly adapterId?: string;
  readonly model?: string;
  readonly failure?: WebsiteBookArtProviderShadowFailureV1;
  readonly candidate?: WebsiteBookArtProviderShadowCandidateV1;
  readonly authoritativeBookWritesPerformed: false;
  readonly providerCandidateMayBeFinal: false;
  readonly selectionPerformed: false;
  readonly promotionPerformed: false;
  readonly bookUseBindingCreated: false;
  readonly runtimeCutoverApproved: false;
  readonly publicationPerformed: false;
  readonly observationFingerprintSha256: string;
}

export interface WebsiteBookArtProviderShadowObservationValidationV1 {
  readonly valid: boolean;
  readonly observation?: WebsiteBookArtProviderShadowObservationV1;
  readonly issues: readonly string[];
}

export type BookArtProviderShadowParityStatus =
  | "blocked"
  | "incomplete"
  | "matched"
  | "mismatched";

export interface BookArtProviderShadowParityComparisonV1 {
  readonly identityMatched: boolean;
  readonly executionIdMatched: boolean;
  readonly sourceBriefFingerprintMatched: boolean;
  readonly workOrderFingerprintMatched: boolean;
  readonly normalizedProviderRequestMatched: boolean;
  readonly outcomeMatched: boolean;
  readonly attemptBoundaryMatched: boolean;
  readonly providerPolicyMatched: boolean | null;
  readonly adapterMatched: boolean | null;
  readonly modelMatched: boolean | null;
  readonly candidateBoundaryMatched: boolean | null;
  readonly failureClassificationMatched: boolean | null;
}

export interface BookArtProviderShadowParityWebsiteSummaryV1 {
  readonly sourceRepository: "EVAVO-STUDIO/Website";
  readonly sourceCommitSha: string;
  readonly observedAt: string;
  readonly outcome: WebsiteBookArtProviderShadowOutcome;
  readonly attemptCount: number;
  readonly adapterId?: string;
  readonly model?: string;
  readonly candidateContentSha256?: string;
  readonly observationFingerprintSha256: string;
}

export interface BookArtProviderShadowParityArtStudioSummaryV1 {
  readonly status: BookArtProviderShadowJobInspectionResultV1["status"];
  readonly inspectionFingerprintSha256: string;
  readonly jobId?: string;
  readonly attemptCount?: number;
  readonly adapterId?: string;
  readonly model?: string;
  readonly candidateContentSha256?: string;
}

export interface BookArtProviderShadowParityResultV1 {
  readonly outputKind: "evavo_book_art_provider_shadow_parity_result";
  readonly schemaVersion: 1;
  readonly status: BookArtProviderShadowParityStatus;
  readonly identity: BookArtIdentityV1;
  readonly website?: BookArtProviderShadowParityWebsiteSummaryV1;
  readonly artStudio?: BookArtProviderShadowParityArtStudioSummaryV1;
  readonly comparison?: BookArtProviderShadowParityComparisonV1;
  readonly blockers: readonly string[];
  readonly mismatches: readonly string[];
  readonly warnings: readonly string[];
  readonly parityFingerprintSha256: string;
  readonly shadowOnly: true;
  readonly parityReadOnly: true;
  readonly parityScope: "request-execution-and-authority";
  readonly providerCallPerformedByParity: false;
  readonly artifactWritesPerformedByParity: false;
  readonly visualSimilarityEvaluated: false;
  readonly candidateBytesExpectedEqual: false;
  readonly structuralParityMatched: boolean;
  readonly observationPeriodSatisfied: false;
  readonly cutoverEligible: false;
  readonly websiteRuntimeStillActive: true;
  readonly websiteSourceDeletionAllowed: false;
  readonly authoritativeBookWritesPerformed: false;
  readonly selectionPerformed: false;
  readonly promotionPerformed: false;
  readonly bookUseBindingCreated: false;
  readonly runtimeCutoverApproved: false;
  readonly publicationPerformed: false;
}

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const SAFE_PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const IMAGE_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
]);
const OUTCOMES = new Set<WebsiteBookArtProviderShadowOutcome>([
  "not-submitted",
  "pending",
  "failed",
  "candidate-produced",
]);
const FAILURE_CLASSIFICATIONS = new Set<RuntimeFailureClassification>([
  "transient",
  "permanent",
  "cancelled",
  "lease-expired",
  "deadline-exceeded",
  "dependency-failed",
  "timeout",
]);
const OBSERVATION_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "sourceRepository",
  "sourceCommitSha",
  "observedAt",
  "identity",
  "executionId",
  "sourceBriefFingerprint",
  "workOrderFingerprintSha256",
  "normalizedProviderRequestSha256",
  "outcome",
  "requestedCandidateCount",
  "attemptCount",
  "providerFallbackUsed",
  "providerExecutionObserved",
  "candidateArtifactsWritten",
  "adapterId",
  "model",
  "failure",
  "candidate",
  "authoritativeBookWritesPerformed",
  "providerCandidateMayBeFinal",
  "selectionPerformed",
  "promotionPerformed",
  "bookUseBindingCreated",
  "runtimeCutoverApproved",
  "publicationPerformed",
  "observationFingerprintSha256",
]);
const IDENTITY_FIELDS = new Set([
  "workspaceId",
  "projectId",
  "bookId",
  "editionId",
  "requestId",
]);
const FAILURE_FIELDS = new Set(["classification", "code"]);
const CANDIDATE_FIELDS = new Set([
  "contentSha256",
  "byteLength",
  "mediaType",
  "storageClass",
  "approvalState",
  "finalDeliverable",
  "requiresMastering",
  "requiresBlockingQa",
]);

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

function fingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${label} contains unknown field ${key}.`);
  }
}

function requiredText(
  value: unknown,
  label: string,
  issues: string[],
  maximumLength = 256,
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    value.includes("\0")
  ) {
    issues.push(`${label} must be a non-empty already-trimmed string.`);
    return "";
  }
  return value;
}

function optionalText(
  value: unknown,
  label: string,
  issues: string[],
  maximumLength = 256,
): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, label, issues, maximumLength) || undefined;
}

function isCanonicalTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function parseIdentity(value: unknown, issues: string[]): BookArtIdentityV1 {
  const input = record(value);
  if (!input) {
    issues.push("Website Book Art provider observation identity must be an object.");
    return emptyIdentity();
  }
  rejectUnknown(input, IDENTITY_FIELDS, "Website Book Art provider observation identity", issues);
  const workspaceId = requiredText(input.workspaceId, "identity.workspaceId", issues, 200);
  const projectId = requiredText(input.projectId, "identity.projectId", issues, 200);
  const bookId = requiredText(input.bookId, "identity.bookId", issues, 200);
  const requestId = requiredText(input.requestId, "identity.requestId", issues, 200);
  const editionId = optionalText(input.editionId, "identity.editionId", issues, 200);
  for (const [label, valueText] of [
    ["identity.workspaceId", workspaceId],
    ["identity.projectId", projectId],
    ["identity.bookId", bookId],
    ["identity.requestId", requestId],
    ["identity.editionId", editionId],
  ] as const) {
    if (valueText !== undefined && valueText.length > 0 && !SAFE_ID.test(valueText)) {
      issues.push(`${label} is invalid.`);
    }
  }
  return {
    workspaceId,
    projectId,
    bookId,
    requestId,
    ...(editionId === undefined ? {} : { editionId }),
  };
}

function parseFailure(
  value: unknown,
  outcome: WebsiteBookArtProviderShadowOutcome,
  issues: string[],
): WebsiteBookArtProviderShadowFailureV1 | undefined {
  if (value === undefined) {
    if (outcome === "failed") {
      issues.push("Failed Website Book Art provider observation requires failure evidence.");
    }
    return undefined;
  }
  const input = record(value);
  if (!input) {
    issues.push("Website Book Art provider failure must be an object.");
    return undefined;
  }
  rejectUnknown(input, FAILURE_FIELDS, "Website Book Art provider failure", issues);
  const classification = requiredText(
    input.classification,
    "failure.classification",
    issues,
    64,
  ) as RuntimeFailureClassification;
  const code = requiredText(input.code, "failure.code", issues, 128);
  if (!FAILURE_CLASSIFICATIONS.has(classification)) {
    issues.push("Website Book Art provider failure classification is invalid.");
  }
  if (!SAFE_PROVIDER_ID.test(code)) {
    issues.push("Website Book Art provider failure code is invalid.");
  }
  if (outcome !== "failed") {
    issues.push("Website Book Art provider failure is allowed only for failed outcome.");
  }
  return { classification, code };
}

function parseCandidate(
  value: unknown,
  outcome: WebsiteBookArtProviderShadowOutcome,
  issues: string[],
): WebsiteBookArtProviderShadowCandidateV1 | undefined {
  if (value === undefined) {
    if (outcome === "candidate-produced") {
      issues.push("Candidate-produced Website observation requires candidate evidence.");
    }
    return undefined;
  }
  const input = record(value);
  if (!input) {
    issues.push("Website Book Art provider candidate must be an object.");
    return undefined;
  }
  rejectUnknown(input, CANDIDATE_FIELDS, "Website Book Art provider candidate", issues);
  const contentSha256 = requiredText(
    input.contentSha256,
    "candidate.contentSha256",
    issues,
    64,
  );
  const mediaType = requiredText(input.mediaType, "candidate.mediaType", issues, 128);
  const byteLength = Number(input.byteLength);
  if (!SHA256.test(contentSha256)) {
    issues.push("Website Book Art provider candidate contentSha256 is invalid.");
  }
  if (!Number.isSafeInteger(byteLength) || byteLength < 1) {
    issues.push("Website Book Art provider candidate byteLength is invalid.");
  }
  if (!IMAGE_MEDIA_TYPES.has(mediaType)) {
    issues.push("Website Book Art provider candidate mediaType is unsupported.");
  }
  if (
    input.storageClass !== "intermediate" ||
    input.approvalState !== "unapproved" ||
    input.finalDeliverable !== false ||
    input.requiresMastering !== true ||
    input.requiresBlockingQa !== true
  ) {
    issues.push(
      "Website Book Art provider candidate must remain an unapproved intermediate requiring mastering and blocking QA.",
    );
  }
  if (outcome !== "candidate-produced") {
    issues.push("Website Book Art provider candidate is allowed only for candidate-produced outcome.");
  }
  return {
    contentSha256,
    byteLength,
    mediaType,
    storageClass: "intermediate",
    approvalState: "unapproved",
    finalDeliverable: false,
    requiresMastering: true,
    requiresBlockingQa: true,
  };
}

function emptyIdentity(): BookArtIdentityV1 {
  return { workspaceId: "", projectId: "", bookId: "", requestId: "" };
}

function identitiesEqual(left: BookArtIdentityV1, right: BookArtIdentityV1): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    left.bookId === right.bookId &&
    left.requestId === right.requestId &&
    left.editionId === right.editionId
  );
}

export function fingerprintWebsiteBookArtProviderShadowObservation(
  value: Omit<
    WebsiteBookArtProviderShadowObservationV1,
    "observationFingerprintSha256"
  >,
): string {
  return fingerprint(value);
}

export function validateWebsiteBookArtProviderShadowObservation(
  value: unknown,
): WebsiteBookArtProviderShadowObservationValidationV1 {
  const issues: string[] = [];
  const input = record(value);
  if (!input) {
    return {
      valid: false,
      issues: ["Website Book Art provider observation must be one object."],
    };
  }
  rejectUnknown(input, OBSERVATION_FIELDS, "Website Book Art provider observation", issues);
  if (
    input.outputKind !== "evavo_website_book_art_provider_shadow_observation" ||
    input.schemaVersion !== 1 ||
    input.sourceRepository !== "EVAVO-STUDIO/Website"
  ) {
    issues.push("Website Book Art provider observation kind, version or source repository is invalid.");
  }
  const sourceCommitSha = requiredText(
    input.sourceCommitSha,
    "sourceCommitSha",
    issues,
    40,
  );
  const observedAt = requiredText(input.observedAt, "observedAt", issues, 32);
  const identity = parseIdentity(input.identity, issues);
  const executionId = requiredText(input.executionId, "executionId", issues, 200);
  const sourceBriefFingerprint = requiredText(
    input.sourceBriefFingerprint,
    "sourceBriefFingerprint",
    issues,
    64,
  );
  const workOrderFingerprintSha256 = requiredText(
    input.workOrderFingerprintSha256,
    "workOrderFingerprintSha256",
    issues,
    64,
  );
  const normalizedProviderRequestSha256 = requiredText(
    input.normalizedProviderRequestSha256,
    "normalizedProviderRequestSha256",
    issues,
    64,
  );
  const outcomeText = requiredText(input.outcome, "outcome", issues, 32);
  const outcome = OUTCOMES.has(outcomeText as WebsiteBookArtProviderShadowOutcome)
    ? (outcomeText as WebsiteBookArtProviderShadowOutcome)
    : "not-submitted";
  if (!OUTCOMES.has(outcomeText as WebsiteBookArtProviderShadowOutcome)) {
    issues.push("Website Book Art provider observation outcome is invalid.");
  }
  if (!GIT_SHA.test(sourceCommitSha)) {
    issues.push("Website Book Art provider observation sourceCommitSha is invalid.");
  }
  if (!isCanonicalTimestamp(observedAt)) {
    issues.push("Website Book Art provider observation observedAt must be canonical UTC ISO-8601.");
  }
  if (!SAFE_ID.test(executionId)) {
    issues.push("Website Book Art provider observation executionId is invalid.");
  }
  for (const [label, digest] of [
    ["sourceBriefFingerprint", sourceBriefFingerprint],
    ["workOrderFingerprintSha256", workOrderFingerprintSha256],
    ["normalizedProviderRequestSha256", normalizedProviderRequestSha256],
  ] as const) {
    if (!SHA256.test(digest)) issues.push(`${label} is invalid.`);
  }

  const attemptCount = Number(input.attemptCount);
  if (!Number.isInteger(attemptCount) || attemptCount < 0 || attemptCount > 1) {
    issues.push("Website Book Art provider observation attemptCount must be zero or one.");
  }
  if (input.requestedCandidateCount !== 1 || input.providerFallbackUsed !== false) {
    issues.push("Website Book Art provider observation must retain one candidate and no provider fallback.");
  }
  if (typeof input.providerExecutionObserved !== "boolean") {
    issues.push("Website Book Art provider observation providerExecutionObserved must be boolean.");
  }
  if (typeof input.candidateArtifactsWritten !== "boolean") {
    issues.push("Website Book Art provider observation candidateArtifactsWritten must be boolean.");
  }
  const providerExecutionObserved = input.providerExecutionObserved === true;
  const candidateArtifactsWritten = input.candidateArtifactsWritten === true;
  if (outcome === "not-submitted" && (attemptCount !== 0 || providerExecutionObserved)) {
    issues.push("Not-submitted Website observation cannot contain provider execution.");
  }
  if (outcome === "failed" && (!providerExecutionObserved || attemptCount !== 1)) {
    issues.push("Failed Website observation must record exactly one provider attempt.");
  }
  if (
    outcome === "candidate-produced" &&
    (!providerExecutionObserved || !candidateArtifactsWritten || attemptCount !== 1)
  ) {
    issues.push("Candidate-produced Website observation must record one attempt and written candidate evidence.");
  }
  if (outcome !== "candidate-produced" && candidateArtifactsWritten) {
    issues.push("Only candidate-produced Website observation may report candidate artifacts.");
  }

  const adapterId = optionalText(input.adapterId, "adapterId", issues, 128);
  const model = optionalText(input.model, "model", issues, 128);
  if (adapterId !== undefined && !SAFE_PROVIDER_ID.test(adapterId)) {
    issues.push("Website Book Art provider observation adapterId is invalid.");
  }
  if (model !== undefined && !SAFE_PROVIDER_ID.test(model)) {
    issues.push("Website Book Art provider observation model is invalid.");
  }
  if (outcome === "candidate-produced" && (adapterId === undefined || model === undefined)) {
    issues.push("Candidate-produced Website observation requires adapterId and model.");
  }

  const failure = parseFailure(input.failure, outcome, issues);
  const candidate = parseCandidate(input.candidate, outcome, issues);
  for (const [label, expected] of [
    ["authoritativeBookWritesPerformed", false],
    ["providerCandidateMayBeFinal", false],
    ["selectionPerformed", false],
    ["promotionPerformed", false],
    ["bookUseBindingCreated", false],
    ["runtimeCutoverApproved", false],
    ["publicationPerformed", false],
  ] as const) {
    if (input[label] !== expected) {
      issues.push(`Website Book Art provider observation ${label} must remain false.`);
    }
  }

  const withoutFingerprint = {
    outputKind: "evavo_website_book_art_provider_shadow_observation" as const,
    schemaVersion: 1 as const,
    sourceRepository: "EVAVO-STUDIO/Website" as const,
    sourceCommitSha,
    observedAt,
    identity,
    executionId,
    sourceBriefFingerprint,
    workOrderFingerprintSha256,
    normalizedProviderRequestSha256,
    outcome,
    requestedCandidateCount: 1 as const,
    attemptCount,
    providerFallbackUsed: false as const,
    providerExecutionObserved,
    candidateArtifactsWritten,
    ...(adapterId === undefined ? {} : { adapterId }),
    ...(model === undefined ? {} : { model }),
    ...(failure === undefined ? {} : { failure }),
    ...(candidate === undefined ? {} : { candidate }),
    authoritativeBookWritesPerformed: false as const,
    providerCandidateMayBeFinal: false as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    runtimeCutoverApproved: false as const,
    publicationPerformed: false as const,
  };
  const observationFingerprintSha256 = requiredText(
    input.observationFingerprintSha256,
    "observationFingerprintSha256",
    issues,
    64,
  );
  if (
    !SHA256.test(observationFingerprintSha256) ||
    observationFingerprintSha256 !== fingerprint(withoutFingerprint)
  ) {
    issues.push("Website Book Art provider observation fingerprint does not match exact contents.");
  }
  const uniqueIssues = unique(issues);
  if (uniqueIssues.length) return { valid: false, issues: uniqueIssues };
  return {
    valid: true,
    observation: {
      ...withoutFingerprint,
      observationFingerprintSha256,
    },
    issues: [],
  };
}

function expectedInspectionStatus(
  outcome: WebsiteBookArtProviderShadowOutcome,
): BookArtProviderShadowJobInspectionResultV1["status"] {
  if (outcome === "candidate-produced") return "succeeded";
  return outcome;
}

async function artStudioProviderSelection(
  inspection: BookArtProviderShadowJobInspectionResultV1,
  artifacts: ArtifactStore,
  blockers: string[],
): Promise<Readonly<{ adapterId?: string; model?: string }>> {
  const evidenceId = inspection.providerEvidence?.artifactId;
  if (!evidenceId) return {};
  try {
    const parsed = JSON.parse(
      (await artifacts.read(evidenceId)).toString("utf8"),
    ) as unknown;
    const body = record(parsed);
    const selection = record(body?.selection);
    const adapter = record(selection?.adapter);
    const adapterId = typeof adapter?.id === "string" ? adapter.id : undefined;
    const model = typeof selection?.model === "string" ? selection.model : undefined;
    if (!adapterId || !model) {
      blockers.push("Art Studio provider evidence lacks a comparable adapter or model.");
      return {};
    }
    return { adapterId, model };
  } catch (error: unknown) {
    blockers.push(
      `Art Studio provider evidence could not be read for parity: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {};
  }
}

function websiteSummary(
  observation: WebsiteBookArtProviderShadowObservationV1,
): BookArtProviderShadowParityWebsiteSummaryV1 {
  return {
    sourceRepository: observation.sourceRepository,
    sourceCommitSha: observation.sourceCommitSha,
    observedAt: observation.observedAt,
    outcome: observation.outcome,
    attemptCount: observation.attemptCount,
    ...(observation.adapterId === undefined
      ? {}
      : { adapterId: observation.adapterId }),
    ...(observation.model === undefined ? {} : { model: observation.model }),
    ...(observation.candidate === undefined
      ? {}
      : { candidateContentSha256: observation.candidate.contentSha256 }),
    observationFingerprintSha256: observation.observationFingerprintSha256,
  };
}

function artStudioSummary(
  inspection: BookArtProviderShadowJobInspectionResultV1,
  selection: Readonly<{ adapterId?: string; model?: string }>,
): BookArtProviderShadowParityArtStudioSummaryV1 {
  return {
    status: inspection.status,
    inspectionFingerprintSha256: inspection.inspectionFingerprintSha256,
    ...(inspection.runtimeJob === undefined
      ? {}
      : {
          jobId: inspection.runtimeJob.jobId,
          attemptCount: inspection.runtimeJob.attemptCount,
        }),
    ...(selection.adapterId === undefined ? {} : { adapterId: selection.adapterId }),
    ...(selection.model === undefined ? {} : { model: selection.model }),
    ...(inspection.candidate === undefined
      ? {}
      : { candidateContentSha256: inspection.candidate.contentSha256 }),
  };
}

function finishParity(
  input: Readonly<{
    status: BookArtProviderShadowParityStatus;
    identity: BookArtIdentityV1;
    website?: BookArtProviderShadowParityWebsiteSummaryV1;
    artStudio?: BookArtProviderShadowParityArtStudioSummaryV1;
    comparison?: BookArtProviderShadowParityComparisonV1;
    blockers: readonly string[];
    mismatches: readonly string[];
    warnings: readonly string[];
  }>,
): BookArtProviderShadowParityResultV1 {
  const blockers = unique(input.blockers);
  const mismatches = unique(input.mismatches);
  const warnings = unique(input.warnings);
  const withoutFingerprint = {
    outputKind: "evavo_book_art_provider_shadow_parity_result" as const,
    schemaVersion: 1 as const,
    status: input.status,
    identity: input.identity,
    ...(input.website === undefined ? {} : { website: input.website }),
    ...(input.artStudio === undefined ? {} : { artStudio: input.artStudio }),
    ...(input.comparison === undefined ? {} : { comparison: input.comparison }),
    blockers,
    mismatches,
    warnings,
    shadowOnly: true as const,
    parityReadOnly: true as const,
    parityScope: "request-execution-and-authority" as const,
    providerCallPerformedByParity: false as const,
    artifactWritesPerformedByParity: false as const,
    visualSimilarityEvaluated: false as const,
    candidateBytesExpectedEqual: false as const,
    structuralParityMatched: input.status === "matched",
    observationPeriodSatisfied: false as const,
    cutoverEligible: false as const,
    websiteRuntimeStillActive: true as const,
    websiteSourceDeletionAllowed: false as const,
    authoritativeBookWritesPerformed: false as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    runtimeCutoverApproved: false as const,
    publicationPerformed: false as const,
  };
  return {
    ...withoutFingerprint,
    parityFingerprintSha256: fingerprint(withoutFingerprint),
  };
}

function recordMismatch(
  matched: boolean | null,
  message: string,
  mismatches: string[],
): void {
  if (matched === false) mismatches.push(message);
}

export async function compareBookArtProviderShadowParity(
  compilation: BookArtProviderShadowJobCompilationResultV1,
  websiteObservationValue: unknown,
  options: InspectBookArtProviderShadowJobOptions,
): Promise<BookArtProviderShadowParityResultV1> {
  const validation = validateWebsiteBookArtProviderShadowObservation(
    websiteObservationValue,
  );
  if (!validation.valid || !validation.observation) {
    return finishParity({
      status: "blocked",
      identity: compilation.identity,
      blockers: validation.issues,
      mismatches: [],
      warnings: [
        "Website provider evidence must be independently fingerprinted before shadow parity can be evaluated.",
      ],
    });
  }
  const observation = validation.observation;
  const inspection = await inspectBookArtProviderShadowJob(compilation, options);
  if (inspection.status === "blocked") {
    return finishParity({
      status: "blocked",
      identity: observation.identity,
      website: websiteSummary(observation),
      artStudio: artStudioSummary(inspection, {}),
      blockers: inspection.blockers,
      mismatches: [],
      warnings: [
        ...inspection.warnings,
        "Art Studio immutable inspection must pass before Website parity can be evaluated.",
      ],
    });
  }
  if (compilation.status !== "ready" || !compilation.plan) {
    return finishParity({
      status: "blocked",
      identity: observation.identity,
      website: websiteSummary(observation),
      artStudio: artStudioSummary(inspection, {}),
      blockers: ["Book Art provider parity requires a ready compiled Art Studio plan."],
      mismatches: [],
      warnings: inspection.warnings,
    });
  }

  const plan = compilation.plan;
  const blockers: string[] = [];
  const mismatches: string[] = [];
  const selection =
    inspection.status === "succeeded"
      ? await artStudioProviderSelection(inspection, options.artifacts, blockers)
      : {};
  const identityMatched = identitiesEqual(observation.identity, plan.identity);
  const executionIdMatched = observation.executionId === plan.executionId;
  const sourceBriefFingerprintMatched =
    observation.sourceBriefFingerprint === plan.sourceBriefFingerprint;
  const workOrderFingerprintMatched =
    observation.workOrderFingerprintSha256 === plan.workOrderFingerprintSha256;
  const normalizedProviderRequestMatched =
    observation.normalizedProviderRequestSha256 ===
    plan.normalizedProviderRequestSha256;
  const outcomeMatched =
    inspection.status === expectedInspectionStatus(observation.outcome);
  const artStudioAttemptCount = inspection.runtimeJob?.attemptCount ?? 0;
  const attemptBoundaryMatched =
    observation.attemptCount === artStudioAttemptCount &&
    observation.attemptCount <= 1 &&
    artStudioAttemptCount <= 1;
  const providerPolicyMatched =
    observation.adapterId === undefined
      ? null
      : plan.normalizedProviderRequest.selection.allowedAdapterIds.includes(
          observation.adapterId,
        );
  const adapterMatched =
    observation.outcome === "candidate-produced" &&
    inspection.status === "succeeded"
      ? observation.adapterId !== undefined &&
        selection.adapterId !== undefined &&
        observation.adapterId === selection.adapterId
      : null;
  const modelMatched =
    observation.outcome === "candidate-produced" &&
    inspection.status === "succeeded"
      ? observation.model !== undefined &&
        selection.model !== undefined &&
        observation.model === selection.model
      : null;
  const candidateBoundaryMatched =
    observation.outcome === "candidate-produced" &&
    inspection.status === "succeeded"
      ? observation.candidate !== undefined &&
        inspection.candidate?.storageClass === "intermediate" &&
        inspection.candidate.approvalState === "unapproved"
      : null;
  const failureClassificationMatched =
    observation.outcome === "failed" && inspection.status === "failed"
      ? observation.failure !== undefined &&
        inspection.runtimeJob?.failure !== undefined &&
        observation.failure.classification ===
          inspection.runtimeJob.failure.classification
      : null;
  const comparison: BookArtProviderShadowParityComparisonV1 = {
    identityMatched,
    executionIdMatched,
    sourceBriefFingerprintMatched,
    workOrderFingerprintMatched,
    normalizedProviderRequestMatched,
    outcomeMatched,
    attemptBoundaryMatched,
    providerPolicyMatched,
    adapterMatched,
    modelMatched,
    candidateBoundaryMatched,
    failureClassificationMatched,
  };

  recordMismatch(identityMatched, "Website and Art Studio Book identities differ.", mismatches);
  recordMismatch(executionIdMatched, "Website and Art Studio parity execution IDs differ.", mismatches);
  recordMismatch(
    sourceBriefFingerprintMatched,
    "Website and Art Studio source brief fingerprints differ.",
    mismatches,
  );
  recordMismatch(
    workOrderFingerprintMatched,
    "Website and Art Studio work-order fingerprints differ.",
    mismatches,
  );
  recordMismatch(
    normalizedProviderRequestMatched,
    "Website and Art Studio normalized provider-request fingerprints differ.",
    mismatches,
  );
  recordMismatch(
    outcomeMatched,
    "Website and Art Studio provider execution outcomes differ.",
    mismatches,
  );
  recordMismatch(
    attemptBoundaryMatched,
    "Website and Art Studio provider attempt counts differ or exceed one.",
    mismatches,
  );
  recordMismatch(
    providerPolicyMatched,
    "Website provider adapter falls outside the Art Studio host allow-list.",
    mismatches,
  );
  recordMismatch(
    adapterMatched,
    "Website and Art Studio selected different provider adapters.",
    mismatches,
  );
  recordMismatch(
    modelMatched,
    "Website and Art Studio selected different provider models.",
    mismatches,
  );
  recordMismatch(
    candidateBoundaryMatched,
    "Website and Art Studio candidate authority boundaries differ.",
    mismatches,
  );
  recordMismatch(
    failureClassificationMatched,
    "Website and Art Studio provider failure classifications differ.",
    mismatches,
  );
  if (blockers.length) {
    return finishParity({
      status: "blocked",
      identity: observation.identity,
      website: websiteSummary(observation),
      artStudio: artStudioSummary(inspection, selection),
      comparison,
      blockers,
      mismatches,
      warnings: inspection.warnings,
    });
  }

  const incomplete =
    observation.outcome === "not-submitted" ||
    observation.outcome === "pending" ||
    inspection.status === "not-submitted" ||
    inspection.status === "pending";
  const status: BookArtProviderShadowParityStatus = incomplete
    ? "incomplete"
    : mismatches.length
      ? "mismatched"
      : "matched";
  return finishParity({
    status,
    identity: observation.identity,
    website: websiteSummary(observation),
    artStudio: artStudioSummary(inspection, selection),
    comparison,
    blockers: [],
    mismatches,
    warnings: [
      ...inspection.warnings,
      "Structural shadow parity does not compare candidate pixels or prove visual similarity.",
      "A matched receipt does not satisfy the observation period, approve runtime cutover or allow Website source deletion.",
    ],
  });
}
