import { NextRequest, NextResponse } from "next/server";

import {
  coordinateBookUnattendedAuthorialWriting,
  listBookUnattendedAuthorialWritingCapabilities,
  type BookUnattendedAuthorialWritingCoordinationResultV1,
} from "@/lib/book-studio-unattended-authorial-writing-service";
import { readDocsSuiteRequestContext } from "@/lib/docs-suite-request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ENDPOINT = "/api/v1/book-studio/unattended-production/authorial-writing";
const MAXIMUM_BODY_BYTES = 4_400_000;

function privateHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

export async function GET() {
  const context = await readDocsSuiteRequestContext();
  if (!context || !context.scopes.includes("documents:write")) {
    return NextResponse.json(
      { ok: false, error: "A documents:write Docs Suite session or automation grant is required." },
      { status: 403, headers: privateHeaders() },
    );
  }
  return NextResponse.json({
    ok: true,
    workspaceId: context.workspaceId,
    actorType: context.actorType,
    endpoint: ENDPOINT,
    maximumRequestBytes: MAXIMUM_BODY_BYTES,
    providerCallAllowed: true,
    ...listBookUnattendedAuthorialWritingCapabilities(),
  }, { status: 200, headers: privateHeaders() });
}

export async function POST(request: NextRequest) {
  const context = await readDocsSuiteRequestContext();
  if (!context || !context.scopes.includes("documents:write")) {
    return NextResponse.json(
      { ok: false, error: "A documents:write Docs Suite session or automation grant is required." },
      { status: 403, headers: privateHeaders() },
    );
  }
  try {
    const body = await readBoundedJson(request);
    const result = await coordinateBookUnattendedAuthorialWriting(body);
    return NextResponse.json({
      ok: result.status !== "blocked",
      workspaceId: context.workspaceId,
      actorType: context.actorType,
      result,
    }, {
      status: statusFor(result),
      headers: privateHeaders(),
    });
  } catch (error) {
    const code = error instanceof Error
      ? error.message
      : "DOCS_BOOK_UNATTENDED_AUTHORIAL_WRITING_REQUEST_INVALID";
    const status = code === "DOCS_BOOK_UNATTENDED_AUTHORIAL_WRITING_BODY_TOO_LARGE"
      ? 413
      : 400;
    return NextResponse.json({
      ok: false,
      error: /^[A-Z][A-Z0-9_:-]{2,200}$/u.test(code)
        ? code
        : "DOCS_BOOK_UNATTENDED_AUTHORIAL_WRITING_REQUEST_INVALID",
    }, { status, headers: privateHeaders() });
  }
}

function statusFor(result: BookUnattendedAuthorialWritingCoordinationResultV1): number {
  if (result.status === "blocked") return blockedStatus(result);
  if (result.status === "continuation_required" || result.status === "needs_work") return 202;
  return 200;
}

function blockedStatus(result: BookUnattendedAuthorialWritingCoordinationResultV1): number {
  const joined = result.blockers.join("\n");
  if (
    result.providerCalled
    || /INDETERMINATE|AMBIGUOUS|RESPONSE_|RESULT_MISSING|FINGERPRINT_MISMATCH/u.test(joined)
  ) return 409;
  if (/URL_REQUIRED|TOKEN_INVALID|CONFIG|REMOTE_HTTP_5\d\d|TEMPORARY_UNAVAILABLE/u.test(joined)) {
    return 503;
  }
  return 422;
}

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > MAXIMUM_BODY_BYTES) {
    throw new Error("DOCS_BOOK_UNATTENDED_AUTHORIAL_WRITING_BODY_TOO_LARGE");
  }
  const source = await request.text();
  if (!source.trim()) throw new Error("DOCS_BOOK_UNATTENDED_AUTHORIAL_WRITING_BODY_EMPTY");
  if (Buffer.byteLength(source, "utf8") > MAXIMUM_BODY_BYTES) {
    throw new Error("DOCS_BOOK_UNATTENDED_AUTHORIAL_WRITING_BODY_TOO_LARGE");
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error("DOCS_BOOK_UNATTENDED_AUTHORIAL_WRITING_JSON_INVALID");
  }
}
