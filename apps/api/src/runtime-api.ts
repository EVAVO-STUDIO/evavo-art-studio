import type { IncomingMessage, ServerResponse } from "node:http";

import {
  ArtifactStoreError,
  type ArtifactId,
  type ArtifactStore,
} from "@evavo/art-artifacts";
import {
  RuntimeError,
  type RuntimeJobState,
  type RuntimeJobSubmission,
  type RuntimeRepository,
} from "@evavo/art-runtime";

export interface RuntimeApiContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly requestId: string;
  readonly maximumBodyBytes: number;
  readonly runtime: RuntimeRepository | undefined;
  readonly artifacts: ArtifactStore | undefined;
  readonly accessReady: boolean;
  readonly accessAuthorized: boolean;
  readonly readJsonBody: (
    request: IncomingMessage,
    maximumBytes: number,
  ) => Promise<unknown>;
  readonly writeJson: (
    response: ServerResponse,
    status: number,
    body: unknown,
    requestId: string,
  ) => void;
}

const RUNTIME_STATES = new Set<RuntimeJobState>([
  "waiting",
  "queued",
  "leased",
  "running",
  "retry-wait",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
  "dead-letter",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function actor(request: IncomingMessage): string {
  const header = request.headers["x-evavo-actor"];
  const raw = Array.isArray(header) ? header[0] : header;
  const value = raw?.trim() || "api-control-token";
  if (!value || value.length > 256 || value.includes("\0")) {
    throw new RuntimeError(
      "RUNTIME_ACTOR_INVALID",
      "x-evavo-actor must contain 1 to 256 characters.",
    );
  }
  return value;
}

function integer(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new RuntimeError(
      "RUNTIME_QUERY_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return parsed;
}

function csv(value: string | null): readonly string[] | undefined {
  if (!value) return undefined;
  const result = [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
  return result.length ? result : undefined;
}

function states(value: string | null): readonly RuntimeJobState[] | undefined {
  const entries = csv(value);
  if (!entries) return undefined;
  for (const entry of entries) {
    if (!RUNTIME_STATES.has(entry as RuntimeJobState)) {
      throw new RuntimeError(
        "RUNTIME_QUERY_INVALID",
        `Unsupported runtime state: ${entry}`,
      );
    }
  }
  return entries as RuntimeJobState[];
}

function artifactId(value: string): ArtifactId {
  if (!/^artifact_[a-f0-9]{64}$/.test(value)) {
    throw new ArtifactStoreError(
      "ARTIFACT_ID_INVALID",
      "Artifact ID must use artifact_<sha256> format.",
    );
  }
  return value as ArtifactId;
}

function operationalPath(pathname: string): boolean {
  return (
    pathname === "/v1/runtime/jobs" ||
    pathname === "/v1/runtime/events" ||
    pathname === "/v1/runtime/recover" ||
    pathname.startsWith("/v1/runtime/jobs/") ||
    pathname.startsWith("/v1/artifacts/") ||
    pathname === "/v1/artifact-references"
  );
}

function requireAccess(context: RuntimeApiContext): boolean {
  if (!context.accessReady) {
    context.writeJson(
      context.response,
      503,
      {
        error: {
          code: "ART_STUDIO_RUNTIME_ACCESS_UNAVAILABLE",
          message:
            "Runtime access requires EVAVO_ART_ALLOW_WRITES=true and a server-side control token of at least 32 bytes.",
        },
      },
      context.requestId,
    );
    return false;
  }
  if (!context.accessAuthorized) {
    context.writeJson(
      context.response,
      401,
      {
        error: {
          code: "ART_STUDIO_RUNTIME_UNAUTHORIZED",
          message: "A valid Art Studio control token is required.",
        },
      },
      context.requestId,
    );
    return false;
  }
  return true;
}

function statusFor(error: RuntimeError | ArtifactStoreError): number {
  if (/NOT_FOUND/.test(error.code)) return 404;
  if (/CONFLICT|TERMINAL|INVALID_STATE|DEPENDENCY_FAILED/.test(error.code)) {
    return 409;
  }
  return 422;
}

function sendError(context: RuntimeApiContext, error: unknown): void {
  if (error instanceof RuntimeError || error instanceof ArtifactStoreError) {
    context.writeJson(
      context.response,
      statusFor(error),
      { error: { code: error.code, message: error.message } },
      context.requestId,
    );
    return;
  }
  throw error;
}

function jobRoute(
  pathname: string,
): Readonly<{ jobId: string; action?: string }> | null {
  const match = /^\/v1\/runtime\/jobs\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
  if (!match?.[1]) return null;
  return {
    jobId: decodeURIComponent(match[1]),
    ...(match[2] ? { action: decodeURIComponent(match[2]) } : {}),
  };
}

function artifactRoute(
  pathname: string,
): Readonly<{ artifactId: ArtifactId; verify: boolean }> | null {
  const match = /^\/v1\/artifacts\/(artifact_[a-f0-9]{64})(?:\/(verify))?$/.exec(
    pathname,
  );
  if (!match?.[1]) return null;
  return {
    artifactId: artifactId(match[1]),
    verify: match[2] === "verify",
  };
}

export async function handleRuntimeApiRequest(
  context: RuntimeApiContext,
): Promise<boolean> {
  if (!operationalPath(context.url.pathname)) return false;
  if (!requireAccess(context)) return true;

  const { request, response, url, requestId, runtime, artifacts } = context;
  try {
    if (url.pathname.startsWith("/v1/runtime/") && !runtime) {
      context.writeJson(
        response,
        503,
        {
          error: {
            code: "ART_STUDIO_RUNTIME_NOT_CONFIGURED",
            message:
              "A durable runtime repository is not configured for this API process.",
          },
        },
        requestId,
      );
      return true;
    }
    if (
      (url.pathname.startsWith("/v1/artifacts/") ||
        url.pathname === "/v1/artifact-references") &&
      !artifacts
    ) {
      context.writeJson(
        response,
        503,
        {
          error: {
            code: "ART_STUDIO_ARTIFACT_STORE_NOT_CONFIGURED",
            message:
              "An artifact store is not configured for this API process.",
          },
        },
        requestId,
      );
      return true;
    }

    if (request.method === "GET" && url.pathname === "/v1/runtime/jobs") {
      const stateFilter = states(url.searchParams.get("state"));
      const queues = csv(url.searchParams.get("queue"));
      const kinds = csv(url.searchParams.get("kind"));
      context.writeJson(
        response,
        200,
        {
          schemaVersion: "1.0",
          jobs: await runtime!.list({
            ...(stateFilter ? { states: stateFilter } : {}),
            ...(queues ? { queues } : {}),
            ...(kinds ? { kinds } : {}),
            limit: integer(
              url.searchParams.get("limit"),
              1_000,
              1,
              100_000,
              "limit",
            ),
          }),
        },
        requestId,
      );
      return true;
    }

    if (request.method === "GET" && url.pathname === "/v1/runtime/events") {
      context.writeJson(
        response,
        200,
        {
          schemaVersion: "1.0",
          events: await runtime!.events(
            integer(
              url.searchParams.get("after"),
              0,
              0,
              Number.MAX_SAFE_INTEGER,
              "after",
            ),
          ),
        },
        requestId,
      );
      return true;
    }

    if (request.method === "POST" && url.pathname === "/v1/runtime/jobs") {
      const body = await context.readJsonBody(
        request,
        context.maximumBodyBytes,
      );
      const jobs = Array.isArray(body)
        ? await runtime!.submitBatch(
            body as unknown as readonly RuntimeJobSubmission[],
            actor(request),
          )
        : await runtime!.submit(
            body as unknown as RuntimeJobSubmission,
            actor(request),
          );
      context.writeJson(
        response,
        201,
        { schemaVersion: "1.0", jobs },
        requestId,
      );
      return true;
    }

    if (request.method === "POST" && url.pathname === "/v1/runtime/recover") {
      const jobs = await runtime!.recoverExpiredLeases(actor(request));
      context.writeJson(
        response,
        200,
        { schemaVersion: "1.0", jobs },
        requestId,
      );
      return true;
    }

    const job = jobRoute(url.pathname);
    if (job) {
      if (request.method === "GET" && !job.action) {
        const value = await runtime!.get(job.jobId);
        if (!value) {
          throw new RuntimeError(
            "RUNTIME_JOB_NOT_FOUND",
            `Runtime job was not found: ${job.jobId}`,
          );
        }
        context.writeJson(response, 200, value, requestId);
        return true;
      }
      if (request.method === "POST" && job.action) {
        const body = await context.readJsonBody(
          request,
          context.maximumBodyBytes,
        );
        const record = isRecord(body) ? body : {};
        const operator = actor(request);
        let value;
        if (job.action === "cancel") {
          value = await runtime!.cancel(job.jobId, operator, {
            force: record.force === true,
          });
        } else if (job.action === "pause") {
          value = await runtime!.pause(job.jobId, operator, {
            force: record.force === true,
          });
        } else if (job.action === "resume") {
          value = await runtime!.resume(job.jobId, operator);
        } else if (job.action === "redrive") {
          value = await runtime!.redrive(
            job.jobId,
            typeof record.additionalAttempts === "number"
              ? record.additionalAttempts
              : 1,
            operator,
          );
        } else {
          return false;
        }
        context.writeJson(response, 200, value, requestId);
        return true;
      }
    }

    const artifact = artifactRoute(url.pathname);
    if (request.method === "GET" && artifact) {
      const value = artifact.verify
        ? await artifacts!.verify(artifact.artifactId)
        : await artifacts!.get(artifact.artifactId);
      if (!value) {
        throw new ArtifactStoreError(
          "ARTIFACT_NOT_FOUND",
          `Artifact was not found: ${artifact.artifactId}`,
        );
      }
      context.writeJson(response, 200, value, requestId);
      return true;
    }

    if (url.pathname === "/v1/artifact-references") {
      const namespace = url.searchParams.get("namespace")?.trim();
      const name = url.searchParams.get("name")?.trim();
      if (request.method === "GET") {
        if (!namespace || !name) {
          throw new ArtifactStoreError(
            "ARTIFACT_REFERENCE_INVALID",
            "namespace and name query parameters are required.",
          );
        }
        context.writeJson(
          response,
          200,
          await artifacts!.resolveReference(namespace, name),
          requestId,
        );
        return true;
      }
      if (request.method === "POST") {
        const body = await context.readJsonBody(
          request,
          context.maximumBodyBytes,
        );
        if (
          !isRecord(body) ||
          typeof body.namespace !== "string" ||
          typeof body.name !== "string" ||
          typeof body.artifactId !== "string"
        ) {
          throw new ArtifactStoreError(
            "ARTIFACT_REFERENCE_INVALID",
            "namespace, name and artifactId are required.",
          );
        }
        context.writeJson(
          response,
          200,
          await artifacts!.updateReference(
            body.namespace,
            body.name,
            artifactId(body.artifactId),
            {
              actor: actor(request),
              ...(typeof body.expectedGeneration === "number"
                ? { expectedGeneration: body.expectedGeneration }
                : {}),
            },
          ),
          requestId,
        );
        return true;
      }
    }

    return false;
  } catch (error: unknown) {
    sendError(context, error);
    return true;
  }
}
