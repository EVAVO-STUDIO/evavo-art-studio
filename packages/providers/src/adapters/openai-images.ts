import { normalizeJson } from "@evavo/art-artifacts";

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
  type ResolvedProviderReference,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_MODELS = Object.freeze([
  "gpt-image-2",
  "gpt-image-2-2026-04-21",
]);
const DEFAULT_MAXIMUM_RESPONSE_BYTES = 128 * 1024 * 1024;
const MINIMUM_PIXELS = 655_360;
const MAXIMUM_PIXELS = 8_294_400;
const MAXIMUM_EDGE = 3_840;

const OPENAI_IMAGE_CAPABILITIES = Object.freeze([
  "generate",
  "edit",
  "inpaint",
  "reference-images",
  "multiple-reference-images",
  "identity-reference",
  "direction-reference",
  "temporal-reference",
  "palette-reference",
  "line-reference",
  "material-reference",
  "layer-context-reference",
  "mask",
  "custom-size",
  "candidate-count",
  "cancellation",
] as const satisfies readonly ProviderCapability[]);

const REFERENCE_ROLE_ORDER = Object.freeze([
  "base-image",
  "canonical-identity",
  "direction-master",
  "previous-key-pose",
  "next-key-pose",
  "pose-control",
  "edge-control",
  "depth-control",
  "palette-reference",
  "line-reference",
  "material-reference",
  "layer-context",
] as const);

export interface OpenAIImageProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly allowedModels?: readonly string[];
  readonly organization?: string;
  readonly project?: string;
  readonly fetch?: typeof fetch;
  readonly maximumResponseBytes?: number;
  readonly priority?: number;
}

interface OpenAIImageResponse {
  readonly created?: number;
  readonly data?: readonly Readonly<{
    b64_json?: string;
    revised_prompt?: string;
  }>[];
  readonly usage?: unknown;
}

function safeBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError(
      "OPENAI_IMAGE_CONFIGURATION_INVALID",
      "OpenAI image base URL is invalid.",
      "permanent",
    );
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new ProviderError(
      "OPENAI_IMAGE_CONFIGURATION_INVALID",
      "OpenAI image base URL must use HTTP or HTTPS.",
      "permanent",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderError(
      "OPENAI_IMAGE_CONFIGURATION_INVALID",
      "OpenAI image base URL may not contain credentials, query parameters or fragments.",
      "permanent",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function safeModels(
  preferred: string | undefined,
  values: readonly string[] | undefined,
): readonly string[] {
  const result = [
    ...new Set([
      preferred?.trim() || DEFAULT_MODEL,
      ...(values ?? DEFAULT_MODELS).map((entry) => entry.trim()).filter(Boolean),
    ]),
  ];
  if (
    !result.length ||
    result.some((entry) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(entry))
  ) {
    throw new ProviderError(
      "OPENAI_IMAGE_CONFIGURATION_INVALID",
      "OpenAI image model allow-list contains an invalid model id.",
      "permanent",
    );
  }
  return result;
}

function boundedBytes(value: number | undefined): number {
  const result = value ?? DEFAULT_MAXIMUM_RESPONSE_BYTES;
  if (!Number.isInteger(result) || result < 1_024 || result > 512 * 1024 * 1024) {
    throw new ProviderError(
      "OPENAI_IMAGE_CONFIGURATION_INVALID",
      "OpenAI maximum response bytes must be between 1024 and 536870912.",
      "permanent",
    );
  }
  return result;
}

function round16(value: number): number {
  return Math.max(16, Math.round(value / 16) * 16);
}

function validSize(width: number, height: number): boolean {
  const pixels = width * height;
  const ratio = Math.max(width, height) / Math.min(width, height);
  return (
    width <= MAXIMUM_EDGE &&
    height <= MAXIMUM_EDGE &&
    width % 16 === 0 &&
    height % 16 === 0 &&
    ratio <= 3 &&
    pixels >= MINIMUM_PIXELS &&
    pixels <= MAXIMUM_PIXELS
  );
}

export function openAIImageSourceSize(
  request: ResolvedProviderCandidateRequest["request"],
): string {
  if (request.sourceCanvas) {
    if (!validSize(request.sourceCanvas.width, request.sourceCanvas.height)) {
      throw new ProviderError(
        "OPENAI_IMAGE_SIZE_INCOMPATIBLE",
        "GPT Image 2 source size must use multiples of 16, stay within 3840 pixels per edge and a 3:1 ratio, and contain 655360 to 8294400 pixels.",
        "incompatible",
      );
    }
    return `${request.sourceCanvas.width}x${request.sourceCanvas.height}`;
  }

  const ratio = request.target.width / request.target.height;
  if (!Number.isFinite(ratio) || ratio < 1 / 3 || ratio > 3) {
    throw new ProviderError(
      "OPENAI_IMAGE_ASPECT_INCOMPATIBLE",
      "GPT Image 2 cannot preserve a target aspect ratio beyond 3:1.",
      "incompatible",
    );
  }

  const targetArea = 1_048_576;
  let width = round16(Math.sqrt(targetArea * ratio));
  let height = round16(Math.sqrt(targetArea / ratio));
  if (width * height < MINIMUM_PIXELS) {
    const scale = Math.sqrt(MINIMUM_PIXELS / (width * height));
    width = round16(width * scale);
    height = round16(height * scale);
  }
  if (!validSize(width, height)) {
    throw new ProviderError(
      "OPENAI_IMAGE_SIZE_INCOMPATIBLE",
      "A valid GPT Image 2 source canvas could not be derived from the target dimensions.",
      "incompatible",
    );
  }
  return `${width}x${height}`;
}

function quality(value: "draft" | "standard" | "high"): "low" | "medium" | "high" {
  if (value === "draft") return "low";
  if (value === "high") return "high";
  return "medium";
}

function outputMediaType(
  value: "png" | "webp" | "jpeg",
): "image/png" | "image/webp" | "image/jpeg" {
  if (value === "webp") return "image/webp";
  if (value === "jpeg") return "image/jpeg";
  return "image/png";
}

function safeFileName(reference: ResolvedProviderReference, index: number): string {
  const declared = reference.artifact.fileName;
  const extension =
    reference.artifact.mediaType === "image/png"
      ? "png"
      : reference.artifact.mediaType === "image/webp"
        ? "webp"
        : "jpg";
  if (
    declared &&
    declared.length <= 255 &&
    !declared.includes("\0") &&
    !declared.includes("/") &&
    !declared.includes("\\")
  ) {
    return declared;
  }
  return `${String(index + 1).padStart(2, "0")}-${reference.role}.${extension}`;
}

function orderedImageReferences(
  references: readonly ResolvedProviderReference[],
): readonly ResolvedProviderReference[] {
  const order = new Map<string, number>(
    REFERENCE_ROLE_ORDER.map((role, index) => [role, index]),
  );
  return references
    .filter((reference) => reference.role !== "mask")
    .map((reference, index) => ({ reference, index }))
    .sort(
      (left, right) =>
        (order.get(left.reference.role) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.reference.role) ?? Number.MAX_SAFE_INTEGER) ||
        left.index - right.index,
    )
    .map((entry) => entry.reference);
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function boundedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new ProviderError(
      "OPENAI_IMAGE_RESPONSE_TOO_LARGE",
      `OpenAI image response exceeds ${maximumBytes} bytes.`,
      "transient",
      { status: response.status },
    );
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("OpenAI image response limit exceeded");
      throw new ProviderError(
        "OPENAI_IMAGE_RESPONSE_TOO_LARGE",
        `OpenAI image response exceeds ${maximumBytes} bytes.`,
        "transient",
        { status: response.status },
      );
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks.map((entry) => Buffer.from(entry))).toString("utf8");
}

function providerMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string"
    ? message.replace(/[\r\n\0]+/g, " ").slice(0, 1_000)
    : undefined;
}

function providerCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(code)
    ? code
    : undefined;
}

function statusClassification(
  status: number,
): "transient" | "permanent" | "incompatible" {
  if (status === 408 || status === 409 || status === 429 || status >= 500) {
    return "transient";
  }
  if (status === 404 || status === 422) return "incompatible";
  return "permanent";
}

