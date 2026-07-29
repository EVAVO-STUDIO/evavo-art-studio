import type { NextResponse } from "next/server";
import {
  SpriteQualityInputError,
  analyseSpriteSequence,
  decodeSpriteFrame,
  validateSpriteSequenceManifest,
  type DecodedSpriteFrame,
} from "@evavo/art-quality";

import {
  FRAME_MAXIMUM_PIXELS,
  SEQUENCE_MAXIMUM_FRAME_BYTES,
  SEQUENCE_MAXIMUM_FRAMES,
  SEQUENCE_MAXIMUM_REQUEST_BYTES,
  SEQUENCE_MAXIMUM_TOTAL_IMAGE_BYTES,
  browserQaEnabled,
  errorResponse,
  isCrossSiteRequest,
  jsonResponse,
  readBoundedJson,
  requestId,
  strictBase64,
} from "../route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request): Promise<NextResponse> {
  const id = requestId();
  if (isCrossSiteRequest(request)) {
    return jsonResponse(
      { error: { code: "SPRITE_SEQUENCE_QA_CROSS_SITE_REJECTED", message: "Cross-site sequence inspection is not allowed." } },
      403,
      id,
    );
  }
  if (!browserQaEnabled()) {
    return jsonResponse(
      { error: { code: "SPRITE_SEQUENCE_QA_NOT_ENABLED", message: "Browser sprite QA is not enabled for this production deployment." } },
      503,
      id,
    );
  }

  try {
    const body = await readBoundedJson(request, SEQUENCE_MAXIMUM_REQUEST_BYTES);
    if (!isRecord(body) || !Array.isArray(body.frames)) {
      return jsonResponse(
        { error: { code: "SPRITE_SEQUENCE_REQUEST_INVALID", message: "manifest and frames are required." } },
        422,
        id,
      );
    }
    const manifest = validateSpriteSequenceManifest(body.manifest);
    if (manifest.frames.length > SEQUENCE_MAXIMUM_FRAMES) {
      throw new SpriteQualityInputError(
        "SPRITE_SEQUENCE_FRAME_LIMIT_EXCEEDED",
        `Browser sequence QA accepts at most ${SEQUENCE_MAXIMUM_FRAMES} frames.`,
      );
    }
    if (body.frames.length !== manifest.frames.length) {
      throw new SpriteQualityInputError(
        "SPRITE_SEQUENCE_FRAME_COUNT_MISMATCH",
        "Uploaded frame count must exactly match the manifest.",
      );
    }

    const encoded = new Map<string, Buffer>();
    let totalBytes = 0;
    for (const entry of body.frames) {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim()) {
        throw new SpriteQualityInputError(
          "SPRITE_SEQUENCE_FRAME_INVALID",
          "Every uploaded frame requires a non-empty id and imageBase64.",
        );
      }
      if (encoded.has(entry.id)) {
        throw new SpriteQualityInputError(
          "SPRITE_SEQUENCE_FRAME_DUPLICATE_ID",
          `Duplicate uploaded frame id: ${entry.id}`,
        );
      }
      const buffer = strictBase64(entry.imageBase64, SEQUENCE_MAXIMUM_FRAME_BYTES);
      totalBytes += buffer.length;
      if (totalBytes > SEQUENCE_MAXIMUM_TOTAL_IMAGE_BYTES) {
        throw new SpriteQualityInputError(
          "SPRITE_SEQUENCE_TOTAL_BYTES_EXCEEDED",
          `Uploaded sequence images exceed ${SEQUENCE_MAXIMUM_TOTAL_IMAGE_BYTES} bytes.`,
        );
      }
      encoded.set(entry.id, buffer);
    }

    const expectedIds = new Set(manifest.frames.map((frame) => frame.id));
    for (const frameId of encoded.keys()) {
      if (!expectedIds.has(frameId)) {
        throw new SpriteQualityInputError(
          "SPRITE_SEQUENCE_FRAME_UNDECLARED",
          `Uploaded frame ${frameId} is not declared by the manifest.`,
        );
      }
    }

    const decoded = new Map<string, DecodedSpriteFrame>();
    let cursor = 0;
    const jobs = [...encoded.entries()];
    const worker = async () => {
      while (cursor < jobs.length) {
        const next = jobs[cursor++];
        if (!next) return;
        decoded.set(
          next[0],
          await decodeSpriteFrame(next[1], {
            maximumInputBytes: SEQUENCE_MAXIMUM_FRAME_BYTES,
            maximumPixels: FRAME_MAXIMUM_PIXELS,
          }),
        );
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, () => worker()));
    return jsonResponse(await analyseSpriteSequence(manifest, decoded), 200, id);
  } catch (error: unknown) {
    return errorResponse(error, id);
  }
}
