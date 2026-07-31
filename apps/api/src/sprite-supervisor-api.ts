import {
  SpriteSupervisorError,
  compileSpriteSupervisorWorkflow,
  spriteSupervisorProtocolSummary,
} from "@evavo/art-sprite-supervisor";

import type { ProviderApiContext } from "./provider-api.js";

const PATHS = new Set([
  "/v1/sprite-supervisor-protocol",
  "/v1/sprite-supervisors/validate",
  "/v1/sprite-supervisors/compile",
]);

export async function handleSpriteSupervisorApiRequest(
  context: ProviderApiContext,
): Promise<boolean> {
  if (!PATHS.has(context.url.pathname)) return false;
  const { request, response, url, requestId } = context;
  try {
    if (
      request.method === "GET" &&
      url.pathname === "/v1/sprite-supervisor-protocol"
    ) {
      context.writeJson(
        response,
        200,
        spriteSupervisorProtocolSummary(),
        requestId,
      );
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/sprite-supervisors/validate" ||
        url.pathname === "/v1/sprite-supervisors/compile")
    ) {
      const body = await context.readJsonBody(
        request,
        context.maximumBodyBytes,
      );
      const workflow = compileSpriteSupervisorWorkflow(body);
      if (url.pathname === "/v1/sprite-supervisors/validate") {
        context.writeJson(response, 200, workflow.request, requestId);
        return true;
      }
      context.writeJson(
        response,
        200,
        {
          schemaVersion: "1.0",
          workflow,
          executionBoundary:
            "This route validates and compiles a root durable job. It does not submit runtime work, call a provider, read project artifacts, promote an asset, execute a shell or deploy a project.",
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
          message: "Method is not allowed for this sprite-supervisor route.",
        },
      },
      requestId,
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof SpriteSupervisorError) {
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
