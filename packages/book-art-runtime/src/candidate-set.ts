import {
  normalizeJson,
  sha256,
  stableStringify,
  type JsonValue,
} from "@evavo/art-artifacts";
import {
  BOOK_ART_CANDIDATE_SET_CONTRACT,
  BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
  BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
  validateBookArtCandidateSetWorkOrder,
  type BookArtCandidateSetWorkOrderV1,
  type BookArtIdentityV1,
  type BookArtPurpose,
} from "@evavo/art-contracts";
import {
  providerRequestSha256,
  providerRequiredCapabilities,
  validateProviderCandidateRequest,
  type NormalizedProviderCandidateRequest,
} from "@evavo/art-providers";
import {
  normalizeRuntimeJobSubmission,
  type RuntimeJobRecord,
  type RuntimeJobSubmission,
  type RuntimeRepository,
} from "@evavo/art-runtime";

export const BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION = 1 as const;
export const BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT =
  "evavo_book_art_candidate_set_provider_runtime_v1" as const;

export interface BookArtCandidateSetAdapterPolicyV1 {
  allowedAdapterIds: string[];
  preferredAdapterId?: string;
  preferredModel?: string;
}

export interface BookArtCandidateSetProviderJobInputV1 {
  outputKind: "evavo_book_art_candidate_set_provider_job_input";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION;
  executionId: string;
  requestedAt: string;
  workOrder: unknown;
  adapterPolicy: BookArtCandidateSetAdapterPolicyV1;
}

