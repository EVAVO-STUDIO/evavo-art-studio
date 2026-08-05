import type {
  EvavoDocsSuiteLegacyCraftApiResponseV1,
  EvavoDocsSuiteLegacyCraftCompatibilityResultV1,
  EvavoDocsSuiteLegacyCraftConfiguration,
  EvavoDocsSuiteLegacyCraftProxyReceiptV1,
  EvavoDocsSuiteLegacyCraftRequestV1,
  EvavoLegacyCraftPublicRequest
} from "./storyBookStudioDocsSuiteLegacyCraftTypes";
import {
  EVAVO_DOCS_SUITE_LEGACY_CRAFT_CONTRACT,
  EVAVO_DOCS_SUITE_LEGACY_CRAFT_ENDPOINT,
  EVAVO_DOCS_SUITE_LEGACY_CRAFT_REQUESTER
} from "./storyBookStudioDocsSuiteLegacyCraftTypes";
import { isEvavoLegacyCraftRecord } from "./storyBookStudioDocsSuiteLegacyCraftContracts";
import { fingerprintEvavoLegacyCraftValue } from "./storyBookStudioDocsSuiteLegacyCraftShared";
import { readEvavoBoundedUtf8Body } from "./storyBookStudioDocsSuiteLegacyCraftStream";

const DEFAULT_DOCS_SUITE_URL = "https://docs.evavo.com.au";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAXIMUM_TIMEOUT_MS = 300_000;
const MAXIMUM_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAXIMUM_REQUEST_BYTES = 8 * 1024 * 1024;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DOCS_AUTOMATION_GRANT_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DOCS_WORKSPACE_ID = /^[A-Za-z0-9_-]{3,160}$/;

const RESPONSE_KEYS = ["ok", "workspaceId", "actorType", "result"].sort();
const RESULT_KEYS = [
  "outputKind",
  "schemaVersion",
  "contract",
  "status",
  "requestId",
  "operation",
  "sourceRepository",
  "sourceCommit",
  "requestFingerprint",
  "result",
  "blockers",
  "warnings",
  "resultFingerprint",
  "docsSuiteCompatibilityExecutionPerformed",
  "websiteLocalCraftExecutionPerformed",
  "legacyWebsiteCraftSourceRetired",
  "authoritativeWritesPerformed",
  "providerCalled",
  "canonicalManuscriptMutationPerformed",
  "automaticCanonicalAdmissionAllowed",
  "docsSuiteCanonicalWriterEnabled",
  "dualAuthoritativeWritesAllowed",
  "runtimeCutoverApproved",
  "sourceDeletionApproved",
  "publicationPerformed"
].sort();

export type EvavoDocsSuiteLegacyCraftProxyErrorCode =
  | "BOOK_CRAFT_PROXY_CONFIGURATION_INVALID"
  | "BOOK_CRAFT_PROXY_REQUEST_INVALID"
  | "BOOK_CRAFT_PROXY_REQUEST_TOO_LARGE"
  | "BOOK_CRAFT_PROXY_TIMEOUT"
  | "BOOK_CRAFT_PROXY_NETWORK_FAILED"
  | "BOOK_CRAFT_PROXY_REMOTE_REJECTED"
  | "BOOK_CRAFT_PROXY_RESPONSE_TOO_LARGE"
  | "BOOK_CRAFT_PROXY_RESPONSE_INVALID"
  | "BOOK_CRAFT_PROXY_RESPONSE_TAMPERED";

export class EvavoDocsSuiteLegacyCraftProxyError extends Error {
  readonly code: EvavoDocsSuiteLegacyCraftProxyErrorCode;
  readonly status: number;

  constructor(code: EvavoDocsSuiteLegacyCraftProxyErrorCode, message: string, status: number) {
    super(message);
    this.name = "EvavoDocsSuiteLegacyCraftProxyError";
    this.code = code;
    this.status = status;
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedExactString(value: unknown, maximumLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => nonEmptyString(item));
}

function configurationError(message: string): EvavoDocsSuiteLegacyCraftProxyError {
  return new EvavoDocsSuiteLegacyCraftProxyError(
    "BOOK_CRAFT_PROXY_CONFIGURATION_INVALID",
    message,
    503
  );
}

function positiveBoundedInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 500 || parsed > MAXIMUM_TIMEOUT_MS) {
    throw configurationError("EVAVO Docs Suite legacy craft timeout must be an integer from 500 to 300000 milliseconds.");
  }
  return parsed;
}

