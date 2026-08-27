import { normalizeJson, type JsonValue } from "@evavo/art-artifacts";
import {
  RasterPreflightError,
  preflightInpaintMask,
  preflightRasterOutput,
  type InpaintMaskPreflightEvidence,
  type RasterOutputMediaType,
  type RasterOutputPreflightEvidence,
  type RasterOutputValidationMode,
} from "@evavo/art-media";

import {
  OpenAIImageProviderAdapter as OpenAIImageTransportAdapter,
  openAIImageSourceSize,
  openAIImageSourceSizeForModel,
  type OpenAIImageProviderOptions as OpenAIImageTransportOptions,
} from "./openai-images.js";
import {
  ProviderError,
  type ProviderAdapterExecutionContext,
  type ProviderAdapterExecutionResult,
  type ProviderAdapterOutput,
  type ResolvedProviderCandidateRequest,
} from "../types.js";

export { openAIImageSourceSize };

export interface OpenAIImageProviderOptions extends OpenAIImageTransportOptions {
  /**
   * Strict mode rejects decoded output contract mismatches before artifact
   * storage. Evidence mode still decodes and records mismatches, which keeps
   * synthetic/custom transports usable for fixtures and diagnostics.
   * Native fetch defaults to strict; an injected fetch defaults to evidence.
   */
  readonly outputValidationMode?: RasterOutputValidationMode;
}

interface OpenAIOutputPreflightSummary {
  readonly schemaVersion: "1.0";
  readonly mode: RasterOutputValidationMode;
  readonly expectedCandidateCount: number;
  readonly receivedCandidateCount: number;
  readonly expectedMediaType: RasterOutputMediaType;
  readonly expectedWidth: number;
  readonly expectedHeight: number;
  readonly outputs: readonly RasterOutputPreflightEvidence[];
  readonly compatible: boolean;
}

function objectMetadata(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, JsonValue>) }
    : {};
}

function inpaintReferences(resolved: ResolvedProviderCandidateRequest): Readonly<{
  base: Uint8Array;
  mask: Uint8Array;
}> {
  const base = resolved.references.find((entry) => entry.role === "base-image");
  const mask = resolved.references.find((entry) => entry.role === "mask");
  if (!base || !mask) {
    throw new ProviderError(
      "OPENAI_INPAINT_REFERENCES_MISSING",
      "OpenAI inpainting requires one verified base image and one verified mask.",
      "permanent",
    );
  }
  return { base: base.bytes, mask: mask.bytes };
}

async function preflightInputs(
  resolved: ResolvedProviderCandidateRequest,
): Promise<InpaintMaskPreflightEvidence | undefined> {
  if (resolved.request.operation !== "inpaint") return undefined;
  const references = inpaintReferences(resolved);
  try {
    return await preflightInpaintMask(references.base, references.mask, {
      maximumInputBytes: 50 * 1024 * 1024,
      maximumPixels: 8_294_400,
    });
  } catch (error: unknown) {
    if (error instanceof RasterPreflightError) {
      throw new ProviderError(
        `OPENAI_${error.code}`,
        error.message,
        "permanent",
      );
    }
    throw error;
  }
}

function mediaTypeForFormat(
  format: ResolvedProviderCandidateRequest["request"]["target"]["outputFormat"],
): RasterOutputMediaType {
  if (format === "webp") return "image/webp";
  if (format === "jpeg") return "image/jpeg";
  return "image/png";
}

