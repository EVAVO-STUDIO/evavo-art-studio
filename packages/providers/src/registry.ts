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
const MAXIMUM_DESCRIPTOR_LABEL_LENGTH = 256;
const MAXIMUM_DESCRIPTOR_SOURCE_BYTES = 1024 * 1024 * 1024;
const MAXIMUM_ROUTING_REASONS = 64;
const MAXIMUM_ROUTING_REASON_LENGTH = 1_000;

const CAPABILITIES = new Set<string>(PROVIDER_CAPABILITIES);

export interface ProviderExecutionRoutingPlan {
  readonly inspection: ProviderRoutingInspection;
  readonly eligibleAdapters: readonly ProviderRankedAdapter[];
}

function invalidAdapter(message: string): never {
  throw new ProviderError(
    "PROVIDER_ADAPTER_INVALID",
    message,
    "permanent",
  );
}

function invalidRouting(message: string): never {
  throw new ProviderError(
    "PROVIDER_ROUTING_INSPECTION_INVALID",
    message,
    "permanent",
  );
}

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

function validProviderPolicyValue(value: unknown): boolean {
  return typeof value === "boolean" || value === "provider-dependent";
}

function validateDescriptor(descriptor: ProviderAdapterDescriptor): void {
  if (!descriptor || typeof descriptor !== "object") {
    invalidAdapter("Provider adapter descriptor must be one object.");
  }
  if (descriptor.protocolVersion !== PROVIDER_PROTOCOL_VERSION) {
    throw new ProviderError(
      "PROVIDER_ADAPTER_PROTOCOL_MISMATCH",
      `Adapter ${String(descriptor.id)} does not use provider protocol ${PROVIDER_PROTOCOL_VERSION}.`,
      "permanent",
    );
  }
  if (typeof descriptor.id !== "string" || !SAFE_ID.test(descriptor.id)) {
    invalidAdapter("Provider adapter id must use 1 to 128 safe characters.");
  }
  if (
    typeof descriptor.label !== "string" ||
    !descriptor.label.trim() ||
    descriptor.label.length > MAXIMUM_DESCRIPTOR_LABEL_LENGTH ||
    descriptor.label.includes("\0") ||
    typeof descriptor.version !== "string" ||
    !SAFE_ID.test(descriptor.version)
  ) {
    invalidAdapter(
      `Adapter ${descriptor.id} requires a safe version and a non-empty label of at most ${MAXIMUM_DESCRIPTOR_LABEL_LENGTH} characters.`,
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
    descriptor.maximumSourceBytes < 1 ||
    descriptor.maximumSourceBytes > MAXIMUM_DESCRIPTOR_SOURCE_BYTES
  ) {
    invalidAdapter(`Adapter ${descriptor.id} contains invalid numeric limits.`);
  }
  if (
    !Array.isArray(descriptor.models) ||
    !descriptor.models.length ||
    new Set(descriptor.models).size !== descriptor.models.length ||
    descriptor.models.some(
      (model) => typeof model !== "string" || !SAFE_ID.test(model),
    )
  ) {
    invalidAdapter(
      `Adapter ${descriptor.id} must declare unique safe supported models.`,
    );
  }
  if (
    !Array.isArray(descriptor.capabilities) ||
    new Set(descriptor.capabilities).size !== descriptor.capabilities.length
  ) {
    invalidAdapter(
      `Adapter ${descriptor.id} declares duplicate or invalid capabilities.`,
    );
  }
  const unsupportedCapability = descriptor.capabilities.find(
    (capability) =>
      typeof capability !== "string" || !CAPABILITIES.has(capability),
  );
  if (unsupportedCapability) {
    invalidAdapter(
      `Adapter ${descriptor.id} declares unknown capability ${String(unsupportedCapability)}.`,
    );
  }
  if (
    !descriptor.dataPolicy ||
    typeof descriptor.dataPolicy !== "object" ||
    typeof descriptor.dataPolicy.remote !== "boolean" ||
    !validProviderPolicyValue(descriptor.dataPolicy.retainedByProvider) ||
    !validProviderPolicyValue(descriptor.dataPolicy.usedForTraining)
  ) {
    invalidAdapter(`Adapter ${descriptor.id} declares an invalid data policy.`);
  }
}

function snapshotDescriptor(
  input: ProviderAdapterDescriptor,
): ProviderAdapterDescriptor {
  if (!input || typeof input !== "object") {
    invalidAdapter("Provider adapter descriptor must be one object.");
  }
  try {
    const protocolVersion = input.protocolVersion;
    const id = input.id;
    const label = input.label;
    const version = input.version;
    const priority = input.priority;
    const capabilitiesInput = input.capabilities;
    const modelsInput = input.models;
    const maximumCandidates = input.maximumCandidates;
    const maximumReferenceImages = input.maximumReferenceImages;
    const maximumSourceBytes = input.maximumSourceBytes;
    const dataPolicyInput = input.dataPolicy;
    const capabilities = Object.freeze([...capabilitiesInput]);
    const models = Object.freeze([...modelsInput]);
    const dataPolicy = Object.freeze({
      remote: dataPolicyInput.remote,
      retainedByProvider: dataPolicyInput.retainedByProvider,
      usedForTraining: dataPolicyInput.usedForTraining,
    });
    const snapshot: ProviderAdapterDescriptor = {
      protocolVersion,
      id,
      label,
      version,
      priority,
      capabilities,
      models,
      maximumCandidates,
      maximumReferenceImages,
      maximumSourceBytes,
      dataPolicy,
    };
    validateDescriptor(snapshot);
    return Object.freeze(snapshot);
  } catch (error: unknown) {
    if (error instanceof ProviderError) throw error;
    invalidAdapter("Provider adapter descriptor could not be snapshotted safely.");
  }
}

function snapshotAdapter(adapter: ProviderAdapter): ProviderAdapter {
  if (!adapter || typeof adapter !== "object") {
    invalidAdapter("Provider adapter must expose a descriptor and execute function.");
  }
  try {
    const descriptorInput = adapter.descriptor;
    const execute = adapter.execute;
    if (typeof execute !== "function") {
      invalidAdapter("Provider adapter must expose a descriptor and execute function.");
    }
    const descriptor = snapshotDescriptor(descriptorInput);
    return Object.freeze({
      descriptor,
      execute: execute.bind(adapter),
    });
  } catch (error: unknown) {
    if (error instanceof ProviderError) throw error;
    invalidAdapter("Provider adapter could not be snapshotted safely.");
  }
}

function snapshotDecision(
  decision: ProviderSelectionDecision,
  descriptor: ProviderAdapterDescriptor,
  expectedRank: number,
): ProviderSelectionDecision {
  if (!decision || typeof decision !== "object") {
    invalidRouting("Provider routing decision must be one object.");
  }
  try {
    const adapterId = decision.adapterId;
    const eligible = decision.eligible;
    const rank = decision.rank;
    const reasonsInput = decision.reasons;
    if (!Array.isArray(reasonsInput)) {
      invalidRouting(
        `Provider routing reasons are invalid for adapter ${descriptor.id}.`,
      );
    }
    const reasons = [...reasonsInput];
    if (typeof adapterId !== "string" || adapterId !== descriptor.id) {
      invalidRouting(
        `Provider routing decision identity does not match adapter ${descriptor.id}.`,
      );
    }
    if (typeof eligible !== "boolean") {
      invalidRouting(
        `Provider routing eligibility is invalid for adapter ${descriptor.id}.`,
      );
    }
    if (!Number.isInteger(rank) || rank !== expectedRank) {
      invalidRouting(
        `Provider routing rank for adapter ${descriptor.id} must be ${expectedRank}.`,
      );
    }
    if (
      !reasons.length ||
      reasons.length > MAXIMUM_ROUTING_REASONS ||
      reasons.some(
        (reason) =>
          typeof reason !== "string" ||
          !reason.trim() ||
          reason.length > MAXIMUM_ROUTING_REASON_LENGTH ||
          reason.includes("\0"),
      )
    ) {
      invalidRouting(
        `Provider routing reasons are invalid for adapter ${descriptor.id}.`,
      );
    }
    return Object.freeze({
      adapterId,
      eligible,
      reasons: Object.freeze(reasons),
      rank,
    });
  } catch (error: unknown) {
    if (error instanceof ProviderError) throw error;
    invalidRouting(
      `Provider routing decision for adapter ${descriptor.id} could not be snapshotted safely.`,
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
    decision: Object.freeze({
      adapterId: descriptor.id,
      eligible,
      reasons: Object.freeze(reasons),
      rank: 0,
    }),
  };
}

function snapshotRankedEntries(
  request: NormalizedProviderCandidateRequest,
  ranked: readonly ProviderRankedAdapter[],
): readonly ProviderRankedAdapter[] {
  if (!Array.isArray(ranked)) {
    invalidRouting("Provider routing input must be one ranked adapter array.");
  }
  let rankedEntries: readonly ProviderRankedAdapter[];
  try {
    rankedEntries = [...ranked];
  } catch {
    invalidRouting("Provider routing input could not be snapshotted safely.");
  }

  const seenAdapterIds = new Set<string>();
  let ineligibleEncountered = false;
  const snapshots = rankedEntries.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      invalidRouting(`Provider routing entry ${index + 1} is invalid.`);
    }
    let adapterInput: ProviderAdapter;
    let decisionInput: ProviderSelectionDecision;
    try {
      adapterInput = entry.adapter;
      decisionInput = entry.decision;
    } catch {
      invalidRouting(`Provider routing entry ${index + 1} could not be read safely.`);
    }

    const adapter = snapshotAdapter(adapterInput);
    const descriptor = adapter.descriptor;
    if (seenAdapterIds.has(descriptor.id)) {
      invalidRouting(
        `Provider routing contains duplicate adapter ${descriptor.id}.`,
      );
    }
    seenAdapterIds.add(descriptor.id);

    const decision = snapshotDecision(
      decisionInput,
      descriptor,
      index + 1,
    );
    const staticDecision = decisionFor(adapter, request).decision;
    if (decision.eligible && !staticDecision.eligible) {
      invalidRouting(
        `Provider routing cannot mark adapter ${descriptor.id} eligible because ${staticDecision.reasons.join("; ")}.`,
      );
    }
    if (ineligibleEncountered && decision.eligible) {
      invalidRouting(
        "Eligible provider adapters must precede ineligible adapters in routing order.",
      );
    }
    if (!decision.eligible) ineligibleEncountered = true;

    return Object.freeze({ adapter, decision });
  });
  return Object.freeze(snapshots);
}

