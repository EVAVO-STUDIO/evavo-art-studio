import type { IncomingMessage, ServerResponse } from "node:http";

import {
  SpriteFamilyError,
  spriteFamilyManifestSha256,
  spriteFamilyProtocolSummary,
  validateSpriteFamilyManifest,
} from "@evavo/art-sprite-family";

export interface SpriteFamilyApiContext {
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

function spriteFamilyPath(pathname: string): boolean {
  return new Set([
    "/v1/sprite-family-protocol",
    "/v1/sprite-families/validate",
    "/v1/sprite-families/compile",
  ]).has(pathname);
}

function inputArtifacts(
  manifest: ReturnType<typeof validateSpriteFamilyManifest>,
) {
  return [
    ...new Set(
      manifest.frames.flatMap((frame) => [
        ...frame.layers.map((layer) => layer.artifactId),
        ...(frame.declaredCompositeArtifactId
          ? [frame.declaredCompositeArtifactId]
          : []),
      ]),
    ),
  ].sort();
}

export async function handleSpriteFamilyApiRequest(
  context: SpriteFamilyApiContext,
): Promise<boolean> {
  if (!spriteFamilyPath(context.url.pathname)) return false;
  const { request, response, url, requestId } = context;
  try {
    if (
      request.method === "GET" &&
      url.pathname === "/v1/sprite-family-protocol"
    ) {
      context.writeJson(response, 200, spriteFamilyProtocolSummary(), requestId);
      return true;
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/v1/sprite-families/validate" ||
        url.pathname === "/v1/sprite-families/compile")
    ) {
      const manifest = validateSpriteFamilyManifest(
        await context.readJsonBody(request, context.maximumBodyBytes),
      );
      if (url.pathname === "/v1/sprite-families/validate") {
        context.writeJson(response, 200, manifest, requestId);
        return true;
      }
      const manifestSha256 = spriteFamilyManifestSha256(manifest);
      context.writeJson(
        response,
        200,
        {
          schemaVersion: "1.0",
          manifest,
          manifestSha256,
          executionMode: "durable-worker-only",
          runtimeJob: {
            queue: "selection",
            kind: "sprite.family.verify",
            idempotencyKey: `sprite-family:${manifest.familyId}:${manifestSha256}`,
            payload: manifest,
            inputArtifacts: inputArtifacts(manifest),
            requiredCapabilities: [
              "sprite.family.verify",
              "media.layer-compose",
              "selection.compare",
              "evidence.bundle",
            ],
            maximumAttempts: 1,
            leaseDurationMs: 120_000,
            timeoutMs: 1_800_000,
            labels: {
              familyId: manifest.familyId,
              stage: "sprite-family-verification",
            },
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
          message: "Method is not allowed for this sprite-family route.",
        },
      },
      requestId,
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof SpriteFamilyError) {
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
