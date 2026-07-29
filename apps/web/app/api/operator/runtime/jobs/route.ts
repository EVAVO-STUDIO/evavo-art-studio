import { NextRequest, NextResponse } from "next/server";

import {
  isSameOriginOperatorRequest,
  operatorErrorResponse,
  operatorResponse,
  readBoundedOperatorJson,
  requestOperatorApi,
} from "../../../../../lib/operator-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function query(request: NextRequest): string {
  const output = new URLSearchParams();
  for (const key of ["state", "queue", "kind", "limit"] as const) {
    const value = request.nextUrl.searchParams.get(key)?.trim();
    if (value) output.set(key, value.slice(0, 1_024));
  }
  const encoded = output.toString();
  return encoded ? `?${encoded}` : "";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return requestOperatorApi(request, `/v1/runtime/jobs${query(request)}`);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginOperatorRequest(request)) {
    return operatorResponse(
      {
        error: {
          code: "OPERATOR_CROSS_SITE_REJECTED",
          message: "Cross-site operator requests are not allowed.",
        },
      },
      403,
    );
  }
  try {
    return requestOperatorApi(request, "/v1/runtime/jobs", {
      method: "POST",
      body: await readBoundedOperatorJson(request),
    });
  } catch (error: unknown) {
    return operatorErrorResponse(error);
  }
}