function inspectionFor(
  request: NormalizedProviderCandidateRequest,
  entries: readonly ProviderRankedAdapter[],
): ProviderRoutingInspection {
  const adapters = Object.freeze(
    entries.map((entry) =>
      Object.freeze({
        descriptor: entry.adapter.descriptor,
        decision: entry.decision,
      }),
    ),
  );
  const eligibleAdapterIds = Object.freeze(
    entries
      .filter((entry) => entry.decision.eligible)
      .map((entry) => entry.adapter.descriptor.id),
  );
  const required = Object.freeze([...requiredCapabilities(request)]);
  return Object.freeze({
    schemaVersion: "1.0",
    protocolVersion: PROVIDER_PROTOCOL_VERSION,
    requestId: request.requestId,
    requestSha256: providerRequestSha256(request),
    requiredCapabilities: required,
    adapters,
    eligibleAdapterIds,
    ...(eligibleAdapterIds[0] === undefined
      ? {}
      : { firstEligibleAdapterId: eligibleAdapterIds[0] }),
    outcome: eligibleAdapterIds.length ? "eligible" : "blocked",
    fallbackAllowed: request.selection.allowFallback,
    providerCallPerformedByInspection: false,
  });
}

export class ProviderRegistry implements ProviderRegistryLike {
  readonly #adapters: readonly ProviderAdapter[];

