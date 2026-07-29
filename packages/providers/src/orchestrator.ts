import {
  normalizeJson,
  type ArtifactId,
  type ArtifactStore,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";

import { compileProviderCandidatePrompt } from "./prompt.js";
import {
  PROVIDER_PROTOCOL_VERSION,
  ProviderError,
  type ExecuteProviderCandidateOptions,
  type NormalizedProviderCandidateRequest,
  type ProviderAdapter,
  type ProviderAdapterExecutionResult,
  type ProviderAttemptEvidence,
  type ProviderCandidateRunResult,
  type ProviderErrorClassification,
  type ResolvedProviderCandidateRequest,
  type ResolvedProviderReference,
} from "./types.js";
import {
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "./validation.js";

const DEFAULT_MAXIMUM_REFERENCE_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAXIMUM_TOTAL_REFERENCE_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAXIMUM_OUTPUT_BYTES = 64 * 1024 * 1024;
const IMAGE_MEDIA_TYPES = new Set([
  "image/png",
  "image/webp",
  "image/jpeg",
]);

function nowIso(now: () => Date): string {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    throw new ProviderError(
      "PROVIDER_CLOCK_INVALID",
      "Provider orchestration clock returned an invalid date.",
      "permanent",
    );
  }
  return value.toISOString();
}

function positiveLimit(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1 || result > 1024 * 1024 * 1024) {
    throw new ProviderError(
      "PROVIDER_LIMIT_INVALID",
      `${name} must be an integer between 1 and 1073741824.`,
      "permanent",
    );
  }
  return result;
}

function safeFilePart(value: string): string {
  const normalized = value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return normalized || "candidate";
}

function extension(mediaType: string): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/jpeg") return "jpg";
  return "bin";
}

function errorFor(error: unknown, signal: AbortSignal): ProviderError {
  if (signal.aborted) {
    return new ProviderError(
      "PROVIDER_EXECUTION_CANCELLED",
      "Provider candidate execution was cancelled.",
      "cancelled",
    );
  }
  if (error instanceof ProviderError) return error;
  return new ProviderError(
    "PROVIDER_ADAPTER_UNEXPECTED_ERROR",
    error instanceof Error ? error.message : String(error),
    "permanent",
  );
}

function attemptData(
  error: ProviderError,
  adapterId: string,
  startedAt: string,
  completedAt: string,
): ProviderAttemptEvidence {
  return {
    adapterId,
    startedAt,
    completedAt,
    outcome: error.classification === "cancelled" ? "cancelled" : "failed",
    classification: error.classification,
    code: error.code,
    message: error.message,
  };
}

function canFallback(classification: ProviderErrorClassification): boolean {
  return classification === "transient" || classification === "incompatible";
}

async function resolveReferences(
  request: NormalizedProviderCandidateRequest,
  artifacts: ArtifactStore,
  maximumReferenceBytes: number,
  maximumTotalReferenceBytes: number,
): Promise<readonly ResolvedProviderReference[]> {
  const resolved: ResolvedProviderReference[] = [];
  let total = 0;
  for (const reference of request.references) {
    const artifact = await artifacts.get(reference.artifactId);
    if (!artifact) {
      if (!reference.required) continue;
      throw new ProviderError(
        "PROVIDER_REFERENCE_NOT_FOUND",
        `Required ${reference.role} artifact was not found: ${reference.artifactId}`,
        "permanent",
      );
    }
    if (!artifact.mediaType.startsWith("image/")) {
      throw new ProviderError(
        "PROVIDER_REFERENCE_MEDIA_TYPE_INVALID",
        `${reference.role} must resolve to an image artifact.`,
        "permanent",
      );
    }
    if (artifact.sizeBytes > maximumReferenceBytes) {
      throw new ProviderError(
        "PROVIDER_REFERENCE_TOO_LARGE",
        `${reference.role} exceeds the ${maximumReferenceBytes} byte reference limit.`,
        "permanent",
      );
    }
    total += artifact.sizeBytes;
    if (total > maximumTotalReferenceBytes) {
      throw new ProviderError(
        "PROVIDER_REFERENCE_TOTAL_TOO_LARGE",
        `Provider references exceed ${maximumTotalReferenceBytes} total bytes.`,
        "permanent",
      );
    }
    const verification = await artifacts.verify(reference.artifactId);
    if (!verification.descriptorValid || !verification.contentValid) {
      throw new ProviderError(
        "PROVIDER_REFERENCE_VERIFICATION_FAILED",
        `${reference.role} failed immutable artifact verification.`,
        "permanent",
      );
    }
    resolved.push({
      ...reference,
      artifact,
      bytes: await artifacts.read(reference.artifactId),
    });
  }
  return resolved;
}

