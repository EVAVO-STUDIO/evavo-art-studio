import { NextRequest, NextResponse } from "next/server";

import {
  operatorArtifactPath,
  requestOperatorApi,
} from "../../../../../lib/operator-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: Readonly<{ params: Promise<Readonly<{ artifactId: string }>> }>,
): Promise<NextResponse> {
  const { artifactId } = await context.params;
  const verify = request.nextUrl.searchParams.get("verify") === "true";
  return requestOperatorApi(
    request,
    operatorArtifactPath(artifactId, verify),
  );
}