  public constructor(adapters: readonly ProviderAdapter[]) {
    if (!Array.isArray(adapters)) {
      invalidAdapter("Provider registry adapters must be one array.");
    }
    const registered = adapters.map(snapshotAdapter);
    const ids = new Set<string>();
    for (const adapter of registered) {
      if (ids.has(adapter.descriptor.id)) {
        throw new ProviderError(
          "PROVIDER_ADAPTER_DUPLICATE",
          `Provider adapter is registered more than once: ${adapter.descriptor.id}`,
          "permanent",
        );
      }
      ids.add(adapter.descriptor.id);
    }
    this.#adapters = Object.freeze(
      registered.sort(
        (left, right) =>
          right.descriptor.priority - left.descriptor.priority ||
          left.descriptor.id.localeCompare(right.descriptor.id),
      ),
    );
  }

  public list(): readonly ProviderAdapterDescriptor[] {
    return Object.freeze(this.#adapters.map((adapter) => adapter.descriptor));
  }

  public rank(
    request: NormalizedProviderCandidateRequest,
  ): readonly ProviderRankedAdapter[] {
    const ranked = this.#adapters
      .map((adapter) => ({ adapter, ...decisionFor(adapter, request) }))
      .sort(
        (left, right) =>
          Number(right.decision.eligible) - Number(left.decision.eligible) ||
          right.score - left.score ||
          left.adapter.descriptor.id.localeCompare(right.adapter.descriptor.id),
      );
    return Object.freeze(
      ranked.map((entry, index) =>
        Object.freeze({
          adapter: entry.adapter,
          decision: Object.freeze({
            ...entry.decision,
            rank: index + 1,
          }),
        }),
      ),
    );
  }
}

export function providerRequiredCapabilities(
  request: NormalizedProviderCandidateRequest,
): readonly ProviderCapability[] {
  return requiredCapabilities(request);
}

export function compileProviderExecutionRoutingPlan(
  request: NormalizedProviderCandidateRequest,
  ranked: readonly ProviderRankedAdapter[],
): ProviderExecutionRoutingPlan {
  const entries = snapshotRankedEntries(request, ranked);
  const inspection = inspectionFor(request, entries);
  const eligibleAdapters = Object.freeze(
    entries.filter((entry) => entry.decision.eligible),
  );
  return Object.freeze({ inspection, eligibleAdapters });
}

export function compileProviderRoutingInspection(
  request: NormalizedProviderCandidateRequest,
  ranked: readonly ProviderRankedAdapter[],
): ProviderRoutingInspection {
  return compileProviderExecutionRoutingPlan(request, ranked).inspection;
}

export function inspectProviderCandidateRouting(
  request: NormalizedProviderCandidateRequest,
  registry: ProviderRegistryLike,
): ProviderRoutingInspection {
  return compileProviderExecutionRoutingPlan(
    request,
    registry.rank(request),
  ).inspection;
}
