import {
  normalizeJson,
  sha256,
  stableStringify,
} from "@evavo/art-artifacts";
import {
  BOOK_CREATIVE_DIRECTION_CONTRACT,
  validateBookArtProductionWorkOrder,
  type BookArtIdentityV1,
} from "@evavo/art-contracts";
import {
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "@evavo/art-providers";
import {
  normalizeRuntimeJobSubmission,
  type RuntimeJobRecord,
  type RuntimeJobSubmission,
  type RuntimeRepository,
} from "@evavo/art-runtime";

import {
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
  type BookArtCreativeCandidateProgrammeV1,
  type BookArtCreativeCandidateRoutePlanV1,
} from "./creative-candidate-programme.js";
import {
  BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
  BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
  type BookArtProviderShadowJobPlanV1,
} from "./index.js";

export const BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION = 1 as const;
export const BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT =
  "evavo_book_art_creative_candidate_programme_dispatch_v1" as const;

export interface BookArtCreativeProgrammeDispatchInputV1 {
  outputKind: "evavo_book_art_creative_candidate_programme_dispatch_input";
  schemaVersion: typeof BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT;
  programme: unknown;
  expectedProgrammeFingerprintSha256: string;
  partialProgrammeSubmissionAllowed: false;
  providerFallbackAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationAllowed: false;
}

export interface BookArtCreativeProgrammeRouteDispatchV1 {
  sequence: number;
  routeId: string;
  routeKind: BookArtCreativeCandidateRoutePlanV1["routeKind"];
  composition: BookArtCreativeCandidateRoutePlanV1["composition"];
  workOrderFingerprintSha256: string;
  providerPlanFingerprintSha256: string;
  normalizedProviderRequestSha256: string;
  runtimeJobId: string;
  runtimeSpecHash: string;
  exactlyOneCandidateForRoute: true;
  maximumProviderAttempts: 1;
  providerFallbackAllowed: false;
}

export interface BookArtCreativeProgrammeDispatchPlanV1 {
  outputKind: "evavo_book_art_creative_candidate_programme_dispatch_plan";
  schemaVersion: typeof BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT;
  programmeContract: typeof BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT;
  providerRuntimeContract: typeof BOOK_ART_PROVIDER_RUNTIME_CONTRACT;
  identity: BookArtIdentityV1;
  programmeFingerprintSha256: string;
  creativeDirectionPlanFingerprint: string;
  routeCount: number;
  routeDispatches: BookArtCreativeProgrammeRouteDispatchV1[];
  runtimeSubmissions: RuntimeJobSubmission[];
  singleRuntimeBatchRequired: true;
  routeCoverageComplete: true;
  partialProgrammeSubmissionAllowed: false;
  providerFallbackAllowed: false;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
  dispatchPlanFingerprintSha256: string;
}

export interface BookArtCreativeProgrammeDispatchCompilationResultV1 {
  outputKind: "evavo_book_art_creative_candidate_programme_dispatch_compilation_result";
  schemaVersion: typeof BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  plan?: BookArtCreativeProgrammeDispatchPlanV1;
  blockers: string[];
  warnings: string[];
  runtimeBatchSubmitted: false;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
}

export interface BookArtCreativeProgrammeSubmittedRouteV1 {
  sequence: number;
  routeId: string;
  runtimeJobId: string;
  runtimeSpecHash: string;
  normalizedProviderRequestSha256: string;
}

export interface BookArtCreativeProgrammeDispatchReceiptV1 {
  outputKind: "evavo_book_art_creative_candidate_programme_dispatch_receipt";
  schemaVersion: typeof BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT;
  programmeContract: typeof BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT;
  providerRuntimeContract: typeof BOOK_ART_PROVIDER_RUNTIME_CONTRACT;
  identity: BookArtIdentityV1;
  programmeFingerprintSha256: string;
  dispatchPlanFingerprintSha256: string;
  routeCount: number;
  routes: BookArtCreativeProgrammeSubmittedRouteV1[];
  verifiedAt: string;
  singleRuntimeBatchVerified: true;
  completeRouteSetVerified: true;
  exactRuntimeSpecsVerified: true;
  partialProgrammeAuthorityAllowed: false;
  providerFallbackAllowed: false;
  providerCallsPerformedByDispatcher: false;
  candidateArtifactsWrittenByDispatcher: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
  receiptFingerprintSha256: string;
}

export interface BookArtCreativeProgrammeDispatchSubmissionResultV1 {
  outputKind: "evavo_book_art_creative_candidate_programme_dispatch_submission_result";
  schemaVersion: typeof BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT;
  status: "blocked" | "submitted";
  identity: BookArtIdentityV1;
  plan?: BookArtCreativeProgrammeDispatchPlanV1;
  receipt?: BookArtCreativeProgrammeDispatchReceiptV1;
  blockers: string[];
  warnings: string[];
  runtimeBatchSubmitted: boolean;
  providerCallsPerformedByDispatcher: false;
  candidateArtifactsWrittenByDispatcher: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;
const DISPATCH_INPUT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "programme",
  "expectedProgrammeFingerprintSha256",
  "partialProgrammeSubmissionAllowed",
  "providerFallbackAllowed",
  "automaticSelectionAllowed",
  "automaticPromotionAllowed",
  "publicationAllowed",
]);
const PROGRAMME_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "creativeDirectionContract",
  "identity",
  "purpose",
  "creativeDirectionPlanFingerprint",
  "creativeEvidenceFingerprint",
  "routeCount",
  "routePlans",
  "routeCoverageComplete",
  "materiallyDistinctRoutesRequired",
  "exactlyOneCandidatePerCreativeRoute",
  "oneProviderAttemptPerRoute",
  "providerFallbackAllowed",
  "bulkSubmissionAllowed",
  "partialProgrammeExecutionAllowed",
  "runtimeJobsSubmitted",
  "providerCallPerformed",
  "candidateArtifactsWritten",
  "selectionPerformed",
  "promotionPerformed",
  "bookUseBindingCreated",
  "publicationPerformed",
  "programmeFingerprintSha256",
]);
const ROUTE_FIELDS = new Set([
  "sequence",
  "routeId",
  "routeKind",
  "composition",
  "label",
  "evidenceIds",
  "sourceLocationIds",
  "briefFingerprint",
  "workOrderFingerprintSha256",
  "workOrder",
  "providerJobPlan",
  "exactlyOneCandidateForRoute",
  "providerFallbackAllowed",
  "runtimeJobSubmitted",
  "providerCallPerformed",
  "candidateArtifactsWritten",
]);
const PROVIDER_PLAN_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "executionId",
  "requestedAt",
  "identity",
  "purpose",
  "sourceBriefFingerprint",
  "workOrderFingerprintSha256",
  "normalizedProviderRequest",
  "normalizedProviderRequestSha256",
  "runtimeSubmission",
  "runtimeJobId",
  "runtimeSpecHash",
  "planFingerprintSha256",
  "shadowOnly",
  "providerCallPerformed",
  "candidateArtifactsWritten",
  "authoritativeBookWritesPerformed",
  "selectionPerformed",
  "promotionPerformed",
  "bookUseBindingCreated",
  "runtimeCutoverApproved",
  "publicationPerformed",
]);

