import type { JsonValue } from "@evavo/art-artifacts";
import {
  FixtureImageProviderAdapter,
  OpenAIImageProviderAdapter,
  ProviderError,
  ProviderRegistry,
  executeProviderCandidateRequest,
  providerRequiredCapabilities,
  validateProviderCandidateRequest,
  type NormalizedProviderCandidateRequest,
  type ProviderRegistryLike,
} from "@evavo/art-providers";
import {
  CancelledRuntimeError,
  PermanentRuntimeError,
  TransientRuntimeError,
  type RuntimeJobHandler,
  type RuntimeJobRecord,
  type RuntimeWorkerCapabilityProfile,
} from "@evavo/art-runtime";

export const RAW_ART_PROVIDER_EXECUTION_CAPABILITY =
  "raw-art.execution-authorized" as const;
const RAW_ART_PROVIDER_REQUEST_METADATA_SCHEMA =
  "evavo.raw-art-provider-request-metadata.v2";

export interface RawArtProviderExecutionAuthorizer {
  readonly authorizationSha256: string;
  readonly allowedAdapterIds: readonly string[];
  readonly queues: readonly string[];
  readonly requiredCapability: typeof RAW_ART_PROVIDER_EXECUTION_CAPABILITY;
  adapterAllowed(adapterId: string): boolean;
  assertJobAuthorized(
    job: RuntimeJobRecord,
    request: NormalizedProviderCandidateRequest,
    now?: Date,
  ): unknown;
}

const OPERATION_KIND = Object.freeze({
  generate: "art.candidate.generate",
  edit: "art.candidate.edit",
  inpaint: "art.candidate.inpaint",
} as const);

function envList(
  value: string | undefined,
  fallback: readonly string[],
): readonly string[] {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(entries.length ? entries : fallback)];
}

function envInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function createProviderRegistryFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProviderRegistry {
  const adapters = [];
  if (environment.EVAVO_ART_ENABLE_FIXTURE_PROVIDER === "true") {
    adapters.push(new FixtureImageProviderAdapter());
  }
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (apiKey) {
    const model = environment.EVAVO_ART_OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
    adapters.push(
      new OpenAIImageProviderAdapter({
        apiKey,
        model,
        allowedModels: envList(environment.EVAVO_ART_OPENAI_IMAGE_MODELS, [
          model,
          "gpt-image-2-2026-04-21",
        ]),
        ...(environment.EVAVO_ART_OPENAI_BASE_URL?.trim()
          ? { baseUrl: environment.EVAVO_ART_OPENAI_BASE_URL.trim() }
          : {}),
        ...(environment.OPENAI_ORGANIZATION?.trim()
          ? { organization: environment.OPENAI_ORGANIZATION.trim() }
          : {}),
        ...(environment.OPENAI_PROJECT?.trim()
          ? { project: environment.OPENAI_PROJECT.trim() }
          : {}),
        maximumResponseBytes: envInteger(
          environment.EVAVO_ART_PROVIDER_MAX_RESPONSE_BYTES,
          128 * 1024 * 1024,
          1_024,
          512 * 1024 * 1024,
          "EVAVO_ART_PROVIDER_MAX_RESPONSE_BYTES",
        ),
      }),
    );
  }
  return new ProviderRegistry(adapters);
}

function expectedKind(request: NormalizedProviderCandidateRequest): string {
  return OPERATION_KIND[request.operation];
}

