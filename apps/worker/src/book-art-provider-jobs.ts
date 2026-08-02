import {
  normalizeJson,
  sha256,
  stableStringify,
  type JsonValue,
} from "@evavo/art-artifacts";
import {
  validateBookArtProductionWorkOrder,
  type BookArtIdentityV1,
  type BookArtProductionWorkOrderV1,
  type BookArtPurpose,
} from "@evavo/art-contracts";
import {
  providerRequestSha256,
  validateProviderCandidateRequest,
  type NormalizedProviderCandidateRequest,
} from "@evavo/art-providers";
import {
  normalizeRuntimeJobSubmission,
  type RuntimeJobRecord,
  type RuntimeJobSubmission,
  type RuntimeRepository,
} from "@evavo/art-runtime";

export const BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION = 1 as const;
export const BOOK_ART_PROVIDER_RUNTIME_CONTRACT =
  "evavo_book_art_provider_shadow_runtime_v1" as const;

export interface BookArtProviderAdapterPolicyV1 {
  allowedAdapterIds: string[];
  preferredAdapterId?: string;
  preferredModel?: string;
}

export interface BookArtProviderShadowJobInputV1 {
  outputKind: "evavo_book_art_provider_shadow_job_input";
  schemaVersion: typeof BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION;
  executionId: string;
  requestedAt: string;
  workOrder: unknown;
  adapterPolicy: BookArtProviderAdapterPolicyV1;
}

export interface BookArtProviderShadowJobPlanV1 {
  outputKind: "evavo_book_art_provider_shadow_job_plan";
  schemaVersion: typeof BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION;
  contract: typeof BOOK_ART_PROVIDER_RUNTIME_CONTRACT;
  executionId: string;
  requestedAt: string;
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  sourceBriefFingerprint: string;
  workOrderFingerprintSha256: string;
  normalizedProviderRequest: NormalizedProviderCandidateRequest;
  normalizedProviderRequestSha256: string;
  runtimeSubmission: RuntimeJobSubmission;
  runtimeJobId: string;
  runtimeSpecHash: string;
  planFingerprintSha256: string;
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

export interface BookArtProviderShadowJobCompilationResultV1 {
  outputKind: "evavo_book_art_provider_shadow_job_compilation_result";
  schemaVersion: typeof BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  plan?: BookArtProviderShadowJobPlanV1;
  blockers: string[];
  warnings: string[];
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

export interface BookArtProviderShadowJobSubmissionResultV1 {
  outputKind: "evavo_book_art_provider_shadow_job_submission_result";
  schemaVersion: typeof BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION;
  status: "blocked" | "submitted";
  identity: BookArtIdentityV1;
  plan?: BookArtProviderShadowJobPlanV1;
  job?: RuntimeJobRecord;
  blockers: string[];
  warnings: string[];
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

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const SAFE_PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
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

export async function compileBookArtProviderShadowJob(
  value: unknown,
): Promise<BookArtProviderShadowJobCompilationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = record(value);
  if (!input) {
    return blockedCompilation(
      emptyIdentity(),
      ["Book Art provider shadow-job input must be one object."],
      warnings,
    );
  }
  rejectUnknown(input, INPUT_FIELDS, "Book Art provider shadow-job input", blockers);
  if (
    input.outputKind !== "evavo_book_art_provider_shadow_job_input" ||
    input.schemaVersion !== BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION
  ) {
    blockers.push("Book Art provider shadow-job kind or version is invalid.");
  }
  const executionId = text(input.executionId);
  if (!isSafeId(executionId)) {
    blockers.push("Book Art provider shadow-job executionId is invalid.");
  }
  const requestedAt = text(input.requestedAt);
  if (!isTimestamp(requestedAt)) {
    blockers.push("Book Art provider shadow-job requestedAt must be canonical UTC ISO-8601.");
  }

  const workOrderRecord = record(input.workOrder);
  const identity = parseIdentity(record(workOrderRecord?.identity));
  if (!workOrderRecord) {
    blockers.push("Book Art provider shadow-job workOrder must be an object.");
  }
  const workOrder = workOrderRecord as unknown as BookArtProductionWorkOrderV1;
  if (workOrderRecord) {
    try {
      const validation = await validateBookArtProductionWorkOrder(workOrder);
      blockers.push(...validation.issues);
    } catch (error: unknown) {
      blockers.push(message(error, "Book Art provider work-order validation failed."));
    }
    if (workOrder.authoritativeWritesPerformed !== false) {
      blockers.push("Book Art provider work order cannot perform authoritative writes.");
    }
    if (
      workOrder.providerCandidateMayBeFinal !== false ||
      workOrder.selectionRequired !== true ||
      workOrder.promotionRequired !== true ||
      workOrder.bookUseBindingRequired !== true
    ) {
      blockers.push(
        "Book Art provider work order must retain candidate, selection, promotion and book-use gates.",
      );
    }
    if (
      workOrder.artifactBytesRewritten !== false ||
      workOrder.runtimeCutoverApproved !== false ||
      workOrder.publicationPerformed !== false
    ) {
      blockers.push(
        "Book Art provider work order cannot claim byte rewrite, runtime cutover or publication.",
      );
    }
  }

