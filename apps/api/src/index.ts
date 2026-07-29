import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LocalArtifactStore,
  type ArtifactStore,
} from "@evavo/art-artifacts";
import { validateArtBrief } from "@evavo/art-contracts";
import { CAPABILITY_CATALOG, createProductionPlan } from "@evavo/art-core";
import {
  GodotSpritePackageError,
  writeGodotSpriteFramesImporter,
} from "@evavo/art-godot";
import {
  SpriteAtlasInputError,
  buildSpriteAtlasPackage,
} from "@evavo/art-media";
import {
  SpriteQualityInputError,
  analyseDecodedSpriteFrame,
  analyseSpriteSequenceManifestFile,
  decodeSpriteFrame,
} from "@evavo/art-quality";
import { assertPathWithinAllowedRoots, inspectRepository } from "@evavo/art-repo-inspector";
import {
  LocalRuntimeRepository,
  type RuntimeRepository,
} from "@evavo/art-runtime";

import { handleRuntimeApiRequest } from "./runtime-api.js";

export interface ArtStudioApiOptions {
  readonly allowedOrigins?: readonly string[];
  readonly allowedRepositoryRoots?: readonly string[];
  readonly maximumBodyBytes?: number;
  readonly maximumImageBytes?: number;
  readonly maximumImagePixels?: number;
  readonly allowWrites?: boolean;
  readonly writeToken?: string | undefined;
  readonly runtime?: RuntimeRepository | undefined;
  readonly artifacts?: ArtifactStore | undefined;
  readonly runtimeRoot?: string | undefined;
  readonly artifactRoot?: string | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const writeJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
  requestId: string,
): void => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  });
  response.end(`${JSON.stringify(body)}\n`);
};

async function readJsonBody(
  request: IncomingMessage,
  maximumBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) {
      throw new Error("Request body exceeds the configured limit.");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: readonly string[],
): void {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    response.setHeader(
      "access-control-allow-headers",
      "content-type,authorization,x-evavo-launch,x-evavo-art-write-token,x-evavo-actor",
    );
  }
}

function strictBase64(value: unknown, maximumBytes: number): Buffer {
  if (typeof value !== "string" || !value.trim()) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_BASE64_REQUIRED",
      "imageBase64 must be a non-empty base64 string.",
    );
  }
  const compact = value.replace(/\s+/g, "");
  if (
    compact.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)
  ) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_BASE64_INVALID",
      "imageBase64 is not valid padded base64.",
    );
  }
  const buffer = Buffer.from(compact, "base64");
  if (buffer.length > maximumBytes) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_INPUT_TOO_LARGE",
      `Decoded image exceeds ${maximumBytes} bytes.`,
    );
  }
  return buffer;
}

function qualityError(
  response: ServerResponse,
  requestId: string,
  error: unknown,
): void {
  if (error instanceof SpriteQualityInputError) {
    writeJson(
      response,
      422,
      { error: { code: error.code, message: error.message } },
      requestId,
    );
    return;
  }
  throw error;
}

function deliveryError(
  response: ServerResponse,
  requestId: string,
  error: unknown,
): void {
  if (
    error instanceof SpriteAtlasInputError ||
    error instanceof GodotSpritePackageError
  ) {
    writeJson(
      response,
      422,
      { error: { code: error.code, message: error.message } },
      requestId,
    );
    return;
  }
  throw error;
}

function normalizeWriteToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  if (!token) return undefined;
  const bytes = Buffer.byteLength(token, "utf8");
  return bytes >= 32 && bytes <= 1024 ? token : undefined;
}

function requestWriteToken(request: IncomingMessage): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  const header = request.headers["x-evavo-art-write-token"];
  if (Array.isArray(header)) return header[0]?.trim();
  return header?.trim();
}

function writeTokenMatches(
  request: IncomingMessage,
  configured: string,
): boolean {
  const supplied = requestWriteToken(request);
  if (!supplied) return false;
  const configuredDigest = createHash("sha256")
    .update(configured, "utf8")
    .digest();
  const suppliedDigest = createHash("sha256")
    .update(supplied, "utf8")
    .digest();
  return timingSafeEqual(configuredDigest, suppliedDigest);
}

function configuredRoot(value: string | undefined): string | undefined {
  const root = value?.trim();
  return root ? path.resolve(root) : undefined;
}

