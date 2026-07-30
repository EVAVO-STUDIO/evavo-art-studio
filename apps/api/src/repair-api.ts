import type { IncomingMessage, ServerResponse } from "node:http";

import {
  RepairedFamilyPromotionError,
  RepairedFamilyRankingError,
  RepairedFamilyRevisionError,
  RepairedFamilySelectionError,
  TargetedRepairError,
  compileRepairedFamilyPromotionJob,
  compileRepairedFamilyRankingJob,
  compileRepairedFamilyRevisionJob,
  compileRepairedFamilySelectionJob,
  repairedFamilyPromotionProtocolSummary,
  repairedFamilyRankingProtocolSummary,
  repairedFamilyRevisionProtocolSummary,
  repairedFamilySelectionProtocolSummary,
  targetedRepairProtocolSummary,
  targetedRepairRequestSha256,
  validateRepairedFamilyPromotionRequest,
  validateRepairedFamilyRankingRequest,
  validateRepairedFamilyRevisionRequest,
  validateRepairedFamilySelectionRequest,
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
    "/v1/repair-revision-protocol",
    "/v1/repair-revisions/validate",
    "/v1/repair-revisions/compile",
    "/v1/repair-revision-selection-protocol",
    "/v1/repair-revision-selections/validate",
    "/v1/repair-revision-selections/compile",
    "/v1/repair-revision-ranking-protocol",
    "/v1/repair-revision-rankings/validate",
    "/v1/repair-revision-rankings/compile",
    "/v1/repair-revision-promotion-protocol",
    "/v1/repair-revision-promotions/validate",
    "/v1/repair-revision-promotions/compile",
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
      request.method === "GET" &&
      url.pathname === "/v1/repair-revision-protocol"
    ) {
      context.writeJson(
        response,
        200,
        repairedFamilyRevisionProtocolSummary(),
        requestId,
      );
      return true;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/v1/repair-revision-selection-protocol"
    ) {
      context.writeJson(
        response,
        200,
        repairedFamilySelectionProtocolSummary(),
        requestId,
      );
      return true;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/v1/repair-revision-ranking-protocol"
    ) {
      context.writeJson(
        response,
        200,
        repairedFamilyRankingProtocolSummary(),
        requestId,
      );
      return true;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/v1/repair-revision-promotion-protocol"
    ) {
      context.writeJson(
        response,
        200,
        repairedFamilyPromotionProtocolSummary(),
        requestId,
      );
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/repair-revision-promotions/validate" ||
        url.pathname === "/v1/repair-revision-promotions/compile")
    ) {
      const promotion = validateRepairedFamilyPromotionRequest(
        await context.readJsonBody(request, context.maximumBodyBytes),
      );
      context.writeJson(
        response,
        200,
        url.pathname === "/v1/repair-revision-promotions/validate"
          ? promotion
          : compileRepairedFamilyPromotionJob(promotion),
        requestId,
      );
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/repair-revision-rankings/validate" ||
        url.pathname === "/v1/repair-revision-rankings/compile")
    ) {
      const ranking = validateRepairedFamilyRankingRequest(
        await context.readJsonBody(request, context.maximumBodyBytes),
      );
      context.writeJson(
        response,
        200,
        url.pathname === "/v1/repair-revision-rankings/validate"
          ? ranking
          : compileRepairedFamilyRankingJob(ranking),
        requestId,
      );
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/repair-revision-selections/validate" ||
        url.pathname === "/v1/repair-revision-selections/compile")
    ) {
      const bridge = validateRepairedFamilySelectionRequest(
        await context.readJsonBody(request, context.maximumBodyBytes),
      );
      context.writeJson(
        response,
        200,
        url.pathname === "/v1/repair-revision-selections/validate"
          ? bridge
          : compileRepairedFamilySelectionJob(bridge),
        requestId,
      );
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/repair-revisions/validate" ||
        url.pathname === "/v1/repair-revisions/compile")
    ) {
      const body = await context.readJsonBody(
        request,
        context.maximumBodyBytes,
      );
      const revision = validateRepairedFamilyRevisionRequest(body);
      context.writeJson(
        response,
        200,
        url.pathname === "/v1/repair-revisions/validate"
          ? revision
          : compileRepairedFamilyRevisionJob(revision),
        requestId,
      );
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
    if (
      error instanceof TargetedRepairError ||
      error instanceof RepairedFamilyRevisionError ||
      error instanceof RepairedFamilySelectionError ||
      error instanceof RepairedFamilyRankingError ||
      error instanceof RepairedFamilyPromotionError
    ) {
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