export interface BookArtCandidateSetProviderJobPlanV1 {
  outputKind: "evavo_book_art_candidate_set_provider_job_plan";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT;
  productionContract: typeof BOOK_ART_CANDIDATE_SET_CONTRACT;
  executionId: string;
  requestedAt: string;
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  candidateSetId: string;
  candidateCount: number;
  sourceBriefFingerprint: string;
  workOrderFingerprintSha256: string;
  normalizedProviderRequest: NormalizedProviderCandidateRequest;
  normalizedProviderRequestSha256: string;
  runtimeSubmission: RuntimeJobSubmission;
  runtimeJobId: string;
  runtimeSpecHash: string;
  planFingerprintSha256: string;
  oneProviderAttemptForEntireSet: true;
  providerFallbackAllowed: false;
  shadowOnly: true;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookArtCandidateSetProviderJobCompilationResultV1 {
  outputKind: "evavo_book_art_candidate_set_provider_job_compilation_result";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  plan?: BookArtCandidateSetProviderJobPlanV1;
  blockers: string[];
  warnings: string[];
  oneProviderAttemptForEntireSet: true;
  providerFallbackAllowed: false;
  shadowOnly: true;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookArtCandidateSetProviderJobSubmissionResultV1 {
  outputKind: "evavo_book_art_candidate_set_provider_job_submission_result";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION;
  status: "blocked" | "submitted";
  identity: BookArtIdentityV1;
  plan?: BookArtCandidateSetProviderJobPlanV1;
  job?: RuntimeJobRecord;
  blockers: string[];
  warnings: string[];
  oneProviderAttemptForEntireSet: true;
  providerFallbackAllowed: false;
  shadowOnly: true;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export async function compileBookArtCandidateSetProviderJob(
  value: unknown,
): Promise<BookArtCandidateSetProviderJobCompilationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = record(value);
  if (!input) {
    return blockedCompilation(
      emptyIdentity(),
      ["Book Art candidate-set provider input must be one object."],
      warnings,
    );
  }
  rejectUnknown(input, INPUT_FIELDS, "candidate-set provider input", blockers);
  if (
    input.outputKind !== "evavo_book_art_candidate_set_provider_job_input" ||
    input.schemaVersion !== BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION
  ) {
    blockers.push("Candidate-set provider input identity or version is invalid.");
  }
  const executionId = text(input.executionId);
  if (!isSafeId(executionId)) {
    blockers.push("Candidate-set provider executionId is invalid.");
  }
  const requestedAt = text(input.requestedAt);
  if (!isTimestamp(requestedAt)) {
    blockers.push(
      "Candidate-set provider requestedAt must be canonical UTC ISO-8601.",
    );
  }

  const workOrderRecord = record(input.workOrder);
  const identity = parseIdentity(record(workOrderRecord?.identity));
  const workOrder = workOrderRecord as unknown as BookArtCandidateSetWorkOrderV1;
  if (!workOrderRecord) {
    blockers.push("Candidate-set provider workOrder must be one object.");
  } else {
    try {
      blockers.push(...(await validateBookArtCandidateSetWorkOrder(workOrder)));
    } catch (error: unknown) {
      blockers.push(
        message(error, "Candidate-set provider work-order validation failed."),
      );
    }
  }

  const adapterPolicy = record(input.adapterPolicy);
  if (!adapterPolicy) {
    blockers.push("Candidate-set provider adapterPolicy must be one object.");
  } else {
    rejectUnknown(
      adapterPolicy,
      ADAPTER_POLICY_FIELDS,
      "candidate-set provider adapterPolicy",
      blockers,
    );
  }
  const allowedAdapterIds = strictStringArray(
    adapterPolicy?.allowedAdapterIds,
    "candidate-set provider allowedAdapterIds",
    blockers,
  ).sort();
  if (
    allowedAdapterIds.length < 1 ||
    allowedAdapterIds.length > 16 ||
    allowedAdapterIds.some((entry) => !SAFE_PROVIDER_ID.test(entry)) ||
    new Set(allowedAdapterIds).size !== allowedAdapterIds.length
  ) {
    blockers.push(
      "Candidate-set provider requires 1 to 16 unique safe allowedAdapterIds.",
    );
  }
  const preferredAdapterId = optionalText(adapterPolicy?.preferredAdapterId);
  if (
    preferredAdapterId !== undefined &&
    (!SAFE_PROVIDER_ID.test(preferredAdapterId) ||
      !allowedAdapterIds.includes(preferredAdapterId))
  ) {
    blockers.push(
      "Candidate-set preferredAdapterId must be safe and present in allowedAdapterIds.",
    );
  }
  const preferredModel = optionalText(adapterPolicy?.preferredModel);
  if (
    preferredModel !== undefined &&
    (!SAFE_PROVIDER_ID.test(preferredModel) || preferredModel.length > 128)
  ) {
    blockers.push("Candidate-set preferredModel is invalid.");
  }
  if (blockers.length || !workOrderRecord) {
    return blockedCompilation(identity, unique(blockers), warnings);
  }

  let normalizedProviderRequest: NormalizedProviderCandidateRequest;
  try {
    normalizedProviderRequest = validateProviderCandidateRequest({
      ...workOrder.providerRequest,
      selection: {
        allowedAdapterIds,
        ...(preferredAdapterId === undefined ? {} : { preferredAdapterId }),
        ...(preferredModel === undefined ? {} : { preferredModel }),
        allowFallback: false,
        requireSeed: false,
      },
    });
  } catch (error: unknown) {
    return blockedCompilation(
      identity,
      [message(error, "Candidate-set provider request validation failed.")],
      warnings,
    );
  }
  validateProviderBoundary(workOrder, normalizedProviderRequest, blockers);
  if (blockers.length) {
    return blockedCompilation(identity, unique(blockers), warnings);
  }

  const normalizedProviderRequestSha256 = providerRequestSha256(
    normalizedProviderRequest,
  );
  const idempotencyKey = `book-art-set:${sha256(
    stableStringify(
      normalizeJson({
        contract: BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT,
        executionId,
        candidateSetId: workOrder.candidateSetId,
        workOrderFingerprintSha256: workOrder.workOrderFingerprintSha256,
        normalizedProviderRequestSha256,
      }),
    ),
  )}`;
  const runtimeSubmission: RuntimeJobSubmission = {
    queue: "provider",
    kind: "art.candidate.generate",
    idempotencyKey,
    payload: normalizedProviderRequest as unknown as JsonValue,
    requiredCapabilities: [
      "evidence.bundle",
      "provider.candidate-store",
      "provider.generate",
    ],
    requiredCapabilityProfile: providerRequiredCapabilities(
      normalizedProviderRequest,
    ),
    maximumAttempts: 1,
    retryPolicy: {
      baseDelayMs: 0,
      maximumDelayMs: 0,
      multiplier: 1,
      jitterFraction: 0,
    },
    leaseDurationMs: 120_000,
    timeoutMs: 600_000,
    labels: {
      migrationMode: "book-art-candidate-set",
      workspaceId: workOrder.identity.workspaceId,
      projectId: workOrder.identity.projectId,
      bookId: workOrder.identity.bookId,
      requestId: workOrder.identity.requestId,
      purpose: workOrder.purpose,
      candidateSetId: workOrder.candidateSetId,
      candidateCount: String(workOrder.candidateCount),
      workOrderFingerprint: workOrder.workOrderFingerprintSha256,
      sourceBriefFingerprint: workOrder.sourceBriefFingerprint,
      ...(workOrder.identity.editionId === undefined
        ? {}
        : { editionId: workOrder.identity.editionId }),
    },
  };
  const normalizedRuntime = normalizeRuntimeJobSubmission(runtimeSubmission);
  const withoutFingerprint: Omit<
    BookArtCandidateSetProviderJobPlanV1,
    "planFingerprintSha256"
  > = {
    outputKind: "evavo_book_art_candidate_set_provider_job_plan",
    schemaVersion: BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT,
    productionContract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    executionId,
    requestedAt,
    identity: { ...workOrder.identity },
    purpose: workOrder.purpose,
    candidateSetId: workOrder.candidateSetId,
    candidateCount: workOrder.candidateCount,
    sourceBriefFingerprint: workOrder.sourceBriefFingerprint,
    workOrderFingerprintSha256: workOrder.workOrderFingerprintSha256,
    normalizedProviderRequest,
    normalizedProviderRequestSha256,
    runtimeSubmission,
    runtimeJobId: normalizedRuntime.spec.id,
    runtimeSpecHash: normalizedRuntime.specHash,
    oneProviderAttemptForEntireSet: true,
    providerFallbackAllowed: false,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const plan: BookArtCandidateSetProviderJobPlanV1 = {
    ...withoutFingerprint,
    planFingerprintSha256: fingerprint(withoutFingerprint),
  };
  warnings.push(
    `The provider worker must return exactly ${workOrder.candidateCount} unapproved candidate artifacts in one attempt. A partial set, fallback adapter or ambiguous outcome is blocked rather than padded or retried.`,
  );
  warnings.push(
    "Every returned candidate still requires technical QA, independent per-candidate consensus, complete set comparison, Docs Suite creative-quality review and governed selection before promotion.",
  );
  return {
    outputKind: "evavo_book_art_candidate_set_provider_job_compilation_result",
    schemaVersion: BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION,
    status: "ready",
    identity: { ...workOrder.identity },
    plan,
    blockers: [],
    warnings,
    oneProviderAttemptForEntireSet: true,
    providerFallbackAllowed: false,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

export async function submitBookArtCandidateSetProviderJob(
  value: unknown,
  options: Readonly<{
    runtime: RuntimeRepository;
    actor: string;
    now?: Date;
  }>,
): Promise<BookArtCandidateSetProviderJobSubmissionResultV1> {
  const compilation = await compileBookArtCandidateSetProviderJob(value);
  if (compilation.status !== "ready" || !compilation.plan) {
    return blockedSubmission(
      compilation.identity,
      compilation.blockers,
      compilation.warnings,
      compilation.plan,
    );
  }
  const actor = options.actor.trim();
  if (!actor || actor.length > 256 || actor.includes("\0")) {
    return blockedSubmission(
      compilation.identity,
      ["Candidate-set provider actor is invalid."],
      compilation.warnings,
      compilation.plan,
    );
  }
  const job = await options.runtime.submit(
    compilation.plan.runtimeSubmission,
    actor,
    options.now,
  );
  const blockers: string[] = [];
  if (job.id !== compilation.plan.runtimeJobId) {
    blockers.push("Submitted candidate-set job identity differs from the plan.");
  }
  if (job.specHash !== compilation.plan.runtimeSpecHash) {
    blockers.push("Submitted candidate-set job spec hash differs from the plan.");
  }
  if (
    job.spec.maximumAttempts !== 1 ||
    job.spec.kind !== "art.candidate.generate" ||
    job.spec.queue !== "provider"
  ) {
    blockers.push("Submitted candidate-set job lost its one-attempt provider boundary.");
  }
  const payload = record(job.spec.payload);
  if (payload?.candidateCount !== compilation.plan.candidateCount) {
    blockers.push("Submitted candidate-set job lost the exact candidate count.");
  }
  if (blockers.length) {
    return {
      ...blockedSubmission(
        compilation.identity,
        blockers,
        compilation.warnings,
        compilation.plan,
      ),
      job,
    };
  }
  return {
    outputKind: "evavo_book_art_candidate_set_provider_job_submission_result",
    schemaVersion: BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION,
    status: "submitted",
    identity: compilation.identity,
    plan: compilation.plan,
    job,
    blockers: [],
    warnings: compilation.warnings,
    oneProviderAttemptForEntireSet: true,
    providerFallbackAllowed: false,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function validateProviderBoundary(
  workOrder: BookArtCandidateSetWorkOrderV1,
  request: NormalizedProviderCandidateRequest,
  blockers: string[],
): void {
  if (
    request.operation !== "generate" ||
    request.continuityPhase !== "independent" ||
    request.candidateCount !== workOrder.candidateCount ||
    request.candidateCount < BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES ||
    request.candidateCount > BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES
  ) {
    blockers.push(
      `Candidate-set provider jobs require ${BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES} to ${BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES} independent generation candidates.`,
    );
  }
  if (
    request.selection.allowFallback !== false ||
    request.selection.allowedAdapterIds.length < 1
  ) {
    blockers.push(
      "Candidate-set provider jobs require an explicit adapter allow-list and prohibit fallback.",
    );
  }
  if (request.references.length !== 0) {
    blockers.push(
      "The initial Book Art candidate-set boundary does not accept caller-supplied reference artifacts.",
    );
  }
  if (
    request.assetKind !== workOrder.providerRequest.assetKind ||
    request.assetId !== workOrder.providerRequest.assetId ||
    request.candidateFamilyId !== workOrder.providerRequest.candidateFamilyId ||
    request.requestId !== workOrder.providerRequest.requestId
  ) {
    blockers.push("Normalized provider identity differs from the candidate-set work order.");
  }
  const metadata = record(request.metadata);
  if (!metadata) {
    blockers.push("Candidate-set provider metadata must be one object.");
    return;
  }
  for (const [key, expected] of [
    ["workspaceId", workOrder.identity.workspaceId],
    ["projectId", workOrder.identity.projectId],
    ["bookId", workOrder.identity.bookId],
    ["bookRequestId", workOrder.identity.requestId],
    ["purpose", workOrder.purpose],
    ["sourceBriefFingerprint", workOrder.sourceBriefFingerprint],
    ["candidateSetId", workOrder.candidateSetId],
    ["candidateCount", workOrder.candidateCount],
  ] as const) {
    if (metadata[key] !== expected) {
      blockers.push(`Candidate-set provider metadata ${key} differs from the work order.`);
    }
  }
  if (
    metadata.completePairwiseComparisonRequired !== true ||
    metadata.independentSetReviewRequired !== true ||
    metadata.generatedTextProhibited !== true ||
    metadata.automaticSelectionAllowed !== false ||
    metadata.providerCandidateMayBeFinal !== false ||
    metadata.publicationPerformed !== false
  ) {
    blockers.push("Candidate-set provider metadata lost its quality or authority boundary.");
  }
  for (const forbidden of [
    "title",
    "subtitle",
    "author",
    "spine",
    "isbn",
    "barcode",
    "kdp",
    "pricing",
    "publicationPackage",
  ]) {
    if (Object.hasOwn(metadata, forbidden)) {
      blockers.push(`Candidate-set provider metadata contains Docs Suite-owned field ${forbidden}.`);
    }
  }
}

function blockedCompilation(
  identity: BookArtIdentityV1,
  blockers: string[],
  warnings: string[],
): BookArtCandidateSetProviderJobCompilationResultV1 {
  return {
    outputKind: "evavo_book_art_candidate_set_provider_job_compilation_result",
    schemaVersion: BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION,
    status: "blocked",
    identity,
    blockers: unique(blockers),
    warnings: unique(warnings),
    oneProviderAttemptForEntireSet: true,
    providerFallbackAllowed: false,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function blockedSubmission(
  identity: BookArtIdentityV1,
  blockers: string[],
  warnings: string[],
  plan?: BookArtCandidateSetProviderJobPlanV1,
): BookArtCandidateSetProviderJobSubmissionResultV1 {
  return {
    outputKind: "evavo_book_art_candidate_set_provider_job_submission_result",
    schemaVersion: BOOK_ART_CANDIDATE_SET_RUNTIME_SCHEMA_VERSION,
    status: "blocked",
    identity,
    ...(plan === undefined ? {} : { plan }),
    blockers: unique(blockers),
    warnings: unique(warnings),
    oneProviderAttemptForEntireSet: true,
    providerFallbackAllowed: false,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;
const SAFE_PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const INPUT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "executionId",
  "requestedAt",
  "workOrder",
  "adapterPolicy",
]);
const ADAPTER_POLICY_FIELDS = new Set([
  "allowedAdapterIds",
  "preferredAdapterId",
  "preferredModel",
]);

function fingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
  blockers: string[],
): void {
  const unknown = Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort();
  if (unknown.length) {
    blockers.push(`${label} contains unknown fields: ${unknown.join(", ")}.`);
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" &&
    value.trim() === value &&
    value.length > 0
    ? value
    : "";
}

function strictStringArray(
  value: unknown,
  label: string,
  blockers: string[],
): string[] {
  if (!Array.isArray(value)) {
    blockers.push(`${label} must be an array.`);
    return [];
  }
  if (
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        entry.trim() !== entry ||
        entry.length === 0,
    )
  ) {
    blockers.push(`${label} must contain only non-empty, trimmed strings.`);
    return [];
  }
  return [...value] as string[];
}

function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    SAFE_ID.test(value) &&
    !["__proto__", "constructor", "prototype"].includes(value)
  );
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const canonical = parsed.toISOString();
  return value === canonical || value === canonical.replace(".000Z", "Z");
}

function parseIdentity(value: Record<string, unknown> | undefined): BookArtIdentityV1 {
  return {
    workspaceId: text(value?.workspaceId),
    projectId: text(value?.projectId),
    bookId: text(value?.bookId),
    ...(value?.editionId === undefined
      ? {}
      : { editionId: text(value.editionId) }),
    requestId: text(value?.requestId),
  };
}

function emptyIdentity(): BookArtIdentityV1 {
  return { workspaceId: "", projectId: "", bookId: "", requestId: "" };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
