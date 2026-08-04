import { NextRequest, NextResponse } from "next/server";

import {
  BOOK_STATE_MIGRATION_BUNDLE_CONTRACT,
  validateBookStudioStateMigrationBundle,
} from "@/lib/book-studio-state-migration-service";
import { readDocsSuiteRequestContext } from "@/lib/docs-suite-request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAXIMUM_BODY_BYTES = 4_000_000;

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
      {
        ok: false,
        error:
          "A documents:write Docs Suite session or automation grant is required.",
      },
      { status: 403, headers: privateHeaders() },
    );
  }
  return NextResponse.json(
    {
      ok: true,
      contract: BOOK_STATE_MIGRATION_BUNDLE_CONTRACT,
      workspaceId: context.workspaceId,
      actorType: context.actorType,
      sourceRepository: "EVAVO-STUDIO/Website",
      validatesCurrentDocsSuiteOperations: true,
      validatesApprovedArtworkUse: true,
      statePersisted: false,
      canonicalManuscriptMutationAllowed: false,
      docsSuiteCanonicalWriterEnabled: false,
      runtimeCutoverApproved: false,
      sourceDeletionApproved: false,
      publicationPerformed: false,
    },
    { status: 200, headers: privateHeaders() },
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
      { status: 403, headers: privateHeaders() },
    );
  }
  try {
    const body = await readBody(request);
    const result = await validateBookStudioStateMigrationBundle(body);
    const status = result.status === "blocked"
      ? 400
      : result.status === "needs_resolution"
        ? 422
        : 200;
    return NextResponse.json(
      {
        ok: result.status === "ready_for_cutover_review",
        workspaceId: context.workspaceId,
        actorType: context.actorType,
        result,
      },
      { status, headers: privateHeaders() },
    );
  } catch (error) {
    const code = error instanceof Error
      ? error.message
      : "DOCS_BOOK_STATE_MIGRATION_REQUEST_INVALID";
    return NextResponse.json(
      {
        ok: false,
        error: /^[A-Z][A-Z0-9_:-]{2,200}$/.test(code)
          ? code
          : "DOCS_BOOK_STATE_MIGRATION_REQUEST_INVALID",
      },
      {
        status: code === "DOCS_BOOK_STATE_MIGRATION_BODY_TOO_LARGE"
          ? 413
          : 400,
        headers: privateHeaders(),
      },
    );
  }
}

async function readBody(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    ?.toLowerCase();
  if (contentType !== "application/json") {
    throw new Error("DOCS_BOOK_STATE_MIGRATION_CONTENT_TYPE_INVALID");
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > MAXIMUM_BODY_BYTES) {
    throw new Error("DOCS_BOOK_STATE_MIGRATION_BODY_TOO_LARGE");
  }
  const source = await request.text();
  if (!source.trim()) {
    throw new Error("DOCS_BOOK_STATE_MIGRATION_BODY_EMPTY");
  }
  if (Buffer.byteLength(source, "utf8") > MAXIMUM_BODY_BYTES) {
    throw new Error("DOCS_BOOK_STATE_MIGRATION_BODY_TOO_LARGE");
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error("DOCS_BOOK_STATE_MIGRATION_JSON_INVALID");
  }
}
