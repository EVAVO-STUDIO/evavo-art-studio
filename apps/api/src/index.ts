import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateArtBrief } from "@evavo/art-contracts";
import { CAPABILITY_CATALOG, createProductionPlan } from "@evavo/art-core";
import { assertPathWithinAllowedRoots, inspectRepository } from "@evavo/art-repo-inspector";

export interface ArtStudioApiOptions {
  readonly allowedOrigins?: readonly string[];
  readonly allowedRepositoryRoots?: readonly string[];
  readonly maximumBodyBytes?: number;
}

const writeJson = (response: ServerResponse, status: number, body: unknown, requestId: string): void => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-request-id": requestId,
  });
  response.end(`${JSON.stringify(body)}\n`);
};

async function readJsonBody(request: IncomingMessage, maximumBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) throw new Error("Request body exceeds the configured limit.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function applyCors(request: IncomingMessage, response: ServerResponse, allowedOrigins: readonly string[]): void {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type,authorization,x-evavo-launch");
  }
}

export function createArtStudioApiServer(options: ArtStudioApiOptions = {}): Server {
  const allowedOrigins = options.allowedOrigins ?? [];
  const allowedRepositoryRoots = options.allowedRepositoryRoots ?? [process.cwd()];
  const maximumBodyBytes = options.maximumBodyBytes ?? 1_048_576;

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
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { status: "ok", service: "evavo-art-studio-api", version: "0.1.0" }, requestId);
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/capabilities") {
        writeJson(response, 200, { schemaVersion: "1.0", capabilities: CAPABILITY_CATALOG }, requestId);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/plans") {
        const body = await readJsonBody(request, maximumBodyBytes);
        const validation = validateArtBrief(body);
        if (!validation.success) {
          writeJson(response, 422, { error: { code: "INVALID_ART_BRIEF", issues: validation.issues } }, requestId);
          return;
        }
        writeJson(response, 201, createProductionPlan(validation.value), requestId);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/repositories/inspect") {
        const body = await readJsonBody(request, maximumBodyBytes);
        if (!body || typeof body !== "object" || !("path" in body) || typeof body.path !== "string") {
          writeJson(response, 422, { error: { code: "INVALID_REPOSITORY_REQUEST", message: "path is required." } }, requestId);
          return;
        }
        const repositoryPath = assertPathWithinAllowedRoots(body.path, allowedRepositoryRoots);
        writeJson(response, 200, await inspectRepository(repositoryPath), requestId);
        return;
      }
      writeJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found." } }, requestId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(response, 500, { error: { code: "ART_STUDIO_API_ERROR", message } }, requestId);
    }
  });
}

function envList(name: string): string[] {
  return (process.env[name] ?? "").split(path.delimiter).map((value) => value.trim()).filter(Boolean);
}

const isEntryPoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntryPoint) {
  const port = Number(process.env.PORT ?? "4100");
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createArtStudioApiServer({
    allowedOrigins: envList("EVAVO_ART_ALLOWED_ORIGINS"),
    allowedRepositoryRoots: envList("EVAVO_ART_ALLOWED_ROOTS").length > 0 ? envList("EVAVO_ART_ALLOWED_ROOTS") : [process.cwd()],
  });
  server.listen(port, host, () => {
    process.stdout.write(`${JSON.stringify({ service: "evavo-art-studio-api", status: "listening", host, port })}\n`);
  });
}
