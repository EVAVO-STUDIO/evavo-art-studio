import { NextRequest, NextResponse } from "next/server";

import {
  OPERATOR_SESSION_COOKIE,
  createOperatorSession,
  operatorAccessTokenMatches,
  operatorAuthConfiguration,
  verifyOperatorSession,
} from "../../../../lib/operator-auth";
import {
  isSameOriginOperatorRequest,
  operatorConfigurationStatus,
  operatorErrorResponse,
  operatorResponse,
  readBoundedOperatorJson,
  OperatorGatewayError,
} from "../../../../lib/operator-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function status(request: NextRequest) {
  const configuration = operatorConfigurationStatus();
  const claims = verifyOperatorSession(
    request.cookies.get(OPERATOR_SESSION_COOKIE)?.value,
  );
  return {
    ...configuration,
    authenticated: claims !== null,
    ...(claims
      ? {
          expiresAt: new Date(claims.expiresAt * 1_000).toISOString(),
          sessionId: claims.sessionId.slice(0, 12),
        }
      : {}),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
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
  return operatorResponse(status(request));
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
    const configuration = operatorAuthConfiguration();
    if (!configuration.configured) {
      throw new OperatorGatewayError(
        "OPERATOR_SESSION_NOT_CONFIGURED",
        "Owner access and session secrets of at least 32 bytes must be configured server-side.",
        503,
      );
    }
    const body = await readBoundedOperatorJson(request, 16 * 1024);
    if (!isRecord(body) || typeof body.accessToken !== "string") {
      throw new OperatorGatewayError(
        "OPERATOR_ACCESS_TOKEN_REQUIRED",
        "accessToken is required.",
        422,
      );
    }
    if (!operatorAccessTokenMatches(body.accessToken, configuration)) {
      throw new OperatorGatewayError(
        "OPERATOR_ACCESS_DENIED",
        "The owner access token was not accepted.",
        401,
      );
    }
    const session = createOperatorSession(new Date(), configuration);
    const response = operatorResponse({
      ...operatorConfigurationStatus(),
      authenticated: true,
      expiresAt: new Date(session.claims.expiresAt * 1_000).toISOString(),
      sessionId: session.claims.sessionId.slice(0, 12),
    });
    response.cookies.set({
      name: OPERATOR_SESSION_COOKIE,
      value: session.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: session.maxAge,
      priority: "high",
    });
    return response;
  } catch (error: unknown) {
    return operatorErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
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
  const response = operatorResponse({
    ...operatorConfigurationStatus(),
    authenticated: false,
  });
  response.cookies.set({
    name: OPERATOR_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
    priority: "high",
  });
  return response;
}
