import type { IncomingMessage, ServerResponse } from "node:http";

import {
  ProviderError,
  compileProviderCandidateContract,
  providerProtocolSummary,
  validateProviderCandidateRequest,
} from "@evavo/art-providers";

import { handleArtDirectionApiRequest } from "./art-direction-api.js";
import { handleSelectionApiRequest } from "./selection-api.js";

export interface ProviderApiContext {
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

function providerPath(pathname: string): boolean {
  return (
    pathname === "/v1/provider-protocol" ||
    pathname === "/v1/providers/validate" ||
    pathname === "/v1/providers/compile"
  );
}

export async function handleProviderApiRequest(
  context: ProviderApiContext,
): Promise<boolean> {
  if (await handleArtDirectionApiRequest(context)) return true;
  if (await handleSelectionApiRequest(context)) return true;
  if (!providerPath(context.url.pathname)) return false;
  const { request, response, url, requestId } = context;
  try {
    if (request.method === "GET" && url.pathname === "/v1/provider-protocol") {
      context.writeJson(response, 200, providerProtocolSummary(), requestId);
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/providers/validate" ||
        url.pathname === "/v1/providers/compile")
    ) {
      const input = await context.readJsonBody(
        request,
        context.maximumBodyBytes,
      );
      if (url.pathname === "/v1/providers/validate") {
        context.writeJson(
          response,
          200,
          validateProviderCandidateRequest(input),
          requestId,
        );
        return true;
      }
      context.writeJson(
        response,
        200,
        compileProviderCandidateContract(input),
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
          message: "Method is not allowed for this provider contract route.",
        },
      },
      requestId,
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof ProviderError) {
      context.writeJson(
        response,
        422,
        { error: { code: error.code, message: error.message } },
        requestId,
      );
      return true;
    }
    throw error;
  }
}
