import {
  normalizeJson,
  sha256,
  stableStringify,
} from "@evavo/art-artifacts";
import {
  BOOK_CREATIVE_DIRECTION_CONTRACT,
  compileBookArtProductionWorkOrder,
  compileBookCreativeDirection,
  type BookArtIdentityV1,
  type BookArtProductionWorkOrderV1,
  type BookCreativeDirectionInputV1,
  type BookCreativeDirectionRouteV1,
} from "@evavo/art-contracts";
import {
  compileBookArtProviderShadowJob,
  type BookArtProviderAdapterPolicyV1,
  type BookArtProviderShadowJobPlanV1,
} from "./index.js";

export const BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION = 1 as const;
export const BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT =
  "evavo_book_art_creative_candidate_programme_v1" as const;

export interface BookArtCreativeCandidateProgrammeInputV1 {
  outputKind: "evavo_book_art_creative_candidate_programme_input";
  schemaVersion: typeof BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT;
  creativeDirectionInput: unknown;
  requestedAt: string;
  requestedBy: string;
  adapterPolicy: BookArtProviderAdapterPolicyV1;
  providerFallbackAllowed: false;
  bulkSubmissionAllowed: false;
  partialProgrammeExecutionAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationAllowed: false;
}

export interface BookArtCreativeCandidateRoutePlanV1 {
  sequence: number;
  routeId: string;
  routeKind: BookCreativeDirectionRouteV1["routeKind"];
  composition: BookCreativeDirectionRouteV1["composition"];
  label: string;
  evidenceIds: string[];
  sourceLocationIds: string[];
  briefFingerprint: string;
  workOrderFingerprintSha256: string;
  workOrder: BookArtProductionWorkOrderV1;
  providerJobPlan: BookArtProviderShadowJobPlanV1;
  exactlyOneCandidateForRoute: true;
  providerFallbackAllowed: false;
  runtimeJobSubmitted: false;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
}

export interface BookArtCreativeCandidateProgrammeV1 {
  outputKind: "evavo_book_art_creative_candidate_programme";
  schemaVersion: typeof BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT;
  creativeDirectionContract: typeof BOOK_CREATIVE_DIRECTION_CONTRACT;
  identity: BookArtIdentityV1;
  purpose: BookCreativeDirectionInputV1["purpose"];
  creativeDirectionPlanFingerprint: string;
  creativeEvidenceFingerprint: string;
  routeCount: number;
  routePlans: BookArtCreativeCandidateRoutePlanV1[];
  routeCoverageComplete: true;
  materiallyDistinctRoutesRequired: true;
  exactlyOneCandidatePerCreativeRoute: true;
  oneProviderAttemptPerRoute: true;
  providerFallbackAllowed: false;
  bulkSubmissionAllowed: false;
  partialProgrammeExecutionAllowed: false;
  runtimeJobsSubmitted: false;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
  programmeFingerprintSha256: string;
}

export interface BookArtCreativeCandidateProgrammeResultV1 {
  outputKind: "evavo_book_art_creative_candidate_programme_result";
  schemaVersion: typeof BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  programme?: BookArtCreativeCandidateProgrammeV1;
  blockers: string[];
  warnings: string[];
  bulkSubmissionAllowed: false;
  runtimeJobsSubmitted: false;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  publicationPerformed: false;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const INPUT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "creativeDirectionInput",
  "requestedAt",
  "requestedBy",
  "adapterPolicy",
  "providerFallbackAllowed",
  "bulkSubmissionAllowed",
  "partialProgrammeExecutionAllowed",
  "automaticSelectionAllowed",
  "automaticPromotionAllowed",
  "publicationAllowed",
]);

