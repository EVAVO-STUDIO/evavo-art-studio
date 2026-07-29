import { normalizeJson, type JsonValue } from "@evavo/art-artifacts";
import {
  RasterPreflightError,
  preflightInpaintMask,
  type InpaintMaskPreflightEvidence,
} from "@evavo/art-media";

import {
  OpenAIImageProviderAdapter as OpenAIImageTransportAdapter,
  openAIImageSourceSize,
  type OpenAIImageProviderOptions,
} from "./openai-images.js";
import {
  ProviderError,
  type ProviderAdapterExecutionContext,
  type ProviderAdapterExecutionResult,
  type ResolvedProviderCandidateRequest,
} from "../types.js";

export { openAIImageSourceSize };
export type { OpenAIImageProviderOptions };

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

async function preflight(
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

/**
 * Adds deterministic input proof to the bounded OpenAI transport adapter.
 * The transport still owns HTTP construction and response limits; this layer
 * prevents invalid inpaint masks from reaching a remote provider.
 */
export class OpenAIImageProviderAdapter extends OpenAIImageTransportAdapter {
  public override async execute(
    resolved: ResolvedProviderCandidateRequest,
    context: ProviderAdapterExecutionContext,
  ): Promise<ProviderAdapterExecutionResult> {
    const maskPreflight = await preflight(resolved);
    const result = await super.execute(resolved, context);
    if (!maskPreflight) return result;
    return {
      ...result,
      metadata: {
        ...objectMetadata(result.metadata),
        inpaintMaskPreflight: normalizeJson(maskPreflight),
      },
    };
  }
}