function strictBase64(value: unknown, index: number): Buffer {
  if (typeof value !== "string") {
    throw new ProviderError(
      "OPENAI_IMAGE_OUTPUT_INVALID",
      `OpenAI candidate ${index + 1} did not contain base64 image data.`,
      "transient",
    );
  }
  const compact = value.replace(/\s+/g, "");
  if (
    compact.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      compact,
    )
  ) {
    throw new ProviderError(
      "OPENAI_IMAGE_OUTPUT_INVALID",
      `OpenAI candidate ${index + 1} contained invalid base64 image data.`,
      "transient",
    );
  }
  const bytes = Buffer.from(compact, "base64");
  if (!bytes.byteLength) {
    throw new ProviderError(
      "OPENAI_IMAGE_OUTPUT_INVALID",
      `OpenAI candidate ${index + 1} was empty.`,
      "transient",
    );
  }
  return bytes;
}

export class OpenAIImageProviderAdapter implements ProviderAdapter {
  public readonly descriptor: ProviderAdapterDescriptor;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #model: string;
  readonly #organization: string | undefined;
  readonly #project: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #maximumResponseBytes: number;

  public constructor(options: OpenAIImageProviderOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey || apiKey.length > 8_192 || apiKey.includes("\0")) {
      throw new ProviderError(
        "OPENAI_IMAGE_CONFIGURATION_INVALID",
        "A valid server-side OpenAI API key is required.",
        "permanent",
      );
    }

