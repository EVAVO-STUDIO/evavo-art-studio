import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  OPERATOR_SESSION_COOKIE,
  operatorAuthConfiguration,
  verifyOperatorSession,
  type OperatorSessionClaims,
} from "./operator-auth";
import {
  containsUnredactedSecretKey,
  redactOperatorValue,
} from "./operator-redaction";
import {
  operatorUpstreamPathAllowed,
  type OperatorUpstreamMethod,
} from "./operator-upstream-policy";

const DEFAULT_API_TIMEOUT_MS = 15_000;
const DEFAULT_RESPONSE_LIMIT_BYTES = 8 * 1024 * 1024;
const DEFAULT_REQUEST_LIMIT_BYTES = 2 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAXIMUM_REQUESTS = 180;

type Environment = Readonly<Record<string, string | undefined>>;
type RateEntry = { count: number; resetsAt: number };

const requestRates = new Map<string, RateEntry>();

export interface OperatorApiConfiguration {
  readonly configured: boolean;
  readonly baseUrl?: string;
  readonly token?: string;
  readonly timeoutMs: number;
  readonly responseLimitBytes: number;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function secret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const length = Buffer.byteLength(normalized, "utf8");
  return length >= 32 && length <= 4_096 ? normalized : undefined;
}

function apiBaseUrl(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  try {
    const url = new URL(normalized);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return undefined;
    if (url.username || url.password || url.search || url.hash) return undefined;
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function operatorApiConfiguration(
  environment: Environment = process.env,
): OperatorApiConfiguration {
  const baseUrl = apiBaseUrl(environment.EVAVO_ART_API_BASE_URL);
  const token = secret(environment.EVAVO_ART_WRITE_TOKEN);
  return {
    configured: baseUrl !== undefined && token !== undefined,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(token === undefined ? {} : { token }),
    timeoutMs: boundedInteger(
      environment.EVAVO_ART_OPERATOR_API_TIMEOUT_MS,
      DEFAULT_API_TIMEOUT_MS,
      1_000,
      60_000,
    ),
    responseLimitBytes: boundedInteger(
      environment.EVAVO_ART_OPERATOR_RESPONSE_LIMIT_BYTES,
      DEFAULT_RESPONSE_LIMIT_BYTES,
      64 * 1024,
      32 * 1024 * 1024,
    ),
  };
}

export function operatorResponse(
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-security-policy": "default-src 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      ...headers,
    },
  });
}

export function isSameOriginOperatorRequest(request: NextRequest): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function readBoundedOperatorJson(
  request: NextRequest,
  maximumBytes = DEFAULT_REQUEST_LIMIT_BYTES,
): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new OperatorGatewayError(
      "OPERATOR_REQUEST_TOO_LARGE",
      `Request body exceeds ${maximumBytes} bytes.`,
      413,
    );
  }
  if (!request.body) return {};

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("operator request limit exceeded");
      throw new OperatorGatewayError(
        "OPERATOR_REQUEST_TOO_LARGE",
        `Request body exceeds ${maximumBytes} bytes.`,
        413,
      );
    }
    chunks.push(next.value);
  }

  const text = Buffer.concat(chunks.map((entry) => Buffer.from(entry))).toString(
    "utf8",
  );
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OperatorGatewayError(
      "OPERATOR_INVALID_JSON",
      "Request body must be valid JSON.",
      400,
    );
  }
}

