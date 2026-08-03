import { NextRequest, NextResponse } from "next/server";

import { coordinateBookArtPlanTranslation } from "@/lib/book-studio-art-plan-translation-service";
import { readDocsSuiteRequestContext } from "@/lib/docs-suite-request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  if (!context || !context.scopes.includes("documents:read")) {
    return NextResponse.json(
      {
        ok: false,
        error: "A documents:read Docs Suite session or automation grant is required.",
      },
      { status: 403, headers: privateHeaders() },
    );
  }
  return NextResponse.json({
    ok: true,
    contract: "evavo_docs_book_art_plan_translation_v1",
    workspaceId: context.workspaceId,
    actorType: context.actorType,
    supportedInputKinds: [
      "evavo_legacy_website_book_art_plan_translation_input",
      "evavo_legacy_website_book_illustration_plan_translation_input",
    ],
    maximumRequestBytes: MAXIMUM_BODY_BYTES,
    artStudioCallMaximum: 1,
    ambiguousRetryAllowed: false,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    artifactBytesWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  }, { status: 200, headers: privateHeaders() });
}

export async function POST(request: NextRequest) {
  const context = await readDocsSuiteRequestContext();
  if (!context || !context.scopes.includes("documents:read")) {
    return NextResponse.json(
      {
        ok: false,
        error: "A documents:read Docs Suite session or automation grant is required.",
      },
      { status: 403, headers: privateHeaders() },
    );
  }
  try {
    const body = await readBoundedJson(request);
    const result = await coordinateBookArtPlanTranslation(body);
    return NextResponse.json({
      ok: result.status === "ready_for_shadow_comparison",
      workspaceId: context.workspaceId,
      actorType: context.actorType,
      result,
    }, {
      status: statusForResult(result.blockers, result.status),
      headers: privateHeaders(),
    });
  } catch (error) {
    const code = stableCode(error);
    return NextResponse.json(
      { ok: false, error: code },
      { status: statusForError(code), headers: privateHeaders() },
    );
  }
}

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > MAXIMUM_BODY_BYTES) {
    throw new Error("DOCS_BOOK_ART_TRANSLATION_BODY_TOO_LARGE");
  }
  const source = await request.text();
  if (!source.trim()) throw new Error("DOCS_BOOK_ART_TRANSLATION_BODY_EMPTY");
  if (Buffer.byteLength(source, "utf8") > MAXIMUM_BODY_BYTES) {
    throw new Error("DOCS_BOOK_ART_TRANSLATION_BODY_TOO_LARGE");
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error("DOCS_BOOK_ART_TRANSLATION_JSON_INVALID");
  }
}

function statusForResult(
  blockers: readonly string[],
  status: "ready_for_shadow_comparison" | "blocked",
): number {
  if (status === "ready_for_shadow_comparison") return 200;
  if (blockers.some((code) => code.includes("AMBIGUOUS_"))) return 409;
  if (blockers.some((code) =>
    code.includes("_URL_") ||
    code.includes("_TOKEN_") ||
    code.includes("_TIMEOUT_") ||
    code.includes("REMOTE_HTTP_5")
  )) return 503;
  return 422;
}

function statusForError(code: string): number {
  if (code === "DOCS_BOOK_ART_TRANSLATION_BODY_TOO_LARGE") return 413;
  if (code.includes("AMBIGUOUS_")) return 409;
  if (
    code.includes("_URL_") ||
    code.includes("_TOKEN_") ||
    code.includes("_TIMEOUT_")
  ) return 503;
  return 400;
}

function stableCode(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : "DOCS_BOOK_ART_TRANSLATION_REQUEST_INVALID";
  return /^[A-Z][A-Z0-9_:-]{2,200}$/.test(message)
    ? message
    : "DOCS_BOOK_ART_TRANSLATION_REQUEST_INVALID";
}
