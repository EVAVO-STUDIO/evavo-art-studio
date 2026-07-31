import {
  ArtDirectionError,
  artDirectionProtocolSummary,
  compileArtDirectionContract,
  compileArtDirectionJob,
  listArtDirectionOutputProfiles,
  listArtDirectionPresets,
  validateArtDirectionCompileRequest,
} from "@evavo/art-direction";

import type { ProviderApiContext } from "./provider-api.js";

const PATHS = new Set([
  "/v1/art-direction-protocol",
  "/v1/art-direction-presets",
  "/v1/art-direction-output-profiles",
  "/v1/art-directions/validate",
  "/v1/art-directions/compile",
]);

export async function handleArtDirectionApiRequest(
  context: ProviderApiContext,
): Promise<boolean> {
  if (!PATHS.has(context.url.pathname)) return false;
  const { request, response, url, requestId } = context;
  try {
    if (request.method === "GET") {
      if (url.pathname === "/v1/art-direction-protocol") {
        context.writeJson(response, 200, artDirectionProtocolSummary(), requestId);
        return true;
      }
      if (url.pathname === "/v1/art-direction-presets") {
        context.writeJson(
          response,
          200,
          { schemaVersion: "1.0", presets: listArtDirectionPresets() },
          requestId,
        );
        return true;
      }
      if (url.pathname === "/v1/art-direction-output-profiles") {
        context.writeJson(
          response,
          200,
          {
            schemaVersion: "1.0",
            outputProfiles: listArtDirectionOutputProfiles(),
          },
          requestId,
        );
        return true;
      }
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/art-directions/validate" ||
        url.pathname === "/v1/art-directions/compile")
    ) {
      const body = await context.readJsonBody(
        request,
        context.maximumBodyBytes,
      );
      if (url.pathname === "/v1/art-directions/validate") {
        context.writeJson(
          response,
          200,
          validateArtDirectionCompileRequest(body),
          requestId,
        );
        return true;
      }
      context.writeJson(
        response,
        200,
        {
          schemaVersion: "1.0",
          compiledContract: compileArtDirectionContract(body),
          compiledJob: compileArtDirectionJob(body),
          executionBoundary:
            "This route does not call a provider, inspect artifacts, run a worker or approve an asset.",
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
          message: "Method is not allowed for this art-direction route.",
        },
      },
      requestId,
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof ArtDirectionError) {
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
