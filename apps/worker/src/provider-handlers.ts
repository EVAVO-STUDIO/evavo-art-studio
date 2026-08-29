import type { JsonValue } from "@evavo/art-artifacts";
import {
  FixtureImageProviderAdapter,
  OpenAIImageProviderAdapter,
  loadComfyUIProviderAdaptersFromCatalogFile,
  ProviderError,
  ProviderRegistry,
  executeProviderCandidateRequest,
  providerRequiredCapabilities,
  validateProviderCandidateRequest,
  type NormalizedProviderCandidateRequest,
  type ProviderAdapter,
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
export const COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY =
  "council-avatar.execution-authorized" as const;
const RAW_ART_PROVIDER_REQUEST_METADATA_SCHEMA =
  "evavo.raw-art-provider-request-metadata.v2";
const COUNCIL_AVATAR_PROVIDER_REQUEST_METADATA_SCHEMA =
  "evavo.project-art-council-avatar-provider-request.v1";

export interface ProviderExecutionAuthorizer {
  readonly authorizationSha256: string;
  readonly allowedAdapterIds: readonly string[];
  readonly queues: readonly string[];
  readonly requiredCapability: string;
  adapterAllowed(adapterId: string): boolean;
  assertJobAuthorized(
    job: RuntimeJobRecord,
    request: NormalizedProviderCandidateRequest,
    now?: Date,
  ): unknown;
}

export interface RawArtProviderExecutionAuthorizer
  extends ProviderExecutionAuthorizer {
  readonly requiredCapability: typeof RAW_ART_PROVIDER_EXECUTION_CAPABILITY;
}

export interface CouncilAvatarProviderExecutionAuthorizer
  extends ProviderExecutionAuthorizer {
  readonly requiredCapability: typeof COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY;
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

function envBoolean(
  value: string | undefined,
  fallback: boolean,
  name: string,
): boolean {
  if (value === undefined || !value.trim()) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be exactly true or false.`);
}

export function createProviderRegistryFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProviderRegistry {
  const adapters: ProviderAdapter[] = [];
  if (environment.EVAVO_ART_ENABLE_FIXTURE_PROVIDER === "true") {
    adapters.push(new FixtureImageProviderAdapter());
  }
  const comfyCatalogPath = environment.EVAVO_ART_COMFYUI_CATALOG?.trim();
  if (comfyCatalogPath) {
    const dedicatedInstance = envBoolean(
      environment.EVAVO_ART_COMFYUI_DEDICATED_INSTANCE,
      false,
      "EVAVO_ART_COMFYUI_DEDICATED_INSTANCE",
    );
    if (!dedicatedInstance) {
      throw new Error(
        "EVAVO_ART_COMFYUI_DEDICATED_INSTANCE=true is required because ComfyUI cancellation uses the instance-wide interrupt endpoint.",
      );
    }
    adapters.push(
      ...loadComfyUIProviderAdaptersFromCatalogFile({
        catalogPath: comfyCatalogPath,
        ...(environment.EVAVO_ART_COMFYUI_CATALOG_ROOT?.trim()
          ? { allowedRoot: environment.EVAVO_ART_COMFYUI_CATALOG_ROOT.trim() }
          : {}),
        dedicatedInstance,
        allowRemote: envBoolean(
          environment.EVAVO_ART_COMFYUI_ALLOW_REMOTE,
          false,
          "EVAVO_ART_COMFYUI_ALLOW_REMOTE",
        ),
        ...(environment.EVAVO_ART_COMFYUI_BASE_URL?.trim()
          ? { baseUrl: environment.EVAVO_ART_COMFYUI_BASE_URL.trim() }
          : {}),
        ...(environment.EVAVO_ART_COMFYUI_API_TOKEN?.trim()
          ? { apiToken: environment.EVAVO_ART_COMFYUI_API_TOKEN.trim() }
          : {}),
        pollIntervalMs: envInteger(
          environment.EVAVO_ART_COMFYUI_POLL_INTERVAL_MS,
          500,
          50,
          60_000,
          "EVAVO_ART_COMFYUI_POLL_INTERVAL_MS",
        ),
        executionTimeoutMs: envInteger(
          environment.EVAVO_ART_COMFYUI_EXECUTION_TIMEOUT_MS,
          1_800_000,
          1_000,
          1_800_000,
          "EVAVO_ART_COMFYUI_EXECUTION_TIMEOUT_MS",
        ),
        maximumJsonBytes: envInteger(
          environment.EVAVO_ART_COMFYUI_MAX_JSON_BYTES,
          4 * 1024 * 1024,
          1_024,
          64 * 1024 * 1024,
          "EVAVO_ART_COMFYUI_MAX_JSON_BYTES",
        ),
        maximumOutputBytes: envInteger(
          environment.EVAVO_ART_COMFYUI_MAX_OUTPUT_BYTES,
          128 * 1024 * 1024,
          1_024,
          512 * 1024 * 1024,
          "EVAVO_ART_COMFYUI_MAX_OUTPUT_BYTES",
        ),
        maximumUploadBytes: envInteger(
          environment.EVAVO_ART_COMFYUI_MAX_UPLOAD_BYTES,
          64 * 1024 * 1024,
          1_024,
          512 * 1024 * 1024,
          "EVAVO_ART_COMFYUI_MAX_UPLOAD_BYTES",
        ),
      }),
    );
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

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

type GovernedExecutionContract = Readonly<{
  capability: string;
  mismatchCode: string;
  unauthorizedCode: string;
  label: string;
}>;

function governedExecutionContract(
  job: RuntimeJobRecord,
  request: NormalizedProviderCandidateRequest,
): GovernedExecutionContract | undefined {
  const metadata = request.metadata;
  const rawMetadata =
    isJsonObject(metadata) &&
    metadata.schema === RAW_ART_PROVIDER_REQUEST_METADATA_SCHEMA;
  const councilMetadata =
    isJsonObject(metadata) &&
    metadata.schema === COUNCIL_AVATAR_PROVIDER_REQUEST_METADATA_SCHEMA;
  const rawCapability = job.spec.requiredCapabilities.includes(
    RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
  );
  const councilCapability = job.spec.requiredCapabilities.includes(
    COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
  );

  if (!rawMetadata && !councilMetadata && !rawCapability && !councilCapability) {
    return undefined;
  }
  if (rawMetadata || rawCapability) {
    if (!rawMetadata || !rawCapability || councilMetadata || councilCapability) {
      throw new PermanentRuntimeError(
        "RAW_ART_PROVIDER_EXECUTION_CONTRACT_MISMATCH",
        "RAW_ART provider execution metadata and runtime capability must be declared together and may not mix governance domains.",
      );
    }
    return Object.freeze({
      capability: RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
      mismatchCode: "RAW_ART_PROVIDER_EXECUTION_CONTRACT_MISMATCH",
      unauthorizedCode: "RAW_ART_PROVIDER_EXECUTION_UNAUTHORIZED",
      label: "RAW_ART",
    });
  }
  if (!councilMetadata || !councilCapability) {
    throw new PermanentRuntimeError(
      "COUNCIL_AVATAR_PROVIDER_EXECUTION_CONTRACT_MISMATCH",
      "Council avatar provider execution metadata and runtime capability must be declared together.",
    );
  }
  return Object.freeze({
    capability: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    mismatchCode: "COUNCIL_AVATAR_PROVIDER_EXECUTION_CONTRACT_MISMATCH",
    unauthorizedCode: "COUNCIL_AVATAR_PROVIDER_EXECUTION_UNAUTHORIZED",
    label: "Council avatar",
  });
}

function requireProviderExecutionAuthorization(
  job: RuntimeJobRecord,
  request: NormalizedProviderCandidateRequest,
  authorization: ProviderExecutionAuthorizer | undefined,
): void {
  const governance = governedExecutionContract(job, request);
  if (!governance) return;
  if (!authorization || authorization.requiredCapability !== governance.capability) {
    throw new PermanentRuntimeError(
      governance.unauthorizedCode,
      `${governance.label} provider jobs require an exact active execution authorization before any provider call.`,
    );
  }
  try {
    authorization.assertJobAuthorized(job, request, new Date());
  } catch (error: unknown) {
    throw new PermanentRuntimeError(
      governance.unauthorizedCode,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function createHandler(
  registry: ProviderRegistryLike,
  kind: (typeof OPERATION_KIND)[keyof typeof OPERATION_KIND],
  authorization?: ProviderExecutionAuthorizer,
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
    requireProviderExecutionAuthorization(
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
  authorization?: ProviderExecutionAuthorizer,
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
      `Provider execution authorization names unavailable adapters: ${missing.join(", ")}`,
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