export async function compileBookArtCreativeProgrammeDispatch(
  value: unknown,
): Promise<BookArtCreativeProgrammeDispatchCompilationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = record(value);
  if (!input) {
    return blockedCompilation(
      emptyIdentity(),
      ["Creative programme dispatch input must be one object."],
      warnings,
    );
  }

  rejectUnknown(
    input,
    DISPATCH_INPUT_FIELDS,
    "Creative programme dispatch input",
    blockers,
  );
  if (
    input.outputKind !== "evavo_book_art_creative_candidate_programme_dispatch_input"
    || input.schemaVersion !== BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION
    || input.contract !== BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT
  ) {
    blockers.push("Creative programme dispatch input identity or version is invalid.");
  }
  for (const field of [
    "partialProgrammeSubmissionAllowed",
    "providerFallbackAllowed",
    "automaticSelectionAllowed",
    "automaticPromotionAllowed",
    "publicationAllowed",
  ] as const) {
    if (input[field] !== false) blockers.push(`${field} must remain false.`);
  }

  const programmeRecord = record(input.programme);
  const identity = identityFrom(record(programmeRecord?.identity));
  if (!programmeRecord) {
    blockers.push("Creative programme dispatch requires one programme object.");
    return blockedCompilation(identity, unique(blockers), warnings);
  }

  const expectedProgrammeFingerprintSha256 = text(
    input.expectedProgrammeFingerprintSha256,
  );
  if (!expectedProgrammeFingerprintSha256) {
    blockers.push("Creative programme dispatch requires an expected programme fingerprint.");
  }

  blockers.push(
    ...await validateProgramme(
      programmeRecord,
      expectedProgrammeFingerprintSha256,
    ),
  );
  if (blockers.length) {
    return blockedCompilation(identity, unique(blockers), warnings);
  }

  const programme = programmeRecord as unknown as BookArtCreativeCandidateProgrammeV1;
  const routeDispatches: BookArtCreativeProgrammeRouteDispatchV1[] =
    programme.routePlans.map((route) => ({
      sequence: route.sequence,
      routeId: route.routeId,
      routeKind: route.routeKind,
      composition: route.composition,
      workOrderFingerprintSha256: route.workOrderFingerprintSha256,
      providerPlanFingerprintSha256: route.providerJobPlan.planFingerprintSha256,
      normalizedProviderRequestSha256:
        route.providerJobPlan.normalizedProviderRequestSha256,
      runtimeJobId: route.providerJobPlan.runtimeJobId,
      runtimeSpecHash: route.providerJobPlan.runtimeSpecHash,
      exactlyOneCandidateForRoute: true,
      maximumProviderAttempts: 1,
      providerFallbackAllowed: false,
    }));
  const runtimeSubmissions = programme.routePlans.map(
    (route) => structuredClone(route.providerJobPlan.runtimeSubmission),
  );
  const withoutFingerprint: Omit<
    BookArtCreativeProgrammeDispatchPlanV1,
    "dispatchPlanFingerprintSha256"
  > = {
    outputKind: "evavo_book_art_creative_candidate_programme_dispatch_plan",
    schemaVersion: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
    contract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
    programmeContract: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
    providerRuntimeContract: BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
    identity: { ...programme.identity },
    programmeFingerprintSha256: programme.programmeFingerprintSha256,
    creativeDirectionPlanFingerprint: programme.creativeDirectionPlanFingerprint,
    routeCount: programme.routeCount,
    routeDispatches,
    runtimeSubmissions,
    singleRuntimeBatchRequired: true,
    routeCoverageComplete: true,
    partialProgrammeSubmissionAllowed: false,
    providerFallbackAllowed: false,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
  const plan: BookArtCreativeProgrammeDispatchPlanV1 = {
    ...withoutFingerprint,
    dispatchPlanFingerprintSha256: fingerprint(withoutFingerprint),
  };
  warnings.push(
    "This dispatch plan must be submitted with RuntimeRepository.submitBatch as one complete route set; individual route submission is not valid programme-dispatch evidence.",
  );
  warnings.push(
    "Queue submission itself does not call an image provider. Provider calls can occur only after eligible workers lease the submitted jobs, and each route remains capped at one attempt with fallback disabled.",
  );
  return {
    outputKind:
      "evavo_book_art_creative_candidate_programme_dispatch_compilation_result",
    schemaVersion: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
    contract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
    status: "ready",
    identity: { ...programme.identity },
    plan,
    blockers: [],
    warnings: unique(warnings),
    runtimeBatchSubmitted: false,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
}

export async function submitBookArtCreativeProgrammeDispatch(
  value: unknown,
  options: Readonly<{
    runtime: RuntimeRepository;
    actor: string;
    now?: Date;
  }>,
): Promise<BookArtCreativeProgrammeDispatchSubmissionResultV1> {
  const compilation = await compileBookArtCreativeProgrammeDispatch(value);
  if (compilation.status !== "ready" || !compilation.plan) {
    return blockedSubmission(
      compilation.identity,
      compilation.blockers,
      compilation.warnings,
      false,
    );
  }
  const plan = compilation.plan;
  const actor = options.actor.trim();
  if (!actor || actor.length > 256 || actor.includes("\0")) {
    return blockedSubmission(
      plan.identity,
      ["Creative programme dispatch actor is invalid."],
      compilation.warnings,
      false,
      plan,
    );
  }
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    return blockedSubmission(
      plan.identity,
      ["Creative programme dispatch time is invalid."],
      compilation.warnings,
      false,
      plan,
    );
  }

  let jobs: readonly RuntimeJobRecord[];
  try {
    jobs = await options.runtime.submitBatch(
      plan.runtimeSubmissions,
      actor,
      now,
    );
  } catch (error: unknown) {
    return blockedSubmission(
      plan.identity,
      [`Creative programme runtime batch submission failed: ${message(error)}.`],
      compilation.warnings,
      false,
      plan,
    );
  }

  const blockers = validateSubmittedJobs(plan, jobs);
  if (blockers.length) {
    return blockedSubmission(
      plan.identity,
      blockers,
      compilation.warnings,
      true,
      plan,
    );
  }

  const unsigned: Omit<
    BookArtCreativeProgrammeDispatchReceiptV1,
    "receiptFingerprintSha256"
  > = {
    outputKind: "evavo_book_art_creative_candidate_programme_dispatch_receipt",
    schemaVersion: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
    contract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
    programmeContract: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
    providerRuntimeContract: BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
    identity: { ...plan.identity },
    programmeFingerprintSha256: plan.programmeFingerprintSha256,
    dispatchPlanFingerprintSha256: plan.dispatchPlanFingerprintSha256,
    routeCount: plan.routeCount,
    routes: plan.routeDispatches.map((route) => ({
      sequence: route.sequence,
      routeId: route.routeId,
      runtimeJobId: route.runtimeJobId,
      runtimeSpecHash: route.runtimeSpecHash,
      normalizedProviderRequestSha256: route.normalizedProviderRequestSha256,
    })),
    verifiedAt: now.toISOString(),
    singleRuntimeBatchVerified: true,
    completeRouteSetVerified: true,
    exactRuntimeSpecsVerified: true,
    partialProgrammeAuthorityAllowed: false,
    providerFallbackAllowed: false,
    providerCallsPerformedByDispatcher: false,
    candidateArtifactsWrittenByDispatcher: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
  const receipt: BookArtCreativeProgrammeDispatchReceiptV1 = {
    ...unsigned,
    receiptFingerprintSha256: fingerprint(unsigned),
  };
  return {
    outputKind:
      "evavo_book_art_creative_candidate_programme_dispatch_submission_result",
    schemaVersion: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
    contract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
    status: "submitted",
    identity: { ...plan.identity },
    plan,
    receipt,
    blockers: [],
    warnings: unique([
      ...compilation.warnings,
      "The dispatch receipt proves complete durable queue admission only. Candidate bytes, provider evidence, visual consensus, promotion and Book-use binding still require their later governed stages.",
    ]),
    runtimeBatchSubmitted: true,
    providerCallsPerformedByDispatcher: false,
    candidateArtifactsWrittenByDispatcher: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
}

async function validateProgramme(
  programme: Record<string, unknown>,
  expectedProgrammeFingerprintSha256: string,
): Promise<string[]> {
  const blockers: string[] = [];
  rejectUnknown(programme, PROGRAMME_FIELDS, "Creative candidate programme", blockers);
  if (
    programme.outputKind !== "evavo_book_art_creative_candidate_programme"
    || programme.schemaVersion !== BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION
    || programme.contract !== BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT
    || programme.creativeDirectionContract !== BOOK_CREATIVE_DIRECTION_CONTRACT
  ) {
    blockers.push("Creative candidate programme identity, version or contract is invalid.");
  }

  const programmeFingerprintSha256 = text(programme.programmeFingerprintSha256);
  if (
    !programmeFingerprintSha256
    || programmeFingerprintSha256 !== expectedProgrammeFingerprintSha256
  ) {
    blockers.push(
      "Creative candidate programme differs from the expected programme fingerprint.",
    );
  }
  const { programmeFingerprintSha256: _ignored, ...unsignedProgramme } =
    programme as Record<string, unknown>;
  if (
    programmeFingerprintSha256
    && programmeFingerprintSha256 !== fingerprint(unsignedProgramme)
  ) {
    blockers.push(
      "Creative candidate programme fingerprint does not match its exact bytes.",
    );
  }

  if (
    programme.routeCoverageComplete !== true
    || programme.materiallyDistinctRoutesRequired !== true
    || programme.exactlyOneCandidatePerCreativeRoute !== true
    || programme.oneProviderAttemptPerRoute !== true
  ) {
    blockers.push(
      "Creative candidate programme lost its complete distinct-route requirements.",
    );
  }
  for (const [field, expected] of [
    ["providerFallbackAllowed", false],
    ["bulkSubmissionAllowed", false],
    ["partialProgrammeExecutionAllowed", false],
    ["runtimeJobsSubmitted", false],
    ["providerCallPerformed", false],
    ["candidateArtifactsWritten", false],
    ["selectionPerformed", false],
    ["promotionPerformed", false],
    ["bookUseBindingCreated", false],
    ["publicationPerformed", false],
  ] as const) {
    if (programme[field] !== expected) {
      blockers.push(
        `Creative candidate programme ${field} must remain ${String(expected)}.`,
      );
    }
  }

  const routes = Array.isArray(programme.routePlans) ? programme.routePlans : [];
  const routeCount = programme.routeCount;
  if (
    !Number.isInteger(routeCount)
    || Number(routeCount) < 2
    || Number(routeCount) > 4
    || routes.length !== routeCount
  ) {
    blockers.push(
      "Creative candidate programme must contain the exact declared two-to-four route set.",
    );
  }

  const typedIdentity = identityFrom(record(programme.identity));
  const routeIds = new Set<string>();
  const routeKinds = new Set<string>();
  const compositions = new Set<string>();
  const requestFingerprints = new Set<string>();
  const runtimeJobIds = new Set<string>();
  const idempotencyKeys = new Set<string>();

  for (let index = 0; index < routes.length; index += 1) {
    const routeRecord = record(routes[index]);
    if (!routeRecord) {
      blockers.push(`Creative route ${index + 1} must be one object.`);
      continue;
    }
    rejectUnknown(routeRecord, ROUTE_FIELDS, `Creative route ${index + 1}`, blockers);
    const route = routeRecord as unknown as BookArtCreativeCandidateRoutePlanV1;
    if (route.sequence !== index + 1) {
      blockers.push(`Creative route ${index + 1} sequence is not canonical.`);
    }
    if (!SAFE_ID.test(text(route.routeId))) {
      blockers.push(`Creative route ${index + 1} routeId is invalid.`);
    }
    if (routeIds.has(route.routeId)) {
      blockers.push("Creative programme contains duplicate route identities.");
    }
    routeIds.add(route.routeId);
    if (routeKinds.has(route.routeKind)) {
      blockers.push("Creative programme contains duplicate route kinds.");
    }
    routeKinds.add(route.routeKind);
    if (compositions.has(route.composition)) {
      blockers.push("Creative programme contains duplicate route compositions.");
    }
    compositions.add(route.composition);
    if (
      route.exactlyOneCandidateForRoute !== true
      || route.providerFallbackAllowed !== false
      || route.runtimeJobSubmitted !== false
      || route.providerCallPerformed !== false
      || route.candidateArtifactsWritten !== false
    ) {
      blockers.push(
        `Creative route ${route.routeId} contains invalid execution authority.`,
      );
    }

    try {
      const validation = await validateBookArtProductionWorkOrder(route.workOrder);
      blockers.push(
        ...validation.issues.map(
          (issue) => `Creative route ${route.routeId} work order: ${issue}`,
        ),
      );
    } catch (error: unknown) {
      blockers.push(
        `Creative route ${route.routeId} work-order validation failed: ${message(error)}.`,
      );
    }
    if (
      route.workOrderFingerprintSha256
        !== route.workOrder.workOrderFingerprintSha256
      || route.briefFingerprint !== route.workOrder.sourceBriefFingerprint
    ) {
      blockers.push(
        `Creative route ${route.routeId} work-order binding is invalid.`,
      );
    }
    if (!sameIdentity(typedIdentity, route.workOrder.identity)) {
      blockers.push(
        `Creative route ${route.routeId} work-order identity differs from the programme.`,
      );
    }
    if (
      route.workOrder.providerRequest.metadata.conceptTerritoryId
        !== route.routeId
    ) {
      blockers.push(
        `Creative route ${route.routeId} work order lost its territory identity.`,
      );
    }

    blockers.push(
      ...validateProviderPlan(route, typedIdentity).map(
        (issue) => `Creative route ${route.routeId} provider plan: ${issue}`,
      ),
    );
    const providerPlan = route.providerJobPlan;
    if (requestFingerprints.has(providerPlan.normalizedProviderRequestSha256)) {
      blockers.push(
        "Creative programme contains duplicate provider requests across routes.",
      );
    }
    requestFingerprints.add(providerPlan.normalizedProviderRequestSha256);
    if (runtimeJobIds.has(providerPlan.runtimeJobId)) {
      blockers.push(
        "Creative programme contains duplicate runtime job identities across routes.",
      );
    }
    runtimeJobIds.add(providerPlan.runtimeJobId);
    try {
      const normalized = normalizeRuntimeJobSubmission(
        providerPlan.runtimeSubmission,
      );
      if (idempotencyKeys.has(normalized.spec.idempotencyKey)) {
        blockers.push(
          "Creative programme contains duplicate runtime idempotency keys across routes.",
        );
      }
      idempotencyKeys.add(normalized.spec.idempotencyKey);
    } catch {
      // validateProviderPlan records the exact runtime-submission failure.
    }
  }

  return unique(blockers);
}

function validateProviderPlan(
  route: BookArtCreativeCandidateRoutePlanV1,
  programmeIdentity: BookArtIdentityV1,
): string[] {
  const blockers: string[] = [];
  const providerRecord = record(route.providerJobPlan);
  if (!providerRecord) return ["Provider plan must be one object."];
  rejectUnknown(providerRecord, PROVIDER_PLAN_FIELDS, "Provider plan", blockers);
  const plan = providerRecord as unknown as BookArtProviderShadowJobPlanV1;
  if (
    plan.outputKind !== "evavo_book_art_provider_shadow_job_plan"
    || plan.schemaVersion !== BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION
    || plan.contract !== BOOK_ART_PROVIDER_RUNTIME_CONTRACT
  ) {
    blockers.push("Provider plan identity or version is invalid.");
  }
  if (!sameIdentity(plan.identity, programmeIdentity)) {
    blockers.push("Provider plan identity differs from the creative programme.");
  }
  if (
    plan.workOrderFingerprintSha256 !== route.workOrderFingerprintSha256
    || plan.sourceBriefFingerprint !== route.briefFingerprint
  ) {
    blockers.push("Provider plan is bound to a different route work order.");
  }
  for (const [field, expected] of [
    ["shadowOnly", true],
    ["providerCallPerformed", false],
    ["candidateArtifactsWritten", false],
    ["authoritativeBookWritesPerformed", false],
    ["selectionPerformed", false],
    ["promotionPerformed", false],
    ["bookUseBindingCreated", false],
    ["runtimeCutoverApproved", false],
    ["publicationPerformed", false],
  ] as const) {
    if (providerRecord[field] !== expected) {
      blockers.push(`Provider plan ${field} must remain ${String(expected)}.`);
    }
  }

  const { planFingerprintSha256: _ignored, ...unsignedPlan } =
    providerRecord as Record<string, unknown>;
  if (plan.planFingerprintSha256 !== fingerprint(unsignedPlan)) {
    blockers.push("Provider plan fingerprint does not match its exact bytes.");
  }

  try {
    const request = validateProviderCandidateRequest(
      plan.normalizedProviderRequest,
    );
    const requestHash = providerRequestSha256(request);
    const requestMetadata = record(request.metadata);
    if (requestHash !== plan.normalizedProviderRequestSha256) {
      blockers.push("Normalized provider request fingerprint is invalid.");
    }
    if (
      request.candidateCount !== 1
      || request.selection.allowFallback !== false
      || requestMetadata?.conceptTerritoryId !== route.routeId
    ) {
      blockers.push(
        "Provider request lost its one-route, one-candidate, no-fallback boundary.",
      );
    }
  } catch (error: unknown) {
    blockers.push(`Normalized provider request is invalid: ${message(error)}.`);
  }

  try {
    const normalized = normalizeRuntimeJobSubmission(plan.runtimeSubmission);
    if (
      normalized.spec.id !== plan.runtimeJobId
      || normalized.specHash !== plan.runtimeSpecHash
    ) {
      blockers.push(
        "Runtime submission identity or spec hash differs from the provider plan.",
      );
    }
    if (
      normalized.spec.queue !== "provider"
      || normalized.spec.kind !== "art.candidate.generate"
      || normalized.spec.maximumAttempts !== 1
    ) {
      blockers.push(
        "Runtime submission lost its single-attempt provider boundary.",
      );
    }
    const payloadRequest = validateProviderCandidateRequest(
      normalized.spec.payload,
    );
    if (
      providerRequestSha256(payloadRequest)
        !== plan.normalizedProviderRequestSha256
    ) {
      blockers.push(
        "Runtime payload differs from the normalized provider request.",
      );
    }
  } catch (error: unknown) {
    blockers.push(`Runtime submission is invalid: ${message(error)}.`);
  }
  return unique(blockers);
}

function validateSubmittedJobs(
  plan: BookArtCreativeProgrammeDispatchPlanV1,
  jobs: readonly RuntimeJobRecord[],
): string[] {
  const blockers: string[] = [];
  if (jobs.length !== plan.routeCount) {
    blockers.push(
      `Creative programme batch returned ${jobs.length} jobs for ${plan.routeCount} routes.`,
    );
    return blockers;
  }
  const returnedIds = new Set<string>();
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index]!;
    const expected = plan.routeDispatches[index]!;
    if (returnedIds.has(job.id)) {
      blockers.push("Creative programme batch returned a duplicate runtime job.");
    }
    returnedIds.add(job.id);
    if (
      job.id !== expected.runtimeJobId
      || job.specHash !== expected.runtimeSpecHash
      || job.spec.id !== expected.runtimeJobId
    ) {
      blockers.push(
        `Creative route ${expected.routeId} returned a different runtime job identity or spec hash.`,
      );
    }
    if (
      job.spec.queue !== "provider"
      || job.spec.kind !== "art.candidate.generate"
      || job.spec.maximumAttempts !== 1
    ) {
      blockers.push(
        `Creative route ${expected.routeId} returned a runtime job outside the no-retry provider boundary.`,
      );
    }
    try {
      const request = validateProviderCandidateRequest(job.spec.payload);
      if (
        providerRequestSha256(request)
          !== expected.normalizedProviderRequestSha256
      ) {
        blockers.push(
          `Creative route ${expected.routeId} returned a runtime payload outside the dispatch plan.`,
        );
      }
    } catch (error: unknown) {
      blockers.push(
        `Creative route ${expected.routeId} returned an invalid runtime payload: ${message(error)}.`,
      );
    }
  }
  return unique(blockers);
}

