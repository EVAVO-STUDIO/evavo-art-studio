import { NextRequest, NextResponse } from "next/server";

import {
  isSameOriginOperatorRequest,
  operatorErrorResponse,
  operatorJobPath,
  operatorResponse,
  readBoundedOperatorJson,
  requestOperatorApi,
} from "../../../../../../../lib/operator-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: Readonly<{
    params: Promise<Readonly<{ jobId: string; action: string }>>;
  }>,
): Promise<NextResponse> {
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
    const { jobId, action } = await context.params;
    return requestOperatorApi(request, operatorJobPath(jobId, action), {
      method: "POST",
      body: await readBoundedOperatorJson(request, 64 * 1024),
    });
  } catch (error: unknown) {
    return operatorErrorResponse(error);
  }
}
