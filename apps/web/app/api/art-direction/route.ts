import {
  ArtDirectionError,
  compileArtDirectionContract,
  compileArtDirectionJob,
} from "@evavo/art-direction";
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
export const maxDuration = 15;

const MAXIMUM_REQUEST_BYTES = 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const id = requestId();
  if (isCrossSiteRequest(request)) {
    return jsonResponse(
      {
        error: {
          code: "ART_DIRECTION_CROSS_SITE_REJECTED",
          message: "Cross-site art-direction compilation is not allowed.",
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
        compiledContract: compileArtDirectionContract(body),
        compiledJob: compileArtDirectionJob(body),
        executionBoundary:
          "Browser compilation is deterministic and provider-free. Generation, mastering, QA, family verification, selection and promotion remain separate governed stages.",
      },
      200,
      id,
    );
  } catch (error: unknown) {
    if (error instanceof ArtDirectionError) {
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