function validateAdapterResult(
  adapter: ProviderAdapter,
  request: NormalizedProviderCandidateRequest,
  result: ProviderAdapterExecutionResult,
  maximumOutputBytes: number,
): void {
  if (result.adapterId !== adapter.descriptor.id) {
    throw new ProviderError(
      "PROVIDER_ADAPTER_RESULT_INVALID",
      `Adapter ${adapter.descriptor.id} returned a mismatched adapter id.`,
      "permanent",
    );
  }
  if (!adapter.descriptor.models.includes(result.model)) {
    throw new ProviderError(
      "PROVIDER_ADAPTER_RESULT_INVALID",
      `Adapter ${adapter.descriptor.id} returned undeclared model ${result.model}.`,
      "permanent",
    );
  }
  if (result.outputs.length !== request.candidateCount) {
    throw new ProviderError(
      "PROVIDER_OUTPUT_COUNT_MISMATCH",
      `Adapter ${adapter.descriptor.id} returned ${result.outputs.length} candidates; ${request.candidateCount} were required.`,
      "transient",
    );
  }
  for (const [index, output] of result.outputs.entries()) {
    if (!IMAGE_MEDIA_TYPES.has(output.mediaType)) {
      throw new ProviderError(
        "PROVIDER_OUTPUT_MEDIA_TYPE_INVALID",
        `Candidate ${index + 1} returned unsupported media type ${output.mediaType}.`,
        "permanent",
      );
    }
    if (!output.bytes.byteLength || output.bytes.byteLength > maximumOutputBytes) {
      throw new ProviderError(
        "PROVIDER_OUTPUT_SIZE_INVALID",
        `Candidate ${index + 1} must contain 1 to ${maximumOutputBytes} bytes.`,
        "permanent",
      );
    }
  }
}

function safeJson(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  try {
    return normalizeJson(value);
  } catch {
    return { omitted: "non-json provider metadata" };
  }
}

async function storeCandidateArtifacts(
  request: NormalizedProviderCandidateRequest,
  resolved: ResolvedProviderCandidateRequest,
  adapter: ProviderAdapter,
  result: ProviderAdapterExecutionResult,
  artifacts: ArtifactStore,
): Promise<readonly ArtifactId[]> {
  const sourceArtifacts = resolved.references.map((entry) => entry.artifactId);
  const candidateArtifacts: ArtifactId[] = [];
  for (const [index, output] of result.outputs.entries()) {
    const candidateNumber = index + 1;
    const fileName = `${safeFilePart(request.candidateFamilyId)}-${String(candidateNumber).padStart(2, "0")}.${extension(output.mediaType)}`;
    const stored = await artifacts.put(output.bytes, {
      mediaType: output.mediaType,
      storageClass: "intermediate",
      fileName,
      sourceArtifacts,
      labels: {
        artifactRole: "provider-candidate",
        approvalState: "unapproved",
        providerAdapter: adapter.descriptor.id,
        providerModel: result.model,
        providerRequestId: request.requestId,
        candidateFamilyId: request.candidateFamilyId,
        candidateIndex: String(candidateNumber),
        assetId: request.assetId,
        continuityPhase: request.continuityPhase,
        ...(request.frameId ? { frameId: request.frameId } : {}),
        ...(request.layerId ? { layerId: request.layerId } : {}),
      },
      metadata: {
        schemaVersion: "1.0",
        protocolVersion: PROVIDER_PROTOCOL_VERSION,
        finalDeliverable: false,
        requiresMastering: true,
        requiresBlockingQa: true,
        requestSha256: resolved.requestSha256,
        compiledPromptSha256: resolved.compiledPromptSha256,
        adapterVersion: adapter.descriptor.version,
        backgroundStrategy: request.background.strategy,
        transparencyTarget: request.target.transparency,
        ...(request.seed === undefined ? {} : { seed: request.seed }),
        ...(result.externalId === undefined
          ? {}
          : { providerExternalId: result.externalId }),
        ...(output.revisedPrompt === undefined
          ? {}
          : { revisedPrompt: output.revisedPrompt }),
        ...(safeJson(output.metadata) === undefined
          ? {}
          : { providerOutputMetadata: safeJson(output.metadata)! }),
      },
    });
    candidateArtifacts.push(stored.artifactId);
  }
  return candidateArtifacts;
}