function sourceDimensions(
  resolved: ResolvedProviderCandidateRequest,
  model: string,
): Readonly<{ width: number; height: number }> {
  const value = openAIImageSourceSizeForModel(resolved.request, model);
  const match = /^(\d+)x(\d+)$/u.exec(value);
  if (!match) {
    throw new ProviderError(
      "OPENAI_IMAGE_SOURCE_SIZE_INVALID",
      "OpenAI image source size did not resolve to an exact width and height.",
      "permanent",
    );
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

async function preflightOutputs(
  resolved: ResolvedProviderCandidateRequest,
  result: ProviderAdapterExecutionResult,
  mode: RasterOutputValidationMode,
): Promise<Readonly<{
  outputs: readonly ProviderAdapterOutput[];
  summary: OpenAIOutputPreflightSummary;
}>> {
  const expectedCandidateCount = resolved.request.candidateCount;
  const receivedCandidateCount = result.outputs.length;
  if (receivedCandidateCount !== expectedCandidateCount) {
    throw new ProviderError(
      "OPENAI_IMAGE_OUTPUT_COUNT_MISMATCH",
      `OpenAI returned ${receivedCandidateCount} candidates, but ${expectedCandidateCount} were required.`,
      "transient",
    );
  }

  const expectedMediaType = mediaTypeForFormat(
    resolved.request.target.outputFormat,
  );
  const dimensions = sourceDimensions(resolved, result.model);
  const evidence: RasterOutputPreflightEvidence[] = [];
  const outputs: ProviderAdapterOutput[] = [];

  for (const [index, output] of result.outputs.entries()) {
    if (output.mediaType !== expectedMediaType) {
      throw new ProviderError(
        "OPENAI_IMAGE_OUTPUT_DECLARATION_MISMATCH",
        `OpenAI candidate ${index + 1} declared ${output.mediaType}, but ${expectedMediaType} was required.`,
        "transient",
      );
    }
    let candidateEvidence: RasterOutputPreflightEvidence;
    try {
      candidateEvidence = await preflightRasterOutput(output.bytes, {
        expectedMediaType,
        expectedWidth: dimensions.width,
        expectedHeight: dimensions.height,
        alphaPolicy:
          resolved.request.background.strategy === "native-alpha"
            ? "required"
            : "any",
        mode,
        maximumInputBytes: 50 * 1024 * 1024,
        maximumPixels: 8_294_400,
      });
    } catch (error: unknown) {
      if (error instanceof RasterPreflightError) {
        throw new ProviderError(
          `OPENAI_${error.code}`,
          `OpenAI candidate ${index + 1}: ${error.message}`,
          "transient",
        );
      }
      throw error;
    }
    evidence.push(candidateEvidence);
    outputs.push({
      ...output,
      metadata: {
        ...objectMetadata(output.metadata),
        rasterPreflight: normalizeJson(candidateEvidence),
      },
    });
  }

  return {
    outputs,
    summary: {
      schemaVersion: "1.0",
      mode,
      expectedCandidateCount,
      receivedCandidateCount,
      expectedMediaType,
      expectedWidth: dimensions.width,
      expectedHeight: dimensions.height,
      outputs: evidence,
      compatible: evidence.every((entry) => entry.compatible),
    },
  };
}

/**
 * Adds deterministic input and decoded output proof to the bounded OpenAI
 * transport adapter. Production-native fetches fail closed on output contract
 * mismatches before immutable candidate storage; injected fixture transports
 * retain complete mismatch evidence unless strict mode is requested.
 */
export class OpenAIImageProviderAdapter extends OpenAIImageTransportAdapter {
  readonly #outputValidationMode: RasterOutputValidationMode;

  public constructor(options: OpenAIImageProviderOptions) {
    super(options);
    this.#outputValidationMode =
      options.outputValidationMode ?? (options.fetch ? "evidence" : "strict");
  }

  public override async execute(
    resolved: ResolvedProviderCandidateRequest,
    context: ProviderAdapterExecutionContext,
  ): Promise<ProviderAdapterExecutionResult> {
    const inputPreflight = await preflightInputs(resolved);
    const result = await super.execute(resolved, context);
    const outputPreflight = await preflightOutputs(
      resolved,
      result,
      this.#outputValidationMode,
    );
    return {
      ...result,
      outputs: outputPreflight.outputs,
      metadata: {
        ...objectMetadata(result.metadata),
        ...(inputPreflight
          ? { inpaintMaskPreflight: normalizeJson(inputPreflight) }
          : {}),
        outputPreflight: normalizeJson(outputPreflight.summary),
      },
    };
  }
}