function blockedCompilation(
  identity: BookArtIdentityV1,
  blockers: string[],
  warnings: string[],
): BookArtCreativeProgrammeDispatchCompilationResultV1 {
  return {
    outputKind:
      "evavo_book_art_creative_candidate_programme_dispatch_compilation_result",
    schemaVersion: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
    contract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
    status: "blocked",
    identity,
    blockers: unique(blockers),
    warnings: unique(warnings),
    runtimeBatchSubmitted: false,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
}

function blockedSubmission(
  identity: BookArtIdentityV1,
  blockers: string[],
  warnings: string[],
  runtimeBatchSubmitted: boolean,
  plan?: BookArtCreativeProgrammeDispatchPlanV1,
): BookArtCreativeProgrammeDispatchSubmissionResultV1 {
  return {
    outputKind:
      "evavo_book_art_creative_candidate_programme_dispatch_submission_result",
    schemaVersion: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
    contract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
    status: "blocked",
    identity,
    ...(plan === undefined ? {} : { plan }),
    blockers: unique(blockers),
    warnings: unique(warnings),
    runtimeBatchSubmitted,
    providerCallsPerformedByDispatcher: false,
    candidateArtifactsWrittenByDispatcher: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
}

function fingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function identityFrom(
  value: Record<string, unknown> | undefined,
): BookArtIdentityV1 {
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
function sameIdentity(
  left: BookArtIdentityV1,
  right: BookArtIdentityV1,
): boolean {
  return stableStringify(normalizeJson(left))
    === stableStringify(normalizeJson(right));
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
function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
function message(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "unknown runtime error";
}