function rateAllowed(sessionId: string, now = Date.now()): boolean {
  const existing = requestRates.get(sessionId);
  if (!existing || existing.resetsAt <= now) {
    requestRates.set(sessionId, { count: 1, resetsAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (existing.count >= RATE_MAXIMUM_REQUESTS) return false;
  existing.count += 1;

  if (requestRates.size > 2_000) {
    for (const [key, entry] of requestRates) {
      if (entry.resetsAt <= now) requestRates.delete(key);
    }
  }
  return true;
}

export function operatorSessionFromRequest(
  request: NextRequest,
): OperatorSessionClaims | null {
  return verifyOperatorSession(
    request.cookies.get(OPERATOR_SESSION_COOKIE)?.value,
  );
}

export function requireOperatorSession(
  request: NextRequest,
): OperatorSessionClaims {
  const session = operatorSessionFromRequest(request);
  if (!session) {
    throw new OperatorGatewayError(
      "OPERATOR_SESSION_REQUIRED",
      "A valid owner operator session is required.",
      401,
    );
  }
  if (!rateAllowed(session.sessionId)) {
    throw new OperatorGatewayError(
      "OPERATOR_RATE_LIMITED",
      "Operator request rate exceeded the local control-plane limit.",
      429,
    );
  }
  return session;
}

function safeSegment(value: string, name: string, pattern: RegExp): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new OperatorGatewayError(
      "OPERATOR_PATH_INVALID",
      `${name} contains invalid percent encoding.`,
      422,
    );
  }
  if (!pattern.test(decoded)) {
    throw new OperatorGatewayError(
      "OPERATOR_PATH_INVALID",
      `${name} is invalid.`,
      422,
    );
  }
  return encodeURIComponent(decoded);
}

export function operatorJobPath(jobId: string, action?: string): string {
  const job = safeSegment(jobId, "jobId", /^[A-Za-z0-9._:-]{1,128}$/);
  if (!action) return `/v1/runtime/jobs/${job}`;
  const normalizedAction = safeSegment(
    action,
    "action",
    /^(cancel|pause|resume|redrive)$/,
  );
  return `/v1/runtime/jobs/${job}/${normalizedAction}`;
}

export function operatorArtifactPath(
  artifactId: string,
  verify = false,
): string {
  const artifact = safeSegment(
    artifactId,
    "artifactId",
    /^artifact_[a-f0-9]{64}$/,
  );
  return `/v1/artifacts/${artifact}${verify ? "/verify" : ""}`;
}

async function boundedResponseBody(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new OperatorGatewayError(
      "OPERATOR_UPSTREAM_RESPONSE_TOO_LARGE",
      `Upstream response exceeds ${maximumBytes} bytes.`,
      502,
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
      await reader.cancel("operator upstream response limit exceeded");
      throw new OperatorGatewayError(
        "OPERATOR_UPSTREAM_RESPONSE_TOO_LARGE",
        `Upstream response exceeds ${maximumBytes} bytes.`,
        502,
      );
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks.map((entry) => Buffer.from(entry))).toString(
    "utf8",
  );
}

export interface OperatorApiRequestOptions {
  readonly method?: OperatorUpstreamMethod;
  readonly body?: unknown;
  readonly actor?: string;
}

export async function requestOperatorApi(
  request: NextRequest,
  upstreamPath: string,
  options: OperatorApiRequestOptions = {},
): Promise<NextResponse> {
  if (!isSameOriginOperatorRequest(request)) {
    return operatorResponse(
      {
        error: {
          code: "OPERATOR_CROSS_SITE_REJECTED",
          message: "Cross-site operator requests are not allowed.",
        },
      },
      403,
    );
  }

  try {
    const session = requireOperatorSession(request);
    const configuration = operatorApiConfiguration();
    if (!configuration.configured || !configuration.baseUrl || !configuration.token) {
      throw new OperatorGatewayError(
        "OPERATOR_API_NOT_CONFIGURED",
        "The server-side Art Studio API base URL and control token are not configured.",
        503,
      );
    }

    const method = options.method ?? "GET";
    if (!operatorUpstreamPathAllowed(upstreamPath, method)) {
      throw new OperatorGatewayError(
        "OPERATOR_PATH_INVALID",
        "Operator upstream path or method is not allowed.",
        422,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
    timeout.unref?.();
    try {
      const response = await fetch(`${configuration.baseUrl}${upstreamPath}`, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${configuration.token}`,
          ...(options.body === undefined
            ? {}
            : { "content-type": "application/json" }),
          "x-evavo-actor":
            options.actor ?? `web-operator:${session.sessionId.slice(0, 12)}`,
          "x-request-id": randomUUID(),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });

      const text = await boundedResponseBody(
        response,
        configuration.responseLimitBytes,
      );
      let body: unknown = {};
      if (text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          throw new OperatorGatewayError(
            "OPERATOR_UPSTREAM_INVALID_JSON",
            "Art Studio API returned a non-JSON response.",
            502,
          );
        }
      }

      const redactedBody = redactOperatorValue(body);
      if (containsUnredactedSecretKey(redactedBody)) {
        throw new OperatorGatewayError(
          "OPERATOR_REDACTION_FAILED",
          "The operator response could not be safely redacted.",
          502,
        );
      }
      const upstreamRequestId = response.headers.get("x-request-id");
      return operatorResponse(redactedBody, response.status, {
        "x-operator-upstream-status": String(response.status),
        ...(upstreamRequestId
          ? { "x-operator-upstream-request-id": upstreamRequestId }
          : {}),
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: unknown) {
    return operatorErrorResponse(error);
  }
}

export function operatorErrorResponse(error: unknown): NextResponse {
  if (error instanceof OperatorGatewayError) {
    return operatorResponse(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }
  const aborted = error instanceof Error && error.name === "AbortError";
  return operatorResponse(
    {
      error: {
        code: aborted ? "OPERATOR_API_TIMEOUT" : "OPERATOR_GATEWAY_ERROR",
        message: aborted
          ? "The Art Studio API did not respond before the operator timeout."
          : "The operator gateway could not complete the request.",
      },
    },
    aborted ? 504 : 500,
  );
}

export function operatorConfigurationStatus(): Readonly<{
  configured: boolean;
  apiConfigured: boolean;
}> {
  return {
    configured: operatorAuthConfiguration().configured,
    apiConfigured: operatorApiConfiguration().configured,
  };
}

export class OperatorGatewayError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "OperatorGatewayError";
    this.code = code;
    this.status = status;
  }
}