export async function compileBookArtCreativeCandidateProgramme(
  value: unknown,
): Promise<BookArtCreativeCandidateProgrammeResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = record(value);
  if (!input) {
    return blocked(
      emptyIdentity(),
      ["Creative candidate programme input must be one object."],
      warnings,
    );
  }
  rejectUnknown(input, INPUT_FIELDS, "Creative candidate programme input", blockers);
  if (
    input.outputKind !== "evavo_book_art_creative_candidate_programme_input"
    || input.schemaVersion !== BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION
    || input.contract !== BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT
  ) {
    blockers.push("Creative candidate programme input identity or version is invalid.");
  }
  for (const field of [
    "providerFallbackAllowed",
    "bulkSubmissionAllowed",
    "partialProgrammeExecutionAllowed",
    "automaticSelectionAllowed",
    "automaticPromotionAllowed",
    "publicationAllowed",
  ] as const) {
    if (input[field] !== false) blockers.push(`${field} must remain false.`);
  }
  const requestedAt = text(input.requestedAt);
  if (!ISO_TIMESTAMP.test(requestedAt) || Number.isNaN(Date.parse(requestedAt))) {
    blockers.push(
      "Creative candidate programme requestedAt must be canonical UTC ISO-8601.",
    );
  }
  const requestedBy = text(input.requestedBy);
  if (!SAFE_ID.test(requestedBy)) {
    blockers.push("Creative candidate programme requestedBy is invalid.");
  }
  const adapterPolicy = record(input.adapterPolicy);
  if (!adapterPolicy) {
    blockers.push("Creative candidate programme adapterPolicy must be one object.");
  }

  const creativeInput = input.creativeDirectionInput;
  const creativeIdentity = parseCreativeIdentity(creativeInput);
  if (blockers.length > 0 || !adapterPolicy) {
    return blocked(creativeIdentity, unique(blockers), warnings);
  }

  const direction = await compileBookCreativeDirection(creativeInput);
  if (direction.status !== "ready" || !direction.plan) {
    return blocked(
      direction.identity,
      direction.blockers.map((item) => `Creative direction: ${item}`),
      unique([...warnings, ...direction.warnings]),
    );
  }

  if (direction.plan.routes.length < 2 || direction.plan.routes.length > 4) {
    blockers.push(
      "Creative candidate programme requires two to four compiled creative routes.",
    );
  }
  if (
    new Set(direction.plan.routes.map((route) => route.routeId)).size
    !== direction.plan.routes.length
  ) {
    blockers.push("Creative candidate programme requires unique route identities.");
  }
  if (
    new Set(direction.plan.routes.map((route) => route.routeKind)).size
    !== direction.plan.routes.length
  ) {
    blockers.push(
      "Creative candidate programme requires materially distinct route kinds.",
    );
  }
  if (
    new Set(direction.plan.routes.map((route) => route.composition)).size
    !== direction.plan.routes.length
  ) {
    blockers.push(
      "Creative candidate programme requires materially distinct route compositions.",
    );
  }
  if (blockers.length > 0) {
    return blocked(
      direction.identity,
      unique(blockers),
      unique([...warnings, ...direction.warnings]),
    );
  }

  const routePlans: BookArtCreativeCandidateRoutePlanV1[] = [];
  for (let index = 0; index < direction.plan.routes.length; index += 1) {
    const route = direction.plan.routes[index]!;
    const production = await compileBookArtProductionWorkOrder(route.brief);
    if (production.status !== "ready" || !production.workOrder) {
      blockers.push(
        ...production.blockers.map(
          (item) => `Route ${route.routeId} work order: ${item}`,
        ),
      );
      continue;
    }
    const executionId = `creative-route-${fingerprint({
      plan: direction.plan.planFingerprint,
      routeId: route.routeId,
      workOrder: production.workOrder.workOrderFingerprintSha256,
      requestedAt,
      requestedBy,
    }).slice(0, 40)}`;
    const provider = await compileBookArtProviderShadowJob({
      outputKind: "evavo_book_art_provider_shadow_job_input",
      schemaVersion: 1,
      executionId,
      requestedAt,
      workOrder: production.workOrder,
      adapterPolicy,
    });
    if (provider.status !== "ready" || !provider.plan) {
      blockers.push(
        ...provider.blockers.map(
          (item) => `Route ${route.routeId} provider plan: ${item}`,
        ),
      );
      continue;
    }
    if (provider.plan.normalizedProviderRequest.candidateCount !== 1) {
      blockers.push(
        `Route ${route.routeId} provider plan must request exactly one candidate.`,
      );
      continue;
    }
    if (
      provider.plan.normalizedProviderRequest.metadata.conceptTerritoryId
      !== route.routeId
    ) {
      blockers.push(
        `Route ${route.routeId} provider plan lost its exact creative territory identity.`,
      );
      continue;
    }
    routePlans.push({
      sequence: index + 1,
      routeId: route.routeId,
      routeKind: route.routeKind,
      composition: route.composition,
      label: route.label,
      evidenceIds: [...route.evidenceIds],
      sourceLocationIds: [...route.sourceLocationIds],
      briefFingerprint: route.brief.briefFingerprint,
      workOrderFingerprintSha256:
        production.workOrder.workOrderFingerprintSha256,
      workOrder: production.workOrder,
      providerJobPlan: provider.plan,
      exactlyOneCandidateForRoute: true,
      providerFallbackAllowed: false,
      runtimeJobSubmitted: false,
      providerCallPerformed: false,
      candidateArtifactsWritten: false,
    });
    warnings.push(
      ...provider.warnings.map((item) => `Route ${route.routeId}: ${item}`),
    );
  }

  if (
    blockers.length > 0
    || routePlans.length !== direction.plan.routes.length
  ) {
    return blocked(
      direction.identity,
      unique(blockers),
      unique([...warnings, ...direction.warnings]),
    );
  }

  const requestFingerprints = routePlans.map(
    (route) => route.providerJobPlan.normalizedProviderRequestSha256,
  );
  if (new Set(requestFingerprints).size !== requestFingerprints.length) {
    return blocked(
      direction.identity,
      [
        "Creative candidate programme compiled duplicate provider requests across distinct routes.",
      ],
      unique([...warnings, ...direction.warnings]),
    );
  }

  const withoutFingerprint: Omit<
    BookArtCreativeCandidateProgrammeV1,
    "programmeFingerprintSha256"
  > = {
    outputKind: "evavo_book_art_creative_candidate_programme",
    schemaVersion: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
    contract: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
    creativeDirectionContract: BOOK_CREATIVE_DIRECTION_CONTRACT,
    identity: { ...direction.identity },
    purpose: direction.plan.purpose,
    creativeDirectionPlanFingerprint: direction.plan.planFingerprint,
    creativeEvidenceFingerprint: direction.plan.evidenceFingerprint,
    routeCount: routePlans.length,
    routePlans,
    routeCoverageComplete: true,
    materiallyDistinctRoutesRequired: true,
    exactlyOneCandidatePerCreativeRoute: true,
    oneProviderAttemptPerRoute: true,
    providerFallbackAllowed: false,
    bulkSubmissionAllowed: false,
    partialProgrammeExecutionAllowed: false,
    runtimeJobsSubmitted: false,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
  const programme: BookArtCreativeCandidateProgrammeV1 = {
    ...withoutFingerprint,
    programmeFingerprintSha256: fingerprint(withoutFingerprint),
  };
  warnings.push(
    "This programme intentionally stops before runtime submission. Submit route jobs only through a later all-or-nothing governed dispatcher; do not loop over routePlans from an untrusted client.",
  );
  warnings.push(
    "The older same-prompt candidate-set compiler remains available for legacy callers, but manuscript-led production should use this route-aware programme so each candidate represents a different creative argument.",
  );
  return {
    outputKind: "evavo_book_art_creative_candidate_programme_result",
    schemaVersion: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
    contract: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
    status: "ready",
    identity: { ...direction.identity },
    programme,
    blockers: [],
    warnings: unique([...direction.warnings, ...warnings]),
    bulkSubmissionAllowed: false,
    runtimeJobsSubmitted: false,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    publicationPerformed: false,
  };
}

function parseCreativeIdentity(value: unknown): BookArtIdentityV1 {
  const input = record(value);
  const identity = record(input?.identity);
  return {
    workspaceId: safeIdentity(identity?.workspaceId),
    projectId: safeIdentity(identity?.projectId),
    bookId: safeIdentity(identity?.bookId),
    ...(safeIdentity(identity?.editionId) === "invalid"
      ? {}
      : { editionId: safeIdentity(identity?.editionId) }),
    requestId: safeIdentity(identity?.requestId),
  };
}

function safeIdentity(value: unknown): string {
  return typeof value === "string" && SAFE_ID.test(value) ? value : "invalid";
}

function blocked(
  identity: BookArtIdentityV1,
  blockers: string[],
  warnings: string[],
): BookArtCreativeCandidateProgrammeResultV1 {
  return {
    outputKind: "evavo_book_art_creative_candidate_programme_result",
    schemaVersion: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
    contract: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
    status: "blocked",
    identity,
    blockers: unique(blockers),
    warnings: unique(warnings),
    bulkSubmissionAllowed: false,
    runtimeJobsSubmitted: false,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
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

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
  blockers: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      blockers.push(`${label} contains unsupported field ${key}.`);
    }
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function fingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}
