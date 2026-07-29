import {
  PROVIDER_PROTOCOL_VERSION,
  ProviderError,
  type ProviderAdapter,
  type ProviderAdapterExecutionContext,
  type ProviderAdapterExecutionResult,
  type ProviderAdapterOutput,
  type ProviderAdapterDescriptor,
  type ProviderCapability,
  type ResolvedProviderCandidateRequest,
} from "../types.js";

const TRANSPARENT_FIXTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==",
  "base64",
);

const FIXTURE_CAPABILITIES = Object.freeze([
  "generate",
  "edit",
  "inpaint",
  "reference-images",
  "multiple-reference-images",
  "mask",
  "seed",
  "native-alpha",
  "custom-size",
  "candidate-count",
  "cancellation",
] as const satisfies readonly ProviderCapability[]);

export const FIXTURE_PROVIDER_DESCRIPTOR: ProviderAdapterDescriptor = Object.freeze({
  protocolVersion: PROVIDER_PROTOCOL_VERSION,
  id: "fixture-image",
  label: "Deterministic fixture image",
  version: "1.0.0",
  priority: -10_000,
  capabilities: FIXTURE_CAPABILITIES,
  models: Object.freeze(["fixture-transparent-v1"]),
  maximumCandidates: 8,
  maximumReferenceImages: 16,
  maximumSourceBytes: 32 * 1024 * 1024,
  dataPolicy: Object.freeze({
    remote: false,
    retainedByProvider: false,
    usedForTraining: false,
  }),
});

export class FixtureImageProviderAdapter implements ProviderAdapter {
  public readonly descriptor = FIXTURE_PROVIDER_DESCRIPTOR;

  public async execute(
    resolved: ResolvedProviderCandidateRequest,
    context: ProviderAdapterExecutionContext,
  ): Promise<ProviderAdapterExecutionResult> {
    if (context.signal.aborted) {
      throw new ProviderError(
        "PROVIDER_EXECUTION_CANCELLED",
        "Fixture provider execution was cancelled.",
        "cancelled",
      );
    }
    const outputs: ProviderAdapterOutput[] = Array.from(
      { length: resolved.request.candidateCount },
      (_, index) => ({
        bytes: TRANSPARENT_FIXTURE,
        mediaType: "image/png" as const,
        fileName: `${resolved.request.candidateFamilyId}-${String(index + 1).padStart(2, "0")}.png`,
        revisedPrompt: resolved.compiledPrompt,
        metadata: {
          fixture: true,
          candidateIndex: index + 1,
          targetWidth: resolved.request.target.width,
          targetHeight: resolved.request.target.height,
          referenceCount: resolved.references.length,
        },
      }),
    );
    return {
      adapterId: this.descriptor.id,
      model: this.descriptor.models[0]!,
      externalId: `fixture:${resolved.request.requestId}`,
      outputs,
      usage: { fixtureCandidates: outputs.length },
      metadata: {
        deterministic: true,
        requestedAt: context.requestedAt.toISOString(),
      },
    };
  }
}
