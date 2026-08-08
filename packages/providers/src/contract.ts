import { compileProviderCandidatePrompt } from "./prompt.js";
import { providerRequiredCapabilities } from "./registry.js";
import type {
  NormalizedProviderCandidateRequest,
  ProviderCapability,
} from "./types.js";
import {
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "./validation.js";

export interface ProviderCompiledCandidateContract {
  readonly schemaVersion: "1.0";
  readonly request: NormalizedProviderCandidateRequest;
  readonly requestSha256: string;
  readonly requiredAdapterCapabilities: readonly ProviderCapability[];
  readonly compiledPrompt: string;
  readonly compiledPromptSha256: string;
  readonly executionMode: "durable-worker-only";
}

export interface ProviderCandidateRuntimeJob {
  readonly queue: "provider";
  readonly kind: string;
  readonly idempotencyKey: string;
  readonly payload: NormalizedProviderCandidateRequest;
  readonly requiredCapabilities: readonly string[];
  readonly requiredCapabilityProfile: readonly ProviderCapability[];
  readonly maximumAttempts: 3;
  readonly leaseDurationMs: 300_000;
  readonly timeoutMs: 1_800_000;
  readonly labels: Readonly<{
    providerRequestId: string;
    candidateFamilyId: string;
    assetId: string;
    continuityPhase: string;
  }>;
}

export interface ProviderCompiledCandidateRuntimeContract
  extends Omit<ProviderCompiledCandidateContract, "executionMode"> {
  readonly runtimeJob: ProviderCandidateRuntimeJob;
  readonly executionMode: "submit-runtime-job";
}

function frozenCapabilities(
  request: NormalizedProviderCandidateRequest,
): readonly ProviderCapability[] {
  return Object.freeze([...providerRequiredCapabilities(request)]);
}

export function compileProviderCandidateContract(
  input: unknown,
): ProviderCompiledCandidateContract {
  const request = validateProviderCandidateRequest(input);
  const prompt = compileProviderCandidatePrompt(request);
  return Object.freeze({
    schemaVersion: "1.0",
    request,
    requestSha256: providerRequestSha256(request),
    requiredAdapterCapabilities: frozenCapabilities(request),
    compiledPrompt: prompt.text,
    compiledPromptSha256: prompt.sha256,
    executionMode: "durable-worker-only",
  });
}

export function compileProviderCandidateRuntimeContract(
  input: unknown,
): ProviderCompiledCandidateRuntimeContract {
  const compiled = compileProviderCandidateContract(input);
  const requiredCapabilities = Object.freeze([
    `provider.${compiled.request.operation}`,
    "provider.reference-lock",
    "provider.candidate-store",
    "evidence.bundle",
  ]);
  const labels = Object.freeze({
    providerRequestId: compiled.request.requestId,
    candidateFamilyId: compiled.request.candidateFamilyId,
    assetId: compiled.request.assetId,
    continuityPhase: compiled.request.continuityPhase,
  });
  const runtimeJob: ProviderCandidateRuntimeJob = Object.freeze({
    queue: "provider",
    kind: `art.candidate.${compiled.request.operation}`,
    idempotencyKey: `provider:${compiled.request.requestId}`,
    payload: compiled.request,
    requiredCapabilities,
    requiredCapabilityProfile: compiled.requiredAdapterCapabilities,
    maximumAttempts: 3,
    leaseDurationMs: 300_000,
    timeoutMs: 1_800_000,
    labels,
  });
  const { executionMode: _executionMode, ...base } = compiled;
  return Object.freeze({
    ...base,
    runtimeJob,
    executionMode: "submit-runtime-job",
  });
}
