import {
  SpritePlannerError,
  compileSpritePlanJob,
  compileSpriteProductionPlan,
} from "@evavo/art-sprite-planner";
import type { NextResponse } from "next/server";

import {
  errorResponse,
  isCrossSiteRequest,
  jsonResponse,
  readBoundedJson,
  requestId,
} from "../quality/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MAXIMUM_REQUEST_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const id = requestId();
  if (isCrossSiteRequest(request)) {
    return jsonResponse(
      {
        error: {
          code: "SPRITE_PLAN_CROSS_SITE_REJECTED",
          message: "Cross-site sprite planning is not allowed.",
        },
      },
      403,
      id,
    );
  }

  try {
    const body = await readBoundedJson(request, MAXIMUM_REQUEST_BYTES);
    return jsonResponse(
      {
        schemaVersion: "1.0",
        compiledPlan: compileSpriteProductionPlan(body),
        compiledJob: compileSpritePlanJob(body),
        executionBoundary:
          "Browser planning is deterministic and provider-free. Frame and layer generation, mastering, family verification, selection, promotion and packaging remain separate governed stages.",
      },
      200,
      id,
    );
  } catch (error: unknown) {
    if (error instanceof SpritePlannerError) {
      return jsonResponse(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        },
        422,
        id,
      );
    }
    return errorResponse(error, id);
  }
}
