import { NextRequest, NextResponse } from "next/server";

import {
  BOOK_STATE_SHADOW_IMPORT_CONTRACT,
  BOOK_STATE_SHADOW_ROLLBACK_CONTRACT,
  executeBookStateShadowImportService,
  type BookStateShadowImportServiceOperation,
} from "@/lib/book-studio-shadow-state-import-service";
import { readDocsSuiteRequestContext } from "@/lib/docs-suite-request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAXIMUM_BODY_BYTES = 4_200_000;
const BODY_KEYS = new Set(["operation", "request"]);

function headers(): Record<string, string> {
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
      {
        ok: false,
        error:
          "A documents:write Docs Suite session or automation grant is required.",
      },
      { status: 403, headers: headers() },
    );
  }
  return NextResponse.json(
    {
      ok: true,
      importContract: BOOK_STATE_SHADOW_IMPORT_CONTRACT,
      rollbackContract: BOOK_STATE_SHADOW_ROLLBACK_CONTRACT,
      operations: ["import", "rehearse_rollback"],
      workspaceId: context.workspaceId,
      actorType: context.actorType,
      storageRootConfigured:
        Boolean(process.env.BOOK_STUDIO_SHADOW_STATE_ROOT?.trim()),
      exactValidationRerunRequired: true,
      optimisticCompareAndSwapRequired: true,
      idempotentReplaySupported: true,
      rollbackRehearsalChangesState: false,
      shadowStateOnly: true,
      websiteCompatibilityRuntimeStillAuthoritative: true,
      docsSuiteCanonicalWriterEnabled: false,
      runtimeCutoverApproved: false,
      sourceDeletionApproved: false,
      publicationPerformed: false,
    },
    { status: 200, headers: headers() },
  );
}

export async function POST(request: NextRequest) {
  const context = await readDocsSuiteRequestContext();
  if (!context || !context.scopes.includes("documents:write")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A documents:write Docs Suite session or automation grant is required.",
      },
      { status: 403, headers: headers() },
    );
  }
  try {
    const body = await readBody(request);
    const result = await executeBookStateShadowImportService(
      body.operation,
      body.request,
    );
    return NextResponse.json(
      {
        ok: true,
        operation: body.operation,
        workspaceId: context.workspaceId,
        actorType: context.actorType,
        result,
      },
      { status: 200, headers: headers() },
    );
  } catch (error) {
    const code = stableCode(error);
    return NextResponse.json(
      { ok: false, error: code },
      { status: statusFor(code), headers: headers() },
    );
  }
}

async function readBody(
  request: NextRequest,
): Promise<{ operation: BookStateShadowImportServiceOperation; request: unknown }> {
  const type = request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    ?.toLowerCase();
  if (type !== "application/json") {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_CONTENT_TYPE_INVALID");
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > MAXIMUM_BODY_BYTES) {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_BODY_TOO_LARGE");
  }
  const source = await request.text();
  if (!source.trim()) throw new Error("BOOK_STATE_SHADOW_IMPORT_BODY_EMPTY");
  if (Buffer.byteLength(source, "utf8") > MAXIMUM_BODY_BYTES) {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_BODY_TOO_LARGE");
  }
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_JSON_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_ENVELOPE_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !BODY_KEYS.has(key))) {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_ENVELOPE_INVALID");
  }
  if (record.operation !== "import" && record.operation !== "rehearse_rollback") {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_OPERATION_INVALID");
  }
  if (!Object.prototype.hasOwnProperty.call(record, "request")) {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_REQUEST_MISSING");
  }
  return {
    operation: record.operation,
    request: record.request,
  };
}

function stableCode(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : "BOOK_STATE_SHADOW_IMPORT_REQUEST_INVALID";
  return /^BOOK_STATE_SHADOW_[A-Z0-9_:-]{3,200}$/.test(message)
    ? message
    : "BOOK_STATE_SHADOW_IMPORT_REQUEST_INVALID";
}

function statusFor(code: string): number {
  if (code.endsWith("BODY_TOO_LARGE")) return 413;
  if (code.endsWith("STORE_ROOT_REQUIRED")) return 503;
  if (
    code.includes("CONFLICT") ||
    code.endsWith("LOCKED")
  ) return 409;
  if (
    code.includes("BUNDLE_NOT_READY") ||
    code.includes("VALIDATION_MISMATCH")
  ) return 422;
  return 400;
}