    const models = safeModels(options.model, options.allowedModels);
    this.#apiKey = apiKey;
    this.#baseUrl = safeBaseUrl(options.baseUrl);
    this.#model = options.model?.trim() || DEFAULT_MODEL;
    this.#organization = options.organization?.trim() || undefined;
    this.#project = options.project?.trim() || undefined;
    this.#fetch = options.fetch ?? fetch;
    this.#maximumResponseBytes = boundedBytes(options.maximumResponseBytes);
    this.descriptor = Object.freeze({
      protocolVersion: PROVIDER_PROTOCOL_VERSION,
      id: "openai-gpt-image",
      label: "OpenAI GPT Image",
      version: "1.0.0",
      priority: options.priority ?? 1_000,
      capabilities: OPENAI_IMAGE_CAPABILITIES,
      models: Object.freeze(models),
      maximumCandidates: 8,
      maximumReferenceImages: 16,
      maximumSourceBytes: 50 * 1024 * 1024,
      dataPolicy: Object.freeze({
        remote: true,
        retainedByProvider: "provider-dependent",
        usedForTraining: false,
      }),
    });
  }

  async #request(
    resolved: ResolvedProviderCandidateRequest,
    context: ProviderAdapterExecutionContext,
  ): Promise<ProviderAdapterExecutionResult> {
    if (context.signal.aborted) {
      throw new ProviderError(
        "PROVIDER_EXECUTION_CANCELLED",
        "OpenAI image execution was cancelled.",
        "cancelled",
      );
    }

    const request = resolved.request;
    const model = request.selection.preferredModel ?? this.#model;
    if (!this.descriptor.models.includes(model)) {
      throw new ProviderError(
        "OPENAI_IMAGE_MODEL_INCOMPATIBLE",
        `OpenAI image model ${model} is outside the configured allow-list.`,
        "incompatible",
      );
    }
    if (request.background.strategy === "native-alpha") {
      throw new ProviderError(
        "OPENAI_IMAGE_ALPHA_INCOMPATIBLE",
        "GPT Image 2 does not currently support transparent backgrounds.",
        "incompatible",
      );
    }

    const size = openAIImageSourceSize(request);
    const format = request.target.outputFormat;
    const useEditEndpoint =
      resolved.references.length > 0 || request.operation !== "generate";
    const background =
      request.background.strategy === "provider-auto" ? "auto" : "opaque";
    let body: BodyInit;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.#apiKey}`,
      accept: "application/json",
    };
    if (this.#organization) headers["openai-organization"] = this.#organization;
    if (this.#project) headers["openai-project"] = this.#project;

    const imageReferences = orderedImageReferences(resolved.references);
    const mask = resolved.references.find((reference) => reference.role === "mask");

    if (useEditEndpoint) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", resolved.compiledPrompt);
      form.append("n", String(request.candidateCount));
      form.append("size", size);
      form.append("quality", quality(request.quality));
      form.append("output_format", format);
      form.append("background", background);
      for (const [index, reference] of imageReferences.entries()) {
        form.append(
          "image[]",
          new Blob([ownedArrayBuffer(reference.bytes)], {
            type: reference.artifact.mediaType,
          }),
          safeFileName(reference, index),
        );
      }
      if (mask) {
        form.append(
          "mask",
          new Blob([ownedArrayBuffer(mask.bytes)], {
            type: mask.artifact.mediaType,
          }),
          safeFileName(mask, imageReferences.length),
        );
      }
      body = form;
    } else {
      headers["content-type"] = "application/json";
      body = JSON.stringify({
        model,
        prompt: resolved.compiledPrompt,
        n: request.candidateCount,
        size,
        quality: quality(request.quality),
        output_format: format,
        background,
      });
    }

    let response: Response;
    try {
      response = await this.#fetch(
        `${this.#baseUrl}/images/${useEditEndpoint ? "edits" : "generations"}`,
        {
          method: "POST",
          headers,
          body,
          cache: "no-store",
          redirect: "error",
          signal: context.signal,
        },
      );
    } catch (error: unknown) {
      if (
        context.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw new ProviderError(
          "PROVIDER_EXECUTION_CANCELLED",
          "OpenAI image execution was cancelled.",
          "cancelled",
        );
      }
      throw new ProviderError(
        "OPENAI_IMAGE_NETWORK_ERROR",
        "OpenAI image request failed before a response was received.",
        "transient",
      );
    }

    const text = await boundedResponseText(response, this.#maximumResponseBytes);
    let parsed: unknown = {};
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        throw new ProviderError(
          "OPENAI_IMAGE_RESPONSE_INVALID",
          "OpenAI image response was not valid JSON.",
          "transient",
          { status: response.status },
        );
      }
    }
    if (!response.ok) {
      const code = providerCode(parsed);
      const message = providerMessage(parsed);
      throw new ProviderError(
        code ? `OPENAI_${code}` : "OPENAI_IMAGE_REQUEST_FAILED",
        message
          ? `OpenAI image request failed: ${message}`
          : "OpenAI image request failed.",
        statusClassification(response.status),
        { status: response.status },
      );
    }

    const payload = parsed as OpenAIImageResponse;
    if (!Array.isArray(payload.data)) {
      throw new ProviderError(
        "OPENAI_IMAGE_RESPONSE_INVALID",
        "OpenAI image response did not contain a candidate array.",
        "transient",
      );
    }

    const mediaType = outputMediaType(format);
    const outputs: ProviderAdapterOutput[] = payload.data.map((entry, index) => ({
      bytes: strictBase64(entry.b64_json, index),
      mediaType,
      fileName: `${request.candidateFamilyId}-${String(index + 1).padStart(2, "0")}.${format === "jpeg" ? "jpg" : format}`,
      ...(typeof entry.revised_prompt === "string" && entry.revised_prompt.trim()
        ? { revisedPrompt: entry.revised_prompt.trim() }
        : {}),
      metadata: {
        sourceSize: size,
        outputFormat: format,
        background,
      },
    }));
    const usage =
      payload.usage === undefined ? undefined : normalizeJson(payload.usage);

    return {
      adapterId: this.descriptor.id,
      model,
      ...(response.headers.get("x-request-id")
        ? { externalId: response.headers.get("x-request-id")! }
        : {}),
      outputs,
      ...(usage === undefined ? {} : { usage }),
      metadata: {
        endpoint: useEditEndpoint ? "images/edits" : "images/generations",
        created: payload.created ?? null,
        sourceSize: size,
        referenceRoles: imageReferences.map((entry) => entry.role),
        maskRole: mask?.role ?? null,
        inputFidelity: "high-automatic",
      },
    };
  }

  public execute(
    resolved: ResolvedProviderCandidateRequest,
    context: ProviderAdapterExecutionContext,
  ): Promise<ProviderAdapterExecutionResult> {
    return this.#request(resolved, context);
  }
}
