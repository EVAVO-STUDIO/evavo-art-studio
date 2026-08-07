import {
  PROVIDER_CAPABILITIES,
  PROVIDER_PROTOCOL_VERSION,
  PROVIDER_REFERENCE_CAPABILITY_REQUIREMENTS,
  ProviderError,
  type NormalizedProviderCandidateRequest,
  type ProviderAdapter,
  type ProviderAdapterDescriptor,
  type ProviderCapability,
  type ProviderRankedAdapter,
  type ProviderRegistryLike,
  type ProviderRoutingInspection,
  type ProviderSelectionDecision,
} from "./types.js";
import { providerRequestSha256 } from "./validation.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const CAPABILITIES = new Set<ProviderCapability>(PROVIDER_CAPABILITIES);

function requiredCapabilities(
  request: NormalizedProviderCandidateRequest,
): readonly ProviderCapability[] {
  const required = new Set<ProviderCapability>([
    request.operation,
    "cancellation",
  ]);
  if (request.references.length > 0) required.add("reference-images");
  if (request.references.length > 1) required.add("multiple-reference-images");
  for (const reference of request.references) {
    if (!reference.required) continue;
    const capability =
      PROVIDER_REFERENCE_CAPABILITY_REQUIREMENTS[reference.role];
    if (capability !== null) required.add(capability);
  }
  if (request.references.some((entry) => entry.role === "mask")) {
    required.add("mask");
  }
  if (request.seed !== undefined || request.selection.requireSeed) {
    required.add("seed");
  }
  if (request.background.strategy === "native-alpha") {
    required.add("native-alpha");
  }
  if (request.sourceCanvas !== undefined) required.add("custom-size");
  if (request.candidateCount > 1) required.add("candidate-count");
  return [...required].sort();
}

function validateDescriptor(descriptor: ProviderAdapterDescriptor): void {
  if (descriptor.protocolVersion !== PROVIDER_PROTOCOL_VERSION) {
    throw new ProviderError(
      "PROVIDER_ADAPTER_PROTOCOL_MISMATCH",
      `Adapter ${descriptor.id} does not use provider protocol ${PROVIDER_PROTOCOL_VERSION}.`,
      "permanent",
    );
  }
  if (!SAFE_ID.test(descriptor.id)) {
    throw new ProviderError(
      "PROVIDER_ADAPTER_INVALID",
      "Provider adapter id must use 1 to 128 safe characters.",
      "permanent",
    );
  }
  if (!descriptor.label.trim() || !descriptor.version.trim()) {
    throw new ProviderError(
      "PROVIDER_ADAPTER_INVALID",
      `Adapter ${descriptor.id} requires a label and version.`,
      "permanent",
    );
  }
  if (
    !Number.isInteger(descriptor.priority) ||
    descriptor.priority < -10_000 ||
    descriptor.priority > 10_000 ||
    !Number.isInteger(descriptor.maximumCandidates) ||
    descriptor.maximumCandidates < 1 ||
    descriptor.maximumCandidates > 64 ||
    !Number.isInteger(descriptor.maximumReferenceImages) ||
    descriptor.maximumReferenceImages < 0 ||
    descriptor.maximumReferenceImages > 128 ||
    !Number.isInteger(descriptor.maximumSourceBytes) ||
    descriptor.maximumSourceBytes < 1
  ) {
    throw new ProviderError(
      "PROVIDER_ADAPTER_INVALID",
      `Adapter ${descriptor.id} contains invalid numeric limits.`,
      "permanent",
    );
  }
  if (
    !descriptor.models.length ||
    new Set(descriptor.models).size !== descriptor.models.length
  ) {
    throw new ProviderError(
      "PROVIDER_ADAPTER_INVALID",
      `Adapter ${descriptor.id} must declare unique supported models.`,
      "permanent",
    );
  }
  if (new Set(descriptor.capabilities).size !== descriptor.capabilities.length) {
    throw new ProviderError(
      "PROVIDER_ADAPTER_INVALID",
      `Adapter ${descriptor.id} declares duplicate capabilities.`,
      "permanent",
    );
  }
  const unsupportedCapability = descriptor.capabilities.find(
    (capability) => !CAPABILITIES.has(capability),
  );
  if (unsupportedCapability) {
    throw new ProviderError(
      "PROVIDER_ADAPTER_INVALID",
      `Adapter ${descriptor.id} declares unknown capability ${unsupportedCapability}.`,
      "permanent",
    );
  }
}

