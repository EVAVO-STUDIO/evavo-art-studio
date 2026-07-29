import type { JsonValue } from "@evavo/art-artifacts";
import {
  FixtureImageProviderAdapter,
  OpenAIImageProviderAdapter,
  ProviderError,
  ProviderRegistry,
  executeProviderCandidateRequest,
  validateProviderCandidateRequest,
  type NormalizedProviderCandidateRequest,
} from "@evavo/art-providers";
import {
  CancelledRuntimeError,
  PermanentRuntimeError,
  TransientRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

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

function createHandler(
  registry: ProviderRegistry,
  kind: (typeof OPERATION_KIND)[keyof typeof OPERATION_KIND],
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
  registry: ProviderRegistry,
): Readonly<Record<string, RuntimeJobHandler>> {
  return Object.freeze({
    "art.candidate.generate": createHandler(registry, "art.candidate.generate"),
    "art.candidate.edit": createHandler(registry, "art.candidate.edit"),
    "art.candidate.inpaint": createHandler(registry, "art.candidate.inpaint"),
  });
}

export function providerWorkerCapabilities(
  registry: ProviderRegistry,
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
