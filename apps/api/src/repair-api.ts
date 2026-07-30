import type { IncomingMessage, ServerResponse } from "node:http";

import {
  TargetedRepairError,
  targetedRepairProtocolSummary,
  targetedRepairRequestSha256,
  validateTargetedRepairRequest,
} from "@evavo/art-repair";

export interface RepairApiContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly requestId: string;
  readonly maximumBodyBytes: number;
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

function pathHandled(pathname: string): boolean {
  return new Set([
    "/v1/repair-protocol",
    "/v1/repairs/validate",
    "/v1/repairs/compile",
  ]).has(pathname);
}

function runtimeJob(request: ReturnType<typeof validateTargetedRepairRequest>) {
  const inputArtifacts = [
    request.familyEvidenceArtifactId,
    ...(request.maskArtifactId ? [request.maskArtifactId] : []),
    ...request.references.map((reference) => reference.artifactId),
  ];
  return {
    queue: "selection",
    kind: "art.repair.plan",
    idempotencyKey: request.repairId,
    payload: request,
    inputArtifacts: [...new Set(inputArtifacts)].sort(),
    requiredCapabilities: [
      "repair.plan",
      "artifacts.store",
      "evidence.bundle",
    ],
    maximumAttempts: 1,
    leaseDurationMs: 60_000,
    timeoutMs: 300_000,
    labels: {
      repairId: request.repairId,
      familyEvidenceArtifactId: request.familyEvidenceArtifactId,
      frameId: request.target.frameId,
      ...(request.target.layerId ? { layerId: request.target.layerId } : {}),
    },
  } as const;
}

export async function handleRepairApiRequest(
  context: RepairApiContext,
): Promise<boolean> {
  if (!pathHandled(context.url.pathname)) return false;
  const { request, response, url, requestId } = context;
  try {
    if (request.method === "GET" && url.pathname === "/v1/repair-protocol") {
      context.writeJson(response, 200, targetedRepairProtocolSummary(), requestId);
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/repairs/validate" ||
        url.pathname === "/v1/repairs/compile")
    ) {
      const repair = validateTargetedRepairRequest(
        await context.readJsonBody(request, context.maximumBodyBytes),
      );
      if (url.pathname === "/v1/repairs/validate") {
        context.writeJson(response, 200, repair, requestId);
        return true;
      }
      context.writeJson(
        response,
        200,
        {
          schemaVersion: "1.0",
          request: repair,
          requestSha256: targetedRepairRequestSha256(repair),
          executionMode: "durable-worker-only",
          runtimeJob: runtimeJob(repair),
        },
        requestId,
      );
      return true;
    }
    context.writeJson(
      response,
      405,
      {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Method is not allowed for this repair contract route.",
        },
      },
      requestId,
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof TargetedRepairError) {
      context.writeJson(
        response,
        422,
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        },
        requestId,
      );
      return true;
    }
    throw error;
  }
}
