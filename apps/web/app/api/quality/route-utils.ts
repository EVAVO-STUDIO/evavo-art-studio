import { randomUUID } from "node:crypto";

import { SpriteQualityInputError } from "@evavo/art-quality";
import { NextResponse } from "next/server";

export const FRAME_MAXIMUM_SOURCE_BYTES = 16 * 1024 * 1024;
export const FRAME_MAXIMUM_PIXELS = 16_777_216;
export const FRAME_MAXIMUM_REQUEST_BYTES = 24 * 1024 * 1024;
export const SEQUENCE_MAXIMUM_FRAMES = 32;
export const SEQUENCE_MAXIMUM_FRAME_BYTES = 8 * 1024 * 1024;
export const SEQUENCE_MAXIMUM_TOTAL_IMAGE_BYTES = 64 * 1024 * 1024;
export const SEQUENCE_MAXIMUM_REQUEST_BYTES = 92 * 1024 * 1024;

export function requestId(): string {
  return randomUUID();
}

export function browserQaEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.EVAVO_ART_BROWSER_QA_ENABLED === "true";
}

export function isCrossSiteRequest(request: Request): boolean {
  return request.headers.get("sec-fetch-site") === "cross-site";
}

export function jsonResponse(body: unknown, status: number, id: string): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
      "x-request-id": id,
    },
  });
}

export async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new SpriteQualityInputError(
      "SPRITE_QUALITY_REQUEST_TOO_LARGE",
      `Request body exceeds ${maximumBytes} bytes.`,
    );
  }

  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("request limit exceeded");
      throw new SpriteQualityInputError(
        "SPRITE_QUALITY_REQUEST_TOO_LARGE",
        `Request body exceeds ${maximumBytes} bytes.`,
      );
    }
    chunks.push(next.value);
  }

  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new SpriteQualityInputError(
      "SPRITE_QUALITY_INVALID_JSON",
      "Request body must be valid JSON.",
    );
  }
}

export function strictBase64(value: unknown, maximumBytes: number): Buffer {
  if (typeof value !== "string" || !value.trim()) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_BASE64_REQUIRED",
      "imageBase64 must be a non-empty padded base64 string.",
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
  const estimatedBytes = Math.floor((compact.length * 3) / 4);
  if (estimatedBytes > maximumBytes + 2) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_INPUT_TOO_LARGE",
      `Decoded image exceeds ${maximumBytes} bytes.`,
    );
  }
  const decoded = Buffer.from(compact, "base64");
  if (!decoded.length) {
    throw new SpriteQualityInputError("SPRITE_FRAME_EMPTY", "Decoded image is empty.");
  }
  if (decoded.length > maximumBytes) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_INPUT_TOO_LARGE",
      `Decoded image exceeds ${maximumBytes} bytes.`,
    );
  }
  return decoded;
}

export function errorResponse(error: unknown, id: string): NextResponse {
  if (error instanceof SpriteQualityInputError) {
    const status = /TOO_LARGE|LIMIT|PIXEL/.test(error.code)
      ? 413
      : error.code === "SPRITE_QUALITY_INVALID_JSON"
        ? 400
        : 422;
    return jsonResponse({ error: { code: error.code, message: error.message } }, status, id);
  }
  const message = error instanceof Error ? error.message : String(error);
  return jsonResponse(
    { error: { code: "SPRITE_QUALITY_WORKBENCH_ERROR", message } },
    500,
    id,
  );
}