function safeBaseUrl(value: string): URL {
  if (!value || value !== value.trim()) {
    throw configurationError("EVAVO Docs Suite legacy craft URL must not rely on whitespace normalisation.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw configurationError("EVAVO Docs Suite legacy craft URL is invalid.");
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw configurationError("EVAVO Docs Suite legacy craft URL must use HTTPS outside local development.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw configurationError("EVAVO Docs Suite legacy craft URL must be a credential-free origin without a path, query or fragment.");
  }
  return url;
}

function validateResolvedConfiguration(
  configuration: EvavoDocsSuiteLegacyCraftConfiguration
): EvavoDocsSuiteLegacyCraftConfiguration {
  const baseUrl = safeBaseUrl(configuration.baseUrl.href);
  if (
    !configuration.token
    || configuration.token.length > 4096
    || !DOCS_AUTOMATION_GRANT_TOKEN.test(configuration.token)
  ) {
    throw configurationError("A bounded two-part base64url Docs Suite automation-grant token is required for legacy craft compatibility.");
  }
  if (!/^[a-f0-9]{40,64}$/.test(configuration.websiteCommit)) {
    throw configurationError("The exact 40-64 character Website Git commit is required for legacy craft compatibility.");
  }
  if (!Number.isInteger(configuration.timeoutMs) || configuration.timeoutMs < 1 || configuration.timeoutMs > MAXIMUM_TIMEOUT_MS) {
    throw configurationError("Resolved legacy craft timeout is outside the supported boundary.");
  }
  if (
    !Number.isInteger(configuration.maximumResponseBytes)
    || configuration.maximumResponseBytes < 1
    || configuration.maximumResponseBytes > MAXIMUM_RESPONSE_BYTES
  ) {
    throw configurationError("Resolved legacy craft response limit is outside the supported boundary.");
  }
  return { ...configuration, baseUrl };
}

export function resolveEvavoDocsSuiteLegacyCraftConfiguration(
  environment: NodeJS.ProcessEnv = process.env
): EvavoDocsSuiteLegacyCraftConfiguration {
  const url = environment.EVAVO_DOCS_SUITE_BOOK_CRAFT_URL
    ?? environment.EVAVO_DOCS_SUITE_BOOK_WRITER_URL
    ?? environment.EVAVO_DOCS_URL
    ?? DEFAULT_DOCS_SUITE_URL;
  const token = environment.EVAVO_DOCS_SUITE_BOOK_CRAFT_TOKEN
    ?? environment.EVAVO_DOCS_SUITE_BOOK_WRITER_TOKEN
    ?? environment.EVAVO_DOCS_TOKEN
    ?? "";
  const websiteCommit = environment.EVAVO_WEBSITE_COMMIT_SHA
    ?? environment.VERCEL_GIT_COMMIT_SHA
    ?? environment.GITHUB_SHA
    ?? "";

  return validateResolvedConfiguration({
    baseUrl: safeBaseUrl(url),
    token,
    websiteCommit,
    timeoutMs: positiveBoundedInteger(environment.EVAVO_DOCS_SUITE_BOOK_CRAFT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maximumResponseBytes: MAXIMUM_RESPONSE_BYTES
  });
}

function canonicalUtcTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function buildEvavoDocsSuiteLegacyCraftRequest(input: {
  requestId: string;
  requestedAt: string;
  payload: EvavoLegacyCraftPublicRequest;
  configuration: EvavoDocsSuiteLegacyCraftConfiguration;
}): EvavoDocsSuiteLegacyCraftRequestV1 {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(input.requestId) || !canonicalUtcTimestamp(input.requestedAt)) {
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_REQUEST_INVALID",
      "Legacy craft request identity or canonical UTC timestamp is invalid.",
      400
    );
  }
  return {
    outputKind: "evavo_docs_book_legacy_craft_genome_request",
    schemaVersion: 1,
    contract: EVAVO_DOCS_SUITE_LEGACY_CRAFT_CONTRACT,
    authorityMode: "compatibility_migration",
    requestId: input.requestId,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: input.configuration.websiteCommit,
    payload: input.payload,
    requestedAt: input.requestedAt,
    requestedBy: EVAVO_DOCS_SUITE_LEGACY_CRAFT_REQUESTER,
    authoritativeWritesAllowed: false,
    providerCallAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    automaticCanonicalAdmissionAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false
  };
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mediaType.startsWith("application/")
    && (mediaType === "application/json" || mediaType.endsWith("+json"));
}

function cancelRemoteResponseBody(response: Response): void {
  if (!response.body) return;
  try {
    void response.body.cancel("legacy-craft-remote-status-rejected").catch(() => undefined);
  } catch {
    // The status-derived rejection remains authoritative if cancellation fails.
  }
}

function remoteRejectionStatus(status: number): number {
  if (status === 400 || status === 413) return status;
  if (status === 429) return 503;
  return 502;
}

async function readBoundedResponse(response: Response, maximumBytes: number): Promise<unknown> {
  if (!isJsonContentType(response.headers.get("content-type"))) {
    cancelRemoteResponseBody(response);
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_RESPONSE_INVALID",
      "Docs Suite returned a successful legacy craft response without a JSON media type.",
      502
    );
  }

  let source: string;
  try {
    source = await readEvavoBoundedUtf8Body({
      body: response.body,
      declaredLength: response.headers.get("content-length"),
      maximumBytes,
      tooLarge: () => new EvavoDocsSuiteLegacyCraftProxyError(
        "BOOK_CRAFT_PROXY_RESPONSE_TOO_LARGE",
        "Docs Suite returned an oversized legacy craft response.",
        502
      ),
      invalidEncoding: () => new EvavoDocsSuiteLegacyCraftProxyError(
        "BOOK_CRAFT_PROXY_RESPONSE_INVALID",
        "Docs Suite returned a non-UTF-8 legacy craft response.",
        502
      )
    });
  } catch (error) {
    if (error instanceof EvavoDocsSuiteLegacyCraftProxyError) throw error;
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_RESPONSE_INVALID",
      "Docs Suite legacy craft response stream failed.",
      502
    );
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_RESPONSE_INVALID",
      "Docs Suite returned invalid JSON for legacy craft compatibility.",
      502
    );
  }
}

