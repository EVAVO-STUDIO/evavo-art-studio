import process from "node:process";

export const DOCS_SUITE_OPERATION_VERSION = "evavo-docs-operations-v1";
export const DOCS_SUITE_WORKBOOK_OPERATION_VERSION = "evavo-workbook-operations-v1";
export const DEFAULT_DOCS_SUITE_URL = "https://docs.evavo.com.au";
export const DOCS_SUITE_RESPONSE_LIMIT_BYTES = 4_000_000;
export const DOCS_SUITE_REQUEST_TIMEOUT_MS = 30_000;
export const DOCS_SUITE_BOOK_CANDIDATE_TIMEOUT_MS = 300_000;

const LONG_RUNNING_BOOK_ENDPOINTS = new Set([
  "/api/v1/book-studio/writing-candidate",
  "/api/v1/book-studio/writing-candidate/authorial",
  "/api/v1/book-studio/unattended-production/authorial-writing",
]);

export class DocsSuiteApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "DocsSuiteApiError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
  }
}

function validAutomationToken(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

export function safeDocsSuiteBaseUrl(value = DEFAULT_DOCS_SUITE_URL) {
  const url = new URL(value || DEFAULT_DOCS_SUITE_URL);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new DocsSuiteApiError("EVAVO_DOCS_URL must use HTTPS, except for localhost development.");
  if (url.username || url.password || url.search || url.hash) throw new DocsSuiteApiError("EVAVO_DOCS_URL cannot contain credentials, query parameters or fragments.");
  url.pathname = "/";
  return url;
}

export function resolveDocsSuiteApiConfiguration(environment = process.env) {
  const token = environment.EVAVO_DOCS_TOKEN?.trim() ?? "";
  if (!token) throw new DocsSuiteApiError("EVAVO_DOCS_TOKEN is required. Create a short-lived workspace grant from the Docs Suite automation panel.");
  if (!validAutomationToken(token)) throw new DocsSuiteApiError("EVAVO_DOCS_TOKEN has an invalid format.");
  return Object.freeze({ token, baseUrl: safeDocsSuiteBaseUrl(environment.EVAVO_DOCS_URL ?? DEFAULT_DOCS_SUITE_URL) });
}

async function readBoundedJsonResponse(response, maximumBytes) {
  const source = await response.text();
  if (Buffer.byteLength(source, "utf8") > maximumBytes) throw new DocsSuiteApiError("Docs Suite returned an oversized response.", { status: response.status });
  try { return JSON.parse(source); }
  catch { throw new DocsSuiteApiError(`Docs Suite returned an invalid JSON response (${response.status}).`, { status: response.status }); }
}

function safeApiUrl(pathname, baseUrl) {
  if (typeof pathname !== "string" || !pathname.startsWith("/api/v1/") || pathname.includes("\\")) throw new DocsSuiteApiError("The requested Docs Suite API path is invalid.");
  const url = new URL(pathname, baseUrl);
  if (url.origin !== baseUrl.origin || !url.pathname.startsWith("/api/v1/")) throw new DocsSuiteApiError("The requested API path escaped the configured Docs Suite origin.");
  return url;
}

function boundedOption(value, fallback, minimum, maximum, label) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new DocsSuiteApiError(`${label} is outside its supported boundary.`);
  return value;
}

export async function docsSuiteApiRequest(pathname, options = {}) {
  const configuration = options.configuration ?? resolveDocsSuiteApiConfiguration();
  const url = safeApiUrl(pathname, configuration.baseUrl);
  const defaultTimeout = LONG_RUNNING_BOOK_ENDPOINTS.has(pathname)
    ? DOCS_SUITE_BOOK_CANDIDATE_TIMEOUT_MS
    : DOCS_SUITE_REQUEST_TIMEOUT_MS;
  const timeoutMs = boundedOption(options.timeoutMs, defaultTimeout, 1_000, 300_000, "Docs Suite request timeout");
  const maximumResponseBytes = boundedOption(options.maximumResponseBytes, DOCS_SUITE_RESPONSE_LIMIT_BYTES, 1_024, 4_000_000, "Docs Suite response limit");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${configuration.token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const payload = await readBoundedJsonResponse(response, maximumResponseBytes);
    if (!response.ok) {
      const message = payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : `Docs Suite request failed with status ${response.status}.`;
      const code = payload && typeof payload === "object" && typeof payload.code === "string" ? payload.code : null;
      throw new DocsSuiteApiError(message, { status: response.status, code });
    }
    return payload;
  } catch (error) {
    if (error instanceof DocsSuiteApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new DocsSuiteApiError("Docs Suite request timed out. The ambiguous request was not retried.");
    throw new DocsSuiteApiError(error instanceof Error ? error.message : "Docs Suite request failed.");
  } finally { clearTimeout(timeout); }
}