  const adapterPolicy = record(input.adapterPolicy);
  if (!adapterPolicy) {
    blockers.push("Book Art provider shadow-job adapterPolicy must be an object.");
  } else {
    rejectUnknown(
      adapterPolicy,
      ADAPTER_POLICY_FIELDS,
      "Book Art provider shadow-job adapterPolicy",
      blockers,
    );
  }
  const allowedAdapterIds = strictStringArray(
    adapterPolicy?.allowedAdapterIds,
    "Book Art provider shadow-job allowedAdapterIds",
    blockers,
  ).sort();
  if (
    allowedAdapterIds.length < 1 ||
    allowedAdapterIds.length > 16 ||
    allowedAdapterIds.some((entry) => !SAFE_PROVIDER_ID.test(entry)) ||
    new Set(allowedAdapterIds).size !== allowedAdapterIds.length
  ) {
    blockers.push(
      "Book Art provider shadow-job requires 1 to 16 unique safe allowedAdapterIds.",
    );
  }
  const preferredAdapterId = optionalText(adapterPolicy?.preferredAdapterId);
  if (
    preferredAdapterId !== undefined &&
    (!SAFE_PROVIDER_ID.test(preferredAdapterId) ||
      !allowedAdapterIds.includes(preferredAdapterId))
  ) {
    blockers.push(
      "Book Art provider preferredAdapterId must be safe and present in allowedAdapterIds.",
    );
  }
  const preferredModel = optionalText(adapterPolicy?.preferredModel);
  if (
    preferredModel !== undefined &&
    (!SAFE_PROVIDER_ID.test(preferredModel) || preferredModel.length > 128)
  ) {
    blockers.push("Book Art provider preferredModel is invalid.");
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
      [message(error, "Book Art provider request validation failed.")],
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
  const idempotencyKey = `book-art:${sha256(
    stableStringify(
      normalizeJson({
        contract: BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
        executionId,
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
      migrationMode: "book-art-shadow-candidate",
      workspaceId: workOrder.identity.workspaceId,
      projectId: workOrder.identity.projectId,
      bookId: workOrder.identity.bookId,
      requestId: workOrder.identity.requestId,
      purpose: workOrder.purpose,
      workOrderFingerprint: workOrder.workOrderFingerprintSha256,
      sourceBriefFingerprint: workOrder.sourceBriefFingerprint,
      ...(workOrder.identity.editionId === undefined
        ? {}
        : { editionId: workOrder.identity.editionId }),
    },
  };
  const normalizedRuntime = normalizeRuntimeJobSubmission(runtimeSubmission);
  const withoutFingerprint: Omit<
    BookArtProviderShadowJobPlanV1,
    "planFingerprintSha256"
  > = {
    outputKind: "evavo_book_art_provider_shadow_job_plan",
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    contract: BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
    executionId,
    requestedAt,
    identity: cloneIdentity(workOrder.identity),
    purpose: workOrder.purpose,
    sourceBriefFingerprint: workOrder.sourceBriefFingerprint,
    workOrderFingerprintSha256: workOrder.workOrderFingerprintSha256,
    normalizedProviderRequest,
    normalizedProviderRequestSha256,
    runtimeSubmission,
    runtimeJobId: normalizedRuntime.spec.id,
    runtimeSpecHash: normalizedRuntime.specHash,
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
  const plan: BookArtProviderShadowJobPlanV1 = {
    ...withoutFingerprint,
    planFingerprintSha256: fingerprint(withoutFingerprint),
  };
  warnings.push(
    "Submitting this plan creates only a durable provider job. No provider call occurs until an eligible Art Studio worker leases the job.",
  );
  warnings.push(
    "A successful worker run stores unapproved intermediate candidates and evidence only; selection, promotion and Book Studio use binding remain separate.",
  );
  return {
    outputKind: "evavo_book_art_provider_shadow_job_compilation_result",
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    status: "ready",
    identity,
    plan,
    blockers: [],
    warnings: unique(warnings),
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

export async function submitBookArtProviderShadowJob(
  value: unknown,
  options: Readonly<{
    runtime: RuntimeRepository;
    actor: string;
    now?: Date;
  }>,
): Promise<BookArtProviderShadowJobSubmissionResultV1> {
  const compilation = await compileBookArtProviderShadowJob(value);
  if (compilation.status !== "ready" || !compilation.plan) {
    return {
      outputKind: "evavo_book_art_provider_shadow_job_submission_result",
      schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
      status: "blocked",
      identity: compilation.identity,
      blockers: compilation.blockers,
      warnings: compilation.warnings,
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
  const actor = options.actor.trim();
  if (!actor || actor.length > 256 || actor.includes("\0")) {
    return {
      outputKind: "evavo_book_art_provider_shadow_job_submission_result",
      schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
      status: "blocked",
      identity: compilation.identity,
      plan: compilation.plan,
      blockers: ["Book Art provider shadow-job actor is invalid."],
      warnings: compilation.warnings,
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
  const job = await options.runtime.submit(
    compilation.plan.runtimeSubmission,
    actor,
    options.now,
  );
  const blockers: string[] = [];
  if (job.id !== compilation.plan.runtimeJobId) {
    blockers.push("Submitted Book Art provider job identity differs from the compiled plan.");
  }
  if (job.specHash !== compilation.plan.runtimeSpecHash) {
    blockers.push("Submitted Book Art provider job spec hash differs from the compiled plan.");
  }
  if (
    job.spec.maximumAttempts !== 1 ||
    job.spec.kind !== "art.candidate.generate" ||
    job.spec.queue !== "provider"
  ) {
    blockers.push("Submitted Book Art provider job lost its no-retry provider boundary.");
  }
  if (blockers.length) {
    return {
      outputKind: "evavo_book_art_provider_shadow_job_submission_result",
      schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
      status: "blocked",
      identity: compilation.identity,
      plan: compilation.plan,
      job,
      blockers,
      warnings: compilation.warnings,
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
  return {
    outputKind: "evavo_book_art_provider_shadow_job_submission_result",
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    status: "submitted",
    identity: compilation.identity,
    plan: compilation.plan,
    job,
    blockers: [],
    warnings: compilation.warnings,
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

function validateProviderBoundary(
  workOrder: BookArtProductionWorkOrderV1,
  request: NormalizedProviderCandidateRequest,
  blockers: string[],
): void {
  if (
    request.operation !== "generate" ||
    request.continuityPhase !== "independent" ||
    request.candidateCount !== 1
  ) {
    blockers.push(
      "Book Art provider shadow jobs require one independent generation candidate.",
    );
  }
  if (
    request.selection.allowFallback !== false ||
    request.selection.allowedAdapterIds.length < 1
  ) {
    blockers.push(
      "Book Art provider shadow jobs require an explicit adapter allow-list and prohibit fallback.",
    );
  }
  if (request.references.length !== 0) {
    blockers.push(
      "The initial Book Art provider shadow boundary does not accept caller-supplied reference artifacts.",
    );
  }
  if (
    request.assetKind !== workOrder.providerRequest.assetKind ||
    request.assetId !== workOrder.providerRequest.assetId ||
    request.candidateFamilyId !== workOrder.providerRequest.candidateFamilyId
  ) {
    blockers.push("Normalized provider identity differs from the Book Art work order.");
  }
  const metadata = record(request.metadata);
  if (!metadata) {
    blockers.push("Book Art provider request metadata must be an object.");
    return;
  }
  for (const [key, expected] of [
    ["workspaceId", workOrder.identity.workspaceId],
    ["projectId", workOrder.identity.projectId],
    ["bookId", workOrder.identity.bookId],
    ["bookRequestId", workOrder.identity.requestId],
    ["purpose", workOrder.purpose],
    ["sourceBriefFingerprint", workOrder.sourceBriefFingerprint],
    ["artDirectionSha256", workOrder.sourceEvidence.artDirectionSha256],
    ["visualCanonSha256", workOrder.sourceEvidence.visualCanonSha256],
  ] as const) {
    if (metadata[key] !== expected) {
      blockers.push(`Book Art provider request metadata ${key} differs from the work order.`);
    }
  }
  if (
    metadata.providerCandidateMayBeFinal !== false ||
    metadata.publicationPerformed !== false
  ) {
    blockers.push("Book Art provider metadata cannot claim finality or publication.");
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
      blockers.push(`Book Art provider metadata contains Docs Suite-owned field ${forbidden}.`);
    }
  }
}

function blockedCompilation(
  identity: BookArtIdentityV1,
  blockers: string[],
  warnings: string[],
): BookArtProviderShadowJobCompilationResultV1 {
  return {
    outputKind: "evavo_book_art_provider_shadow_job_compilation_result",
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    status: "blocked",
    identity,
    blockers: unique(blockers),
    warnings: unique(warnings),
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

function fingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}
function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
  blockers: string[],
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) blockers.push(`${label} contains unknown fields: ${unknown.join(", ")}.`);
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
  return typeof value === "string" && value.trim() === value && value.length > 0
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
    blockers.push(`${label} must contain only non-empty, already-trimmed strings.`);
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
function cloneIdentity(value: BookArtIdentityV1): BookArtIdentityV1 {
  return { ...value };
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
