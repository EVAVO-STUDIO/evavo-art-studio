import { NextRequest, NextResponse } from "next/server";

import {
  BOOK_UNIVERSAL_READINESS_CONTRACT,
  SUPPORTED_BOOK_CONTENT_CLASSES,
  compileBookUniversalReadiness,
} from "@/lib/book-studio-universal-readiness-service";
import { readBoundedJson } from "@/lib/docs-suite-api-input";
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

export async function GET() {
  const context = await readDocsSuiteRequestContext();
  if (!context || !context.scopes.includes("documents:read")) {
    return NextResponse.json(
      { ok: false, error: "A documents:read Docs Suite session or automation grant is required." },
      { status: 403, headers: privateHeaders() },
    );
  }
  return NextResponse.json(
    {
      ok: true,
      contract: BOOK_UNIVERSAL_READINESS_CONTRACT,
      workspaceId: context.workspaceId,
      actorType: context.actorType,
      supportedContentClasses: [...SUPPORTED_BOOK_CONTENT_CLASSES],
      statuses: ["blocked", "needs_work", "ready_for_automation"],
      planningOnly: true,
      oneBoundedStagePerAutomationCallRequired: true,
      writingStudioIntegrated: true,
      artStudioIntegrated: true,
      providerCallPerformed: false,
      runtimeJobSubmitted: false,
      artifactBytesWritten: false,
      canonicalAdmissionAllowed: false,
      canonicalManuscriptMutationPerformed: false,
      automaticPublicationAllowed: false,
      runtimeCutoverApproved: false,
      publicationPerformed: false,
    },
    { status: 200, headers: privateHeaders() },
  );
}

export async function POST(request: NextRequest) {
  const context = await readDocsSuiteRequestContext();
  if (!context || !context.scopes.includes("documents:read")) {
    return NextResponse.json(
      { ok: false, error: "A documents:read Docs Suite session or automation grant is required." },
      { status: 403, headers: privateHeaders() },
    );
  }
  try {
    const project = await readBoundedJson(request);
    const result = await compileBookUniversalReadiness(project);
    return NextResponse.json(
      {
        ok: result.status !== "blocked",
        readyForAutomation: result.status === "ready_for_automation",
        workspaceId: context.workspaceId,
        actorType: context.actorType,
        result,
      },
      {
        status: result.status === "blocked" ? 422 : 200,
        headers: privateHeaders(),
      },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "DOCS_BOOK_UNIVERSAL_READINESS_INVALID";
    return NextResponse.json(
      {
        ok: false,
        error: code === "DOCS_SUITE_API_BODY_TOO_LARGE"
          ? "Request body is too large."
          : "The Book project readiness request is invalid.",
      },
      {
        status: code === "DOCS_SUITE_API_BODY_TOO_LARGE" ? 413 : 400,
        headers: privateHeaders(),
      },
    );
  }
}