async function storeEvidence(
  request: NormalizedProviderCandidateRequest,
  resolved: ResolvedProviderCandidateRequest,
  attempts: readonly ProviderAttemptEvidence[],
  artifacts: ArtifactStore,
  input: Readonly<{
    adapter?: ProviderAdapter;
    result?: ProviderAdapterExecutionResult;
    candidateArtifacts?: readonly ArtifactId[];
    failure?: ProviderError;
    completedAt: string;
  }>,
): Promise<StoredArtifact> {
  const candidateArtifacts = input.candidateArtifacts ?? [];
  const sourceArtifacts = [
    ...new Set([
      ...resolved.references.map((entry) => entry.artifactId),
      ...candidateArtifacts,
    ]),
  ] as readonly ArtifactId[];
  const evidence = {
    schemaVersion: "1.0",
    protocolVersion: PROVIDER_PROTOCOL_VERSION,
    requestId: request.requestId,
    requestSha256: resolved.requestSha256,
    compiledPromptSha256: resolved.compiledPromptSha256,
    compiledPrompt: resolved.compiledPrompt,
    request,
    resolvedReferences: resolved.references.map((entry) => ({
      artifactId: entry.artifactId,
      contentHash: entry.artifact.contentHash,
      mediaType: entry.artifact.mediaType,
      sizeBytes: entry.artifact.sizeBytes,
      role: entry.role,
      strength: entry.strength,
      required: entry.required,
    })),
    selection: input.adapter
      ? {
          adapter: input.adapter.descriptor,
          model: input.result?.model,
          externalId: input.result?.externalId,
        }
      : null,
    attempts,
    candidateArtifacts,
    requiresAlphaExtraction:
      request.target.transparency !== "opaque" &&
      request.background.strategy !== "native-alpha",
    outcome: input.failure ? "failed" : "candidate-produced",
    completedAt: input.completedAt,
    ...(input.failure
      ? {
          failure: {
            classification: input.failure.classification,
            code: input.failure.code,
            message: input.failure.message,
            ...(input.failure.status === undefined
              ? {}
              : { status: input.failure.status }),
            ...(input.failure.details === undefined
              ? {}
              : { details: input.failure.details }),
          },
        }
      : {}),
    ...(safeJson(input.result?.usage) === undefined
      ? {}
      : { providerUsage: safeJson(input.result?.usage)! }),
    ...(safeJson(input.result?.metadata) === undefined
      ? {}
      : { providerMetadata: safeJson(input.result?.metadata)! }),
  };
  return artifacts.put(`${JSON.stringify(evidence, null, 2)}\n`, {
    mediaType: "application/json",
    storageClass: "evidence",
    fileName: `${safeFilePart(request.requestId)}.provider-evidence.json`,
    sourceArtifacts,
    labels: {
      artifactRole: "provider-candidate-evidence",
      providerRequestId: request.requestId,
      candidateFamilyId: request.candidateFamilyId,
      assetId: request.assetId,
      outcome: input.failure ? "failed" : "candidate-produced",
    },
    metadata: {
      requestSha256: resolved.requestSha256,
      compiledPromptSha256: resolved.compiledPromptSha256,
      attemptCount: attempts.length,
      candidateCount: candidateArtifacts.length,
    },
  });
}

