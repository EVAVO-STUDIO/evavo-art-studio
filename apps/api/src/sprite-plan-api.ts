import {
  SpritePlannerError,
  compileSpritePlanJob,
  compileSpriteProductionPlan,
  spritePlannerProtocolSummary,
  validateSpritePlanCompileRequest,
} from "@evavo/art-sprite-planner";

import type { ProviderApiContext } from "./provider-api.js";

const PATHS = new Set([
  "/v1/sprite-plan-protocol",
  "/v1/sprite-plans/validate",
  "/v1/sprite-plans/compile",
]);

export async function handleSpritePlanApiRequest(
  context: ProviderApiContext,
): Promise<boolean> {
  if (!PATHS.has(context.url.pathname)) return false;
  const { request, response, url, requestId } = context;
  try {
    if (request.method === "GET" && url.pathname === "/v1/sprite-plan-protocol") {
      context.writeJson(response, 200, spritePlannerProtocolSummary(), requestId);
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/sprite-plans/validate" ||
        url.pathname === "/v1/sprite-plans/compile")
    ) {
      const body = await context.readJsonBody(request, context.maximumBodyBytes);
      if (url.pathname === "/v1/sprite-plans/validate") {
        context.writeJson(response, 200, validateSpritePlanCompileRequest(body), requestId);
        return true;
      }
      context.writeJson(
        response,
        200,
        {
          schemaVersion: "1.0",
          compiledPlan: compileSpriteProductionPlan(body),
          compiledJob: compileSpritePlanJob(body),
          executionBoundary:
            "This route only compiles coverage, frames, layers, sheets, atlases and Godot metadata. It does not generate images, inspect artifacts, execute workers or approve assets.",
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
          message: "Method is not allowed for this sprite-planning route.",
        },
      },
      requestId,
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof SpritePlannerError) {
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
