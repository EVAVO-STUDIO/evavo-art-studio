import type { NextResponse } from "next/server";
import {
  analyseDecodedSpriteFrame,
  decodeSpriteFrame,
} from "@evavo/art-quality";

import {
  FRAME_MAXIMUM_PIXELS,
  FRAME_MAXIMUM_REQUEST_BYTES,
  FRAME_MAXIMUM_SOURCE_BYTES,
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
export const maxDuration = 30;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request): Promise<NextResponse> {
  const id = requestId();
  if (isCrossSiteRequest(request)) {
    return jsonResponse(
      { error: { code: "SPRITE_FRAME_QA_CROSS_SITE_REJECTED", message: "Cross-site frame inspection is not allowed." } },
      403,
      id,
    );
  }
  if (!browserQaEnabled()) {
    return jsonResponse(
      { error: { code: "SPRITE_FRAME_QA_NOT_ENABLED", message: "Browser sprite QA is not enabled for this production deployment." } },
      503,
      id,
    );
  }

  try {
    const body = await readBoundedJson(request, FRAME_MAXIMUM_REQUEST_BYTES);
    if (!isRecord(body) || !("expectations" in body)) {
      return jsonResponse(
        { error: { code: "SPRITE_FRAME_REQUEST_INVALID", message: "imageBase64 and expectations are required." } },
        422,
        id,
      );
    }
    const image = strictBase64(body.imageBase64, FRAME_MAXIMUM_SOURCE_BYTES);
    const decoded = await decodeSpriteFrame(image, {
      maximumInputBytes: FRAME_MAXIMUM_SOURCE_BYTES,
      maximumPixels: FRAME_MAXIMUM_PIXELS,
    });
    return jsonResponse(analyseDecodedSpriteFrame(decoded, body.expectations), 200, id);
  } catch (error: unknown) {
    return errorResponse(error, id);
  }
}
