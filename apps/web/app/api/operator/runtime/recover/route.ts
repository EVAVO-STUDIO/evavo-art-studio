import { NextRequest, NextResponse } from "next/server";

import {
  isSameOriginOperatorRequest,
  operatorResponse,
  requestOperatorApi,
} from "../../../../../lib/operator-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  return requestOperatorApi(request, "/v1/runtime/recover", {
    method: "POST",
    body: {},
  });
}
