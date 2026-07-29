import { NextRequest, NextResponse } from "next/server";

import {
  operatorJobPath,
  requestOperatorApi,
} from "../../../../../../lib/operator-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: Readonly<{ params: Promise<Readonly<{ jobId: string }>> }>,
): Promise<NextResponse> {
  const { jobId } = await context.params;
  return requestOperatorApi(request, operatorJobPath(jobId));
}