export async function executeProviderCandidateRequest(
  input: unknown,
  options: ExecuteProviderCandidateOptions,
): Promise<ProviderCandidateRunResult> {
  if (options.signal.aborted) {
    throw new ProviderError(
      "PROVIDER_EXECUTION_CANCELLED",
      "Provider candidate execution was cancelled before it began.",
      "cancelled",
    );
  }
  const now = options.now ?? (() => new Date());
  const maximumReferenceBytes = positiveLimit(
    options.maximumReferenceBytes,
    DEFAULT_MAXIMUM_REFERENCE_BYTES,
    "maximumReferenceBytes",
  );
  const maximumTotalReferenceBytes = positiveLimit(
    options.maximumTotalReferenceBytes,
    DEFAULT_MAXIMUM_TOTAL_REFERENCE_BYTES,
    "maximumTotalReferenceBytes",
  );
  const maximumOutputBytes = positiveLimit(
    options.maximumOutputBytes,
    DEFAULT_MAXIMUM_OUTPUT_BYTES,
    "maximumOutputBytes",
  );
  if (maximumTotalReferenceBytes < maximumReferenceBytes) {
    throw new ProviderError(
      "PROVIDER_LIMIT_INVALID",
      "maximumTotalReferenceBytes must be at least maximumReferenceBytes.",
      "permanent",
    );
  }

  const request = validateProviderCandidateRequest(input);
  const compiled = compileProviderCandidatePrompt(request);
  const references = await resolveReferences(
    request,
    options.artifacts,
    maximumReferenceBytes,
    maximumTotalReferenceBytes,
  );
  const resolved: ResolvedProviderCandidateRequest = {
    request,
    requestSha256: providerRequestSha256(request),
    compiledPrompt: compiled.text,
    compiledPromptSha256: compiled.sha256,
    references,
  };
  const ranked = options.registry.rank(request);
  const eligible = ranked.filter((entry) => entry.decision.eligible);
  if (!eligible.length) {
    const details = normalizeJson({
      decisions: ranked.map((entry) => entry.decision),
    });
    throw new ProviderError(
      "PROVIDER_ADAPTER_UNAVAILABLE",
      "No registered provider adapter satisfies the candidate contract.",
      "incompatible",
      { details },
    );
  }

  const attempts: ProviderAttemptEvidence[] = [];
  let lastError: ProviderError | undefined;
  for (const [adapterIndex, entry] of eligible.entries()) {
    const adapter = entry.adapter;
    const oversized = references.find(
      (reference) => reference.bytes.byteLength > adapter.descriptor.maximumSourceBytes,
    );
    if (oversized) {
      const error = new ProviderError(
        "PROVIDER_ADAPTER_REFERENCE_TOO_LARGE",
        `${adapter.descriptor.id} cannot accept ${oversized.role} at ${oversized.bytes.byteLength} bytes.`,
        "incompatible",
      );
      const at = nowIso(now);
      attempts.push(attemptData(error, adapter.descriptor.id, at, at));
      lastError = error;
      if (!request.selection.allowFallback) break;
      continue;
    }

    const startedAt = nowIso(now);
    try {
      const result = await adapter.execute(resolved, {
        signal: options.signal,
        requestedAt: new Date(startedAt),
      });
      validateAdapterResult(adapter, request, result, maximumOutputBytes);
      const completedAt = nowIso(now);
      attempts.push({
        adapterId: adapter.descriptor.id,
        model: result.model,
        startedAt,
        completedAt,
        outcome: "succeeded",
        ...(result.externalId === undefined
          ? {}
          : { externalId: result.externalId }),
      });
      const candidateArtifacts = await storeCandidateArtifacts(
        request,
        resolved,
        adapter,
        result,
        options.artifacts,
      );
      const evidence = await storeEvidence(
        request,
        resolved,
        attempts,
        options.artifacts,
        {
          adapter,
          result,
          candidateArtifacts,
          completedAt,
        },
      );
      return {
        schemaVersion: "1.0",
        protocolVersion: PROVIDER_PROTOCOL_VERSION,
        requestId: request.requestId,
        requestSha256: resolved.requestSha256,
        compiledPromptSha256: resolved.compiledPromptSha256,
        adapterId: adapter.descriptor.id,
        model: result.model,
        candidateArtifacts,
        evidenceArtifact: evidence.artifactId,
        attempts,
        requiresAlphaExtraction:
          request.target.transparency !== "opaque" &&
          request.background.strategy !== "native-alpha",
      };
    } catch (error: unknown) {
      const providerError = errorFor(error, options.signal);
      const completedAt = nowIso(now);
      attempts.push(
        attemptData(providerError, adapter.descriptor.id, startedAt, completedAt),
      );
      lastError = providerError;
      const hasAnotherAdapter = adapterIndex < eligible.length - 1;
      if (
        !request.selection.allowFallback ||
        !hasAnotherAdapter ||
        !canFallback(providerError.classification)
      ) {
        break;
      }
    }
  }

  const failure =
    lastError ??
    new ProviderError(
      "PROVIDER_EXECUTION_FAILED",
      "Provider candidate execution failed without an adapter result.",
      "permanent",
    );
  const completedAt = nowIso(now);
  const evidence = await storeEvidence(
    request,
    resolved,
    attempts,
    options.artifacts,
    { failure, completedAt },
  );
  throw new ProviderError(
    failure.code,
    failure.message,
    failure.classification,
    {
      ...(failure.status === undefined ? {} : { status: failure.status }),
      details: normalizeJson({
        evidenceArtifactId: evidence.artifactId,
        attempts,
      }),
    },
  );
}
