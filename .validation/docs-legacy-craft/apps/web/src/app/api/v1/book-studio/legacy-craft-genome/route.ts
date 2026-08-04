import { NextRequest, NextResponse } from "next/server";

import {
  executeBookLegacyCraftGenomeRequest,
  listBookLegacyCraftGenomeCapabilities,
} from "@/lib/book-studio-legacy-craft-genome-service";
import { readBoundedBookLegacyCraftGenomeJson } from "@/lib/book-studio-legacy-craft-genome-input";
import { readDocsSuiteRequestContext } from "@/lib/docs-suite-request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

async function requestContext() {
  const context = await readDocsSuiteRequestContext();
  return context?.scopes.includes("documents:read") ? context : null;
}

export async function GET() {
  const context = await requestContext();
  if (!context) {
    return NextResponse.json(
      { ok: false, error: "A documents:read Docs Suite session or automation grant is required." },
      { status: 403, headers: privateHeaders() },
    );
  }
  return NextResponse.json({
    ok: true,
    workspaceId: context.workspaceId,
    actorType: context.actorType,
    capabilities: listBookLegacyCraftGenomeCapabilities(),
  }, { status: 200, headers: privateHeaders() });
}

export async function POST(request: NextRequest) {
  const context = await requestContext();
  if (!context) {
    return NextResponse.json(
      { ok: false, error: "A documents:read Docs Suite session or automation grant is required." },
      { status: 403, headers: privateHeaders() },
    );
  }
  try {
    const result = executeBookLegacyCraftGenomeRequest(await readBoundedBookLegacyCraftGenomeJson(request));
    return NextResponse.json({
      ok: true,
      workspaceId: context.workspaceId,
      actorType: context.actorType,
      result,
    }, { status: 200, headers: privateHeaders() });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DOCS_BOOK_LEGACY_CRAFT_REQUEST_INVALID";
    const status = code === "DOCS_BOOK_LEGACY_CRAFT_BODY_TOO_LARGE" ? 413 : 400;
    return NextResponse.json({
      ok: false,
      error: status === 413
        ? "Request body is too large."
        : "The legacy craft-genome compatibility request is invalid.",
      code,
    }, { status, headers: privateHeaders() });
  }
}
