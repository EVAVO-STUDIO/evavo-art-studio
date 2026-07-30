import type { IncomingMessage, ServerResponse } from "node:http";

import {
  CandidateSelectionError,
  promotionRequestSha256,
  selectionProtocolSummary,
  selectionRequestSha256,
  validateCandidatePromotionRequest,
  validateCandidateSelectionRequest,
} from "@evavo/art-selection";

import { handleSpriteFamilyApiRequest } from "./sprite-family-api.js";

export interface SelectionApiContext {
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

function selectionPath(pathname: string): boolean {
  return new Set([
    "/v1/selection-protocol",
    "/v1/selections/validate",
    "/v1/selections/compile",
    "/v1/promotions/validate",
    "/v1/promotions/compile",
  ]).has(pathname);
}

export async function handleSelectionApiRequest(
  context: SelectionApiContext,
): Promise<boolean> {
  if (await handleSpriteFamilyApiRequest(context)) return true;
  if (!selectionPath(context.url.pathname)) return false;
  const { request, response, url, requestId } = context;
  try {
    if (request.method === "GET" && url.pathname === "/v1/selection-protocol") {
      context.writeJson(response, 200, selectionProtocolSummary(), requestId);
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/selections/validate" ||
        url.pathname === "/v1/selections/compile")
    ) {
      const selection = validateCandidateSelectionRequest(
        await context.readJsonBody(request, context.maximumBodyBytes),
      );
      if (url.pathname === "/v1/selections/validate") {
        context.writeJson(response, 200, selection, requestId);
        return true;
      }
      context.writeJson(
        response,
        200,
        {
          schemaVersion: "1.0",
          request: selection,
          requestSha256: selectionRequestSha256(selection),
          executionMode: "durable-worker-only",
          runtimeJob: {
            queue: "selection",
            kind: "art.candidate.select",
            idempotencyKey: selection.selectionId,
            payload: selection,
            inputArtifacts: [
              selection.referenceArtifactId,
              ...selection.candidateArtifactIds,
              ...selection.externalEvidenceArtifactIds,
            ],
            requiredCapabilities: ["selection.compare", "evidence.bundle"],
            maximumAttempts: 1,
            leaseDurationMs: 120_000,
            timeoutMs: 900_000,
          },
        },
        requestId,
      );
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/promotions/validate" ||
        url.pathname === "/v1/promotions/compile")
    ) {
      const promotion = validateCandidatePromotionRequest(
        await context.readJsonBody(request, context.maximumBodyBytes),
      );
      if (url.pathname === "/v1/promotions/validate") {
        context.writeJson(response, 200, promotion, requestId);
        return true;
      }
      context.writeJson(
        response,
        200,
        {
          schemaVersion: "1.0",
          request: promotion,
          requestSha256: promotionRequestSha256(promotion),
          executionMode: "durable-worker-only",
          runtimeJob: {
            queue: "selection",
            kind: "art.candidate.promote",
            idempotencyKey: promotion.promotionId,
            payload: promotion,
            inputArtifacts: [
              promotion.selectionEvidenceArtifactId,
              promotion.candidateArtifactId,
            ],
            requiredCapabilities: [
              "selection.promote",
              "artifacts.store",
              "evidence.bundle",
            ],
            maximumAttempts: 1,
            leaseDurationMs: 60_000,
            timeoutMs: 300_000,
          },
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
          message: "Method is not allowed for this selection contract route.",
        },
      },
      requestId,
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof CandidateSelectionError) {
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