function providerFailure(error: ProviderError): Error {
  if (error.classification === "transient") {
    return new TransientRuntimeError(error.code, error.message, error.details);
  }
  if (error.classification === "cancelled") {
    return new CancelledRuntimeError(error.message);
  }
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

type JsonObject = Readonly<{ [key: string]: JsonValue }>;

function isJsonObject(value: JsonValue): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function rawArtRequest(
  request: NormalizedProviderCandidateRequest,
): boolean {
  const metadata = request.metadata;
  return (
    isJsonObject(metadata) &&
    metadata.schema === RAW_ART_PROVIDER_REQUEST_METADATA_SCHEMA
  );
}

function requireRawArtExecutionAuthorization(
  job: RuntimeJobRecord,
  request: NormalizedProviderCandidateRequest,
  authorization: RawArtProviderExecutionAuthorizer | undefined,
): void {
  const metadataGoverned = rawArtRequest(request);
  const capabilityGoverned = job.spec.requiredCapabilities.includes(
    RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
  );
  if (!metadataGoverned && !capabilityGoverned) return;
  if (!metadataGoverned || !capabilityGoverned) {
    throw new PermanentRuntimeError(
      "RAW_ART_PROVIDER_EXECUTION_CONTRACT_MISMATCH",
      "RAW_ART provider execution metadata and runtime capability must be declared together.",
    );
  }
  if (!authorization) {
    throw new PermanentRuntimeError(
      "RAW_ART_PROVIDER_EXECUTION_UNAUTHORIZED",
      "RAW_ART provider jobs require an exact active execution authorization before any provider call.",
    );
  }
  try {
    authorization.assertJobAuthorized(job, request, new Date());
  } catch (error: unknown) {
    throw new PermanentRuntimeError(
      "RAW_ART_PROVIDER_EXECUTION_UNAUTHORIZED",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function createHandler(
  registry: ProviderRegistryLike,
  kind: (typeof OPERATION_KIND)[keyof typeof OPERATION_KIND],
  authorization?: RawArtProviderExecutionAuthorizer,
): RuntimeJobHandler {
  return async (context) => {
    let request: NormalizedProviderCandidateRequest;
    try {
      request = validateProviderCandidateRequest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof ProviderError) throw providerFailure(error);
      throw error;
    }
    if (expectedKind(request) !== kind) {
      throw new PermanentRuntimeError(
        "PROVIDER_RUNTIME_KIND_MISMATCH",
        `Runtime kind ${kind} cannot execute provider operation ${request.operation}.`,
      );
    }
    const requiredCapability = `provider.${request.operation}`;
    if (!context.job.spec.requiredCapabilities.includes(requiredCapability)) {
      throw new PermanentRuntimeError(
        "PROVIDER_RUNTIME_CAPABILITY_MISSING",
        `Provider job must require ${requiredCapability}.`,
      );
    }
    const expectedProfile = providerRequiredCapabilities(request);
    const declaredProfile = context.job.spec.requiredCapabilityProfile;
    if (declaredProfile === undefined) {
      throw new PermanentRuntimeError(
        "PROVIDER_RUNTIME_CAPABILITY_PROFILE_MISSING",
        "Provider job must declare the exact adapter capability profile derived from its normalized request.",
      );
    }
    if (
      declaredProfile.length !== expectedProfile.length ||
      declaredProfile.some((capability, index) =>
        capability !== expectedProfile[index],
      )
    ) {
      throw new PermanentRuntimeError(
        "PROVIDER_RUNTIME_CAPABILITY_PROFILE_MISMATCH",
        "Provider job adapter capability profile does not match its normalized request.",
      );
    }
    requireRawArtExecutionAuthorization(
      context.job,
      request,
      authorization,
    );
    try {
      const result = await executeProviderCandidateRequest(request, {
        registry,
        artifacts: context.artifacts,
        signal: context.signal,
      });
      return {
        outputArtifacts: [
          ...result.candidateArtifacts,
          result.evidenceArtifact,
        ],
        result: result as unknown as JsonValue,
      };
    } catch (error: unknown) {
      if (error instanceof ProviderError) throw providerFailure(error);
      throw error;
    }
  };
}

export function createProviderHandlers(
  registry: ProviderRegistryLike,
  authorization?: RawArtProviderExecutionAuthorizer,
): Readonly<Record<string, RuntimeJobHandler>> {
  return Object.freeze({
    "art.candidate.generate": createHandler(
      registry,
      "art.candidate.generate",
      authorization,
    ),
    "art.candidate.edit": createHandler(
      registry,
      "art.candidate.edit",
      authorization,
    ),
    "art.candidate.inpaint": createHandler(
      registry,
      "art.candidate.inpaint",
      authorization,
    ),
  });
}

export function providerWorkerCapabilities(
  registry: ProviderRegistryLike,
): readonly string[] {
  const capabilities = new Set<string>();
  for (const adapter of registry.list()) {
    if (adapter.capabilities.includes("generate")) capabilities.add("provider.generate");
    if (adapter.capabilities.includes("edit")) capabilities.add("provider.edit");
    if (adapter.capabilities.includes("inpaint")) capabilities.add("provider.inpaint");
    if (adapter.capabilities.includes("reference-images")) {
      capabilities.add("provider.reference-lock");
    }
    if (adapter.capabilities.includes("mask")) capabilities.add("provider.mask");
  }
  if (registry.list().length) {
    capabilities.add("provider.candidate-store");
    capabilities.add("evidence.bundle");
  }
  return [...capabilities].sort();
}
export function providerWorkerCapabilityProfiles(
  registry: ProviderRegistryLike,
): readonly RuntimeWorkerCapabilityProfile[] {
  return registry.list().map((adapter) => ({
    id: adapter.id,
    capabilities: [...adapter.capabilities].sort(),
  }));
}

export function restrictProviderRegistry(
  registry: ProviderRegistryLike,
  allowedAdapterIds: readonly string[],
): ProviderRegistryLike {
  const allowed = new Set(allowedAdapterIds);
  if (!allowed.size) {
    throw new Error("RAW_ART provider execution requires at least one allowed adapter.");
  }
  const descriptors = registry
    .list()
    .filter((entry) => allowed.has(entry.id));
  const available = new Set(descriptors.map((entry) => entry.id));
  const missing = [...allowed].filter((adapterId) => !available.has(adapterId));
  if (missing.length) {
    throw new Error(
      `RAW_ART provider execution authorization names unavailable adapters: ${missing.join(", ")}`,
    );
  }
  return Object.freeze({
    list: () => Object.freeze([...descriptors]),
    rank: (request: NormalizedProviderCandidateRequest) =>
      Object.freeze(
        registry
          .rank(request)
          .filter((entry) => allowed.has(entry.adapter.descriptor.id)),
      ),
  });
}