function validateCompatibilityResult(
  value: unknown,
  request: EvavoDocsSuiteLegacyCraftRequestV1
): EvavoDocsSuiteLegacyCraftCompatibilityResultV1 {
  if (!isEvavoLegacyCraftRecord(value) || !exactKeys(value, RESULT_KEYS)) {
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_RESPONSE_INVALID",
      "Docs Suite returned an unexpected legacy craft result shape.",
      502
    );
  }

  const authorityValid = value.docsSuiteCompatibilityExecutionPerformed === true
    && value.websiteLocalCraftExecutionPerformed === false
    && value.legacyWebsiteCraftSourceRetired === true
    && value.authoritativeWritesPerformed === false
    && value.providerCalled === false
    && value.canonicalManuscriptMutationPerformed === false
    && value.automaticCanonicalAdmissionAllowed === false
    && value.docsSuiteCanonicalWriterEnabled === false
    && value.dualAuthoritativeWritesAllowed === false
    && value.runtimeCutoverApproved === false
    && value.sourceDeletionApproved === false
    && value.publicationPerformed === false;

  if (
    value.outputKind !== "evavo_docs_book_legacy_craft_genome_result"
    || value.schemaVersion !== 1
    || value.contract !== EVAVO_DOCS_SUITE_LEGACY_CRAFT_CONTRACT
    || value.status !== "completed"
    || value.requestId !== request.requestId
    || value.operation !== request.payload.operation
    || value.sourceRepository !== request.sourceRepository
    || value.sourceCommit !== request.sourceCommit
    || !SHA256_PATTERN.test(String(value.requestFingerprint))
    || !SHA256_PATTERN.test(String(value.resultFingerprint))
    || !isEvavoLegacyCraftRecord(value.result)
    || !stringArray(value.blockers)
    || !stringArray(value.warnings)
    || !authorityValid
  ) {
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_RESPONSE_TAMPERED",
      "Docs Suite legacy craft identity or authority evidence did not match the exact request.",
      502
    );
  }

  const expectedRequestFingerprint = fingerprintEvavoLegacyCraftValue(request);
  if (value.requestFingerprint !== expectedRequestFingerprint) {
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_RESPONSE_TAMPERED",
      "Docs Suite legacy craft request fingerprint did not match the exact Website envelope.",
      502
    );
  }

  const { resultFingerprint, ...unsigned } = value;
  if (resultFingerprint !== fingerprintEvavoLegacyCraftValue(unsigned)) {
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_RESPONSE_TAMPERED",
      "Docs Suite legacy craft result fingerprint did not match the returned result.",
      502
    );
  }

  return value as unknown as EvavoDocsSuiteLegacyCraftCompatibilityResultV1;
}