function decisionFor(
  adapter: ProviderAdapter,
  request: NormalizedProviderCandidateRequest,
): Readonly<{ decision: ProviderSelectionDecision; score: number }> {
  const descriptor = adapter.descriptor;
  const reasons: string[] = [];
  let eligible = true;
  const allowed = request.selection.allowedAdapterIds;
  if (allowed.length && !allowed.includes(descriptor.id)) {
    eligible = false;
    reasons.push("adapter is outside the request allow-list");
  }
  const capabilities = new Set(descriptor.capabilities);
  for (const capability of requiredCapabilities(request)) {
    if (!capabilities.has(capability)) {
      eligible = false;
      reasons.push(`missing capability ${capability}`);
    }
  }
  if (request.candidateCount > descriptor.maximumCandidates) {
    eligible = false;
    reasons.push(
      `candidate count ${request.candidateCount} exceeds adapter limit ${descriptor.maximumCandidates}`,
    );
  }
  if (request.references.length > descriptor.maximumReferenceImages) {
    eligible = false;
    reasons.push(
      `reference count ${request.references.length} exceeds adapter limit ${descriptor.maximumReferenceImages}`,
    );
  }
  if (
    request.selection.preferredModel &&
    !descriptor.models.includes(request.selection.preferredModel)
  ) {
    eligible = false;
    reasons.push(`preferred model ${request.selection.preferredModel} is unsupported`);
  }
  if (!reasons.length) {
    reasons.push("all declared request capabilities are supported");
  }

  const preferred = request.selection.preferredAdapterId === descriptor.id;
  const score =
    descriptor.priority * 1_000 +
    (preferred ? 10_000_000 : 0) +
    (descriptor.dataPolicy.remote ? 0 : 50) +
    (descriptor.dataPolicy.retainedByProvider === false ? 25 : 0) +
    (descriptor.dataPolicy.usedForTraining === false ? 25 : 0);
  return {
    score,
    decision: {
      adapterId: descriptor.id,
      eligible,
      reasons,
      rank: 0,
    },
  };
}

export class ProviderRegistry implements ProviderRegistryLike {
  readonly #adapters: readonly ProviderAdapter[];

  public constructor(adapters: readonly ProviderAdapter[]) {
    const ids = new Set<string>();
    for (const adapter of adapters) {
      validateDescriptor(adapter.descriptor);
      if (ids.has(adapter.descriptor.id)) {
        throw new ProviderError(
          "PROVIDER_ADAPTER_DUPLICATE",
          `Provider adapter is registered more than once: ${adapter.descriptor.id}`,
          "permanent",
        );
      }
      ids.add(adapter.descriptor.id);
    }
    this.#adapters = [...adapters].sort(
      (left, right) =>
        right.descriptor.priority - left.descriptor.priority ||
        left.descriptor.id.localeCompare(right.descriptor.id),
    );
  }

  public list(): readonly ProviderAdapterDescriptor[] {
    return this.#adapters.map((adapter) => adapter.descriptor);
  }

  public rank(request: NormalizedProviderCandidateRequest) {
    const ranked = this.#adapters
      .map((adapter) => ({ adapter, ...decisionFor(adapter, request) }))
      .sort(
        (left, right) =>
          Number(right.decision.eligible) - Number(left.decision.eligible) ||
          right.score - left.score ||
          left.adapter.descriptor.id.localeCompare(right.adapter.descriptor.id),
      );
    return ranked.map((entry, index) => ({
      adapter: entry.adapter,
      decision: { ...entry.decision, rank: index + 1 },
    }));
  }
}

export function providerRequiredCapabilities(
  request: NormalizedProviderCandidateRequest,
): readonly ProviderCapability[] {
  return requiredCapabilities(request);
}

export function compileProviderRoutingInspection(
  request: NormalizedProviderCandidateRequest,
  ranked: readonly ProviderRankedAdapter[],
): ProviderRoutingInspection {
  const adapters = ranked.map((entry) => ({
    descriptor: entry.adapter.descriptor,
    decision: entry.decision,
  }));
  const eligibleAdapterIds = adapters
    .filter((entry) => entry.decision.eligible)
    .map((entry) => entry.descriptor.id);
  return {
    schemaVersion: "1.0",
    protocolVersion: PROVIDER_PROTOCOL_VERSION,
    requestId: request.requestId,
    requestSha256: providerRequestSha256(request),
    requiredCapabilities: requiredCapabilities(request),
    adapters,
    eligibleAdapterIds,
    ...(eligibleAdapterIds[0] === undefined
      ? {}
      : { firstEligibleAdapterId: eligibleAdapterIds[0] }),
    outcome: eligibleAdapterIds.length ? "eligible" : "blocked",
    fallbackAllowed: request.selection.allowFallback,
    providerCallPerformedByInspection: false,
  };
}

export function inspectProviderCandidateRouting(
  request: NormalizedProviderCandidateRequest,
  registry: ProviderRegistryLike,
): ProviderRoutingInspection {
  return compileProviderRoutingInspection(request, registry.rank(request));
}