export function createArtStudioApiServer(
  options: ArtStudioApiOptions = {},
): Server {
  const allowedOrigins = options.allowedOrigins ?? [];
  const allowedRepositoryRoots = options.allowedRepositoryRoots ?? [process.cwd()];
  const maximumBodyBytes = options.maximumBodyBytes ?? 24 * 1024 * 1024;
  const maximumImageBytes = options.maximumImageBytes ?? 16 * 1024 * 1024;
  const maximumImagePixels = options.maximumImagePixels ?? 16_777_216;
  const allowWrites = options.allowWrites ?? false;
  const writeToken = normalizeWriteToken(options.writeToken);
  const writesReady = allowWrites && writeToken !== undefined;
  const runtimeRoot = configuredRoot(options.runtimeRoot);
  const artifactRoot = configuredRoot(options.artifactRoot);
  const runtime =
    options.runtime ??
    (runtimeRoot ? new LocalRuntimeRepository({ root: runtimeRoot }) : undefined);
  const artifacts =
    options.artifacts ??
    (artifactRoot ? new LocalArtifactStore({ root: artifactRoot }) : undefined);

  return createServer(async (request, response) => {
    const requestId = randomUUID();
    applyCors(request, response, allowedOrigins);
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "x-request-id": requestId });
      response.end();
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const controlAuthorized =
        writeToken !== undefined && writeTokenMatches(request, writeToken);
      if (
        await handleRuntimeApiRequest({
          request,
          response,
          url,
          requestId,
          maximumBodyBytes,
          runtime,
          artifacts,
          accessReady: writesReady,
          accessAuthorized: controlAuthorized,
          readJsonBody,
          writeJson,
        })
      ) {
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(
          response,
          200,
          {
            status: "ok",
            service: "evavo-art-studio-api",
            version: "0.1.0",
            writesEnabled: writesReady,
            runtimeConfigured: runtime !== undefined,
            artifactStoreConfigured: artifacts !== undefined,
          },
          requestId,
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/capabilities") {
        writeJson(
          response,
          200,
          { schemaVersion: "1.0", capabilities: CAPABILITY_CATALOG },
          requestId,
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/plans") {
        const body = await readJsonBody(request, maximumBodyBytes);
        const validation = validateArtBrief(body);
        if (!validation.success) {
          writeJson(
            response,
            422,
            { error: { code: "INVALID_ART_BRIEF", issues: validation.issues } },
            requestId,
          );
          return;
        }
        writeJson(response, 201, createProductionPlan(validation.value), requestId);
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/repositories/inspect"
      ) {
        const body = await readJsonBody(request, maximumBodyBytes);
        if (!isRecord(body) || typeof body.path !== "string") {
          writeJson(
            response,
            422,
            {
              error: {
                code: "INVALID_REPOSITORY_REQUEST",
                message: "path is required.",
              },
            },
            requestId,
          );
          return;
        }
        const repositoryPath = assertPathWithinAllowedRoots(
          body.path,
          allowedRepositoryRoots,
        );
        writeJson(
          response,
          200,
          await inspectRepository(repositoryPath),
          requestId,
        );
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/quality/sprite-frame"
      ) {
        const body = await readJsonBody(request, maximumBodyBytes);
        if (!isRecord(body) || !("expectations" in body)) {
          writeJson(
            response,
            422,
            {
              error: {
                code: "SPRITE_FRAME_REQUEST_INVALID",
                message: "imageBase64 and expectations are required.",
              },
            },
            requestId,
          );
          return;
        }
        try {
          const image = strictBase64(body.imageBase64, maximumImageBytes);
          const decoded = await decodeSpriteFrame(image, {
            maximumInputBytes: maximumImageBytes,
            maximumPixels: maximumImagePixels,
          });
          writeJson(
            response,
            200,
            analyseDecodedSpriteFrame(decoded, body.expectations),
            requestId,
          );
        } catch (error: unknown) {
          qualityError(response, requestId, error);
        }
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/quality/sprite-sequence"
      ) {
        const body = await readJsonBody(request, maximumBodyBytes);
        if (!isRecord(body) || typeof body.manifestPath !== "string") {
          writeJson(
            response,
            422,
            {
              error: {
                code: "SPRITE_SEQUENCE_REQUEST_INVALID",
                message: "manifestPath is required.",
              },
            },
            requestId,
          );
          return;
        }
        try {
          const manifestPath = assertPathWithinAllowedRoots(
            body.manifestPath,
            allowedRepositoryRoots,
          );
          const report = await analyseSpriteSequenceManifestFile(manifestPath, {
            allowedRoots: allowedRepositoryRoots,
            maximumInputBytes: maximumImageBytes,
            maximumPixels: maximumImagePixels,
          });
          writeJson(response, 200, report, requestId);
        } catch (error: unknown) {
          qualityError(response, requestId, error);
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/atlases/build") {
        if (!allowWrites) {
          writeJson(
            response,
            403,
            {
              error: {
                code: "ART_STUDIO_WRITES_DISABLED",
                message: "Atlas writes require EVAVO_ART_ALLOW_WRITES=true.",
              },
            },
            requestId,
          );
          return;
        }
        if (!writeToken) {
          writeJson(
            response,
            503,
            {
              error: {
                code: "ART_STUDIO_WRITE_AUTH_UNAVAILABLE",
                message:
                  "Atlas writes require a server-side write token of at least 32 bytes.",
              },
            },
            requestId,
          );
          return;
        }
        if (!controlAuthorized) {
          writeJson(
            response,
            401,
            {
              error: {
                code: "ART_STUDIO_WRITE_UNAUTHORIZED",
                message: "A valid atlas write token is required.",
              },
            },
            requestId,
          );
          return;
        }

        const body = await readJsonBody(request, maximumBodyBytes);
        if (
          !isRecord(body) ||
          typeof body.manifestPath !== "string" ||
          typeof body.outputDirectory !== "string"
        ) {
          writeJson(
            response,
            422,
            {
              error: {
                code: "SPRITE_ATLAS_BUILD_REQUEST_INVALID",
                message: "manifestPath and outputDirectory are required.",
              },
            },
            requestId,
          );
          return;
        }
        try {
          const manifestPath = assertPathWithinAllowedRoots(
            body.manifestPath,
            allowedRepositoryRoots,
          );
          const outputDirectory = assertPathWithinAllowedRoots(
            body.outputDirectory,
            allowedRepositoryRoots,
          );
          const atlas = await buildSpriteAtlasPackage(
            manifestPath,
            outputDirectory,
            {
              allowedRoots: allowedRepositoryRoots,
              maximumInputBytes: maximumImageBytes,
              maximumPixels: maximumImagePixels,
            },
          );
          const godotProjectPath =
            typeof body.godotProjectPath === "string"
              ? assertPathWithinAllowedRoots(
                  body.godotProjectPath,
                  allowedRepositoryRoots,
                )
              : undefined;
          const godot = godotProjectPath
            ? await writeGodotSpriteFramesImporter(atlas, godotProjectPath)
            : undefined;
          writeJson(
            response,
            201,
            {
              schemaVersion: "1.0",
              atlas,
              ...(godot ? { godot } : {}),
              executionAvailable: false,
            },
            requestId,
          );
        } catch (error: unknown) {
          deliveryError(response, requestId, error);
        }
        return;
      }
      writeJson(
        response,
        404,
        { error: { code: "NOT_FOUND", message: "Route not found." } },
        requestId,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(
        response,
        500,
        { error: { code: "ART_STUDIO_API_ERROR", message } },
        requestId,
      );
    }
  });
}

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntryPoint) {
  const port = Number(process.env.PORT ?? "4100");
  const host = process.env.HOST ?? "127.0.0.1";
  const roots = envList("EVAVO_ART_ALLOWED_ROOTS");
  const server = createArtStudioApiServer({
    allowedOrigins: envList("EVAVO_ART_ALLOWED_ORIGINS"),
    allowedRepositoryRoots: roots.length > 0 ? roots : [process.cwd()],
    allowWrites: process.env.EVAVO_ART_ALLOW_WRITES === "true",
    writeToken: process.env.EVAVO_ART_WRITE_TOKEN,
    runtimeRoot: process.env.EVAVO_ART_RUNTIME_ROOT,
    artifactRoot: process.env.EVAVO_ART_ARTIFACT_ROOT,
  });
  server.listen(port, host, () => {
    process.stdout.write(
      `${JSON.stringify({
        service: "evavo-art-studio-api",
        status: "listening",
        host,
        port,
      })}\n`,
    );
  });
}