function validateApiResponse(
  value: unknown,
  request: EvavoDocsSuiteLegacyCraftRequestV1
): EvavoDocsSuiteLegacyCraftApiResponseV1 {
  if (!isEvavoLegacyCraftRecord(value) || !exactKeys(value, RESPONSE_KEYS) || value.ok !== true) {
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_RESPONSE_INVALID",
      "Docs Suite returned an unexpected legacy craft API envelope.",
      502
    );
  }
  if (
    !boundedExactString(value.workspaceId, 160)
    || !DOCS_WORKSPACE_ID.test(value.workspaceId)
    || (value.actorType !== "owner" && value.actorType !== "client")
  ) {
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_RESPONSE_INVALID",
      "Docs Suite legacy craft response omitted a contract-valid workspace identity or owner/client actor type.",
      502
    );
  }
  return {
    ok: true,
    workspaceId: value.workspaceId,
    actorType: value.actorType,
    result: validateCompatibilityResult(value.result, request)
  };
}

function timeoutError(message: string): EvavoDocsSuiteLegacyCraftProxyError {
  return new EvavoDocsSuiteLegacyCraftProxyError(
    "BOOK_CRAFT_PROXY_TIMEOUT",
    message,
    504
  );
}

export async function requestEvavoDocsSuiteLegacyCraft(input: {
  requestId: string;
  requestedAt: string;
  payload: EvavoLegacyCraftPublicRequest;
  configuration?: EvavoDocsSuiteLegacyCraftConfiguration;
  fetchImpl?: typeof fetch;
}): Promise<EvavoDocsSuiteLegacyCraftProxyReceiptV1> {
  const configuration = validateResolvedConfiguration(
    input.configuration ?? resolveEvavoDocsSuiteLegacyCraftConfiguration()
  );
  const request = buildEvavoDocsSuiteLegacyCraftRequest({
    requestId: input.requestId,
    requestedAt: input.requestedAt,
    payload: input.payload,
    configuration
  });
  const requestBody = JSON.stringify(request);
  if (Buffer.byteLength(requestBody, "utf8") > MAXIMUM_REQUEST_BYTES) {
    throw new EvavoDocsSuiteLegacyCraftProxyError(
      "BOOK_CRAFT_PROXY_REQUEST_TOO_LARGE",
      "Legacy craft compatibility request exceeds the 8 MiB transport boundary.",
      413
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
  const url = new URL(EVAVO_DOCS_SUITE_LEGACY_CRAFT_ENDPOINT, configuration.baseUrl);
  if (url.origin !== configuration.baseUrl.origin || url.pathname !== EVAVO_DOCS_SUITE_LEGACY_CRAFT_ENDPOINT) {
    clearTimeout(timeout);
    throw configurationError("Resolved Docs Suite legacy craft endpoint escaped its fixed origin or path.");
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${configuration.token}`,
          "content-type": "application/json"
        },
        body: requestBody
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw timeoutError("Docs Suite legacy craft request timed out and was not retried.");
      }
      throw new EvavoDocsSuiteLegacyCraftProxyError(
        "BOOK_CRAFT_PROXY_NETWORK_FAILED",
        "Docs Suite legacy craft request failed and was not retried.",
        502
      );
    }

    if (controller.signal.aborted) {
      cancelRemoteResponseBody(response);
      throw timeoutError("Docs Suite legacy craft request timed out before response admission and was not retried.");
    }

    if (!response.ok) {
      cancelRemoteResponseBody(response);
      throw new EvavoDocsSuiteLegacyCraftProxyError(
        "BOOK_CRAFT_PROXY_REMOTE_REJECTED",
        `Docs Suite rejected legacy craft compatibility with status ${response.status}.`,
        remoteRejectionStatus(response.status)
      );
    }

    let parsed: unknown;
    try {
      parsed = await readBoundedResponse(response, configuration.maximumResponseBytes);
    } catch (error) {
      if (controller.signal.aborted) {
        throw timeoutError("Docs Suite legacy craft response timed out and was not retried.");
      }
      throw error;
    }
    if (controller.signal.aborted) {
      throw timeoutError("Docs Suite legacy craft response exceeded its complete-body deadline and was not retried.");
    }

    const validated = validateApiResponse(parsed, request);
    return {
      result: validated.result.result,
      requestFingerprint: validated.result.requestFingerprint,
      resultFingerprint: validated.result.resultFingerprint,
      operation: validated.result.operation,
      sourceCommit: validated.result.sourceCommit,
      remoteExecutionPerformed: true,
      localExecutionPerformed: false
    };
  } finally {
    clearTimeout(timeout);
  }
}
