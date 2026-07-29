import { NextRequest, NextResponse } from "next/server";

import { requestOperatorApi } from "../../../../../lib/operator-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get("after")?.trim();
  const after = raw && /^\d{1,16}$/.test(raw) ? raw : "0";
  return requestOperatorApi(request, `/v1/runtime/events?after=${after}`);
}
