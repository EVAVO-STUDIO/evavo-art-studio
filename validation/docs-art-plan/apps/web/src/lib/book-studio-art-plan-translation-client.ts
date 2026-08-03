import "server-only";

import type {
  BookArtPlanTranslationRequestV1,
} from "../../../../packages/core/src/book-studio-art-plan-translation";

export interface BookArtPlanTranslationClientConfigV1 {
  origin: string;
  token: string;
  timeoutMilliseconds: number;
  maximumResponseBytes: number;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ERROR_CODE = /^[A-Z][A-Z0-9_:-]{2,200}$/;
const MAXIMUM_TIMEOUT_MS = 280_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RESPONSE_BYTES = 4_000_000;

export function resolveBookArtPlanTranslationClientConfig(
  environment: NodeJS.ProcessEnv = process.env,
): BookArtPlanTranslationClientConfigV1 {
  const rawOrigin = environment.EVAVO_ART_STUDIO_BOOK_ART_URL;
  const token = environment.EVAVO_ART_STUDIO_BOOK_ART_TOKEN;
  if (!rawOrigin?.trim()) {
    throw new Error("DOCS_BOOK_ART_TRANSLATION_URL_REQUIRED");
  }
  if (
    !token ||
    token.length < 32 ||
    token.length > 4_096 ||
    /[\u0000-\u0020\u007f]/.test(token)
  ) {
    throw new Error("DOCS_BOOK_ART_TRANSLATION_TOKEN_INVALID");
  }
  let url: URL;
  try {
    url = new URL(rawOrigin);
  } catch {
    throw new Error("DOCS_BOOK_ART_TRANSLATION_URL_INVALID");
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("DOCS_BOOK_ART_TRANSLATION_URL_INVALID");
  }
  return {
    origin: url.origin,
    token,
    timeoutMilliseconds: boundedInteger(
      environment.EVAVO_ART_STUDIO_BOOK_ART_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      1_000,
      MAXIMUM_TIMEOUT_MS,
      "DOCS_BOOK_ART_TRANSLATION_TIMEOUT_INVALID",
    ),
    maximumResponseBytes: boundedInteger(
      environment.EVAVO_ART_STUDIO_BOOK_ART_MAX_RESPONSE_BYTES,
      DEFAULT_RESPONSE_BYTES,
      1_024,
      DEFAULT_RESPONSE_BYTES,
      "DOCS_BOOK_ART_TRANSLATION_RESPONSE_LIMIT_INVALID",
    ),
  };
}

export async function callArtStudioBookPlanTranslation(
  request: BookArtPlanTranslationRequestV1,
  config: BookArtPlanTranslationClientConfigV1,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const path = request.outputKind ===
      "evavo_legacy_website_book_art_plan_translation_input"
    ? "/v1/book-art/legacy-plans/translate"
    : "/v1/book-art/legacy-illustration-plans/translate";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMilliseconds);
  let response: Response;
  try {
    response = await fetchImpl(`${config.origin}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "X-EVAVO-Actor": "docs-suite-book-studio",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("DOCS_BOOK_ART_TRANSLATION_AMBIGUOUS_TIMEOUT_NO_RETRY");
    }
    throw new Error("DOCS_BOOK_ART_TRANSLATION_AMBIGUOUS_NETWORK_NO_RETRY");
  } finally {
    clearTimeout(timer);
  }
  const source = await readBoundedResponse(
    response,
    config.maximumResponseBytes,
  );
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new Error("DOCS_BOOK_ART_TRANSLATION_RESPONSE_JSON_INVALID");
  }
  if (response.status === 200 || response.status === 422) return value;
  const remoteCode = readRemoteErrorCode(value);
  throw new Error(
    remoteCode ?? `DOCS_BOOK_ART_TRANSLATION_REMOTE_HTTP_${response.status}`,
  );
}

async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const declared = response.headers.get("content-length");
  if (
    declared &&
    Number.parseInt(declared, 10) > maximumBytes
  ) {
    throw new Error("DOCS_BOOK_ART_TRANSLATION_RESPONSE_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("DOCS_BOOK_ART_TRANSLATION_RESPONSE_EMPTY");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      throw new Error("DOCS_BOOK_ART_TRANSLATION_RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }
  if (!length) throw new Error("DOCS_BOOK_ART_TRANSLATION_RESPONSE_EMPTY");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function readRemoteErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const error = root.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" && ERROR_CODE.test(code) ? code : null;
}

function boundedInteger(
  source: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (source === undefined || source === "") return fallback;
  const value = Number(source);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}
