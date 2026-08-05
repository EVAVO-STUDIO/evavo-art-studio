import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { apiFail, apiOk } from "@/evavo/api/apiResponse";
import {
  EVAVO_LEGACY_CRAFT_OPERATIONS,
  validateEvavoLegacyCraftPublicRequest
} from "@/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftContracts";
import {
  EvavoDocsSuiteLegacyCraftProxyError,
  requestEvavoDocsSuiteLegacyCraft
} from "@/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftClient";
import { readEvavoBoundedUtf8Body } from "@/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftStream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAXIMUM_BODY_BYTES = 8 * 1024 * 1024;

function privateResponse<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  response.headers.set("Surrogate-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Cookie");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  let source: string;
  try {
    source = await readEvavoBoundedUtf8Body({
      body: request.body,
      declaredLength: request.headers.get("content-length"),
      maximumBytes: MAXIMUM_BODY_BYTES,
      tooLarge: () => new Error("BOOK_CRAFT_REQUEST_TOO_LARGE"),
      invalidEncoding: () => new Error("BOOK_CRAFT_REQUEST_INVALID")
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOOK_CRAFT_REQUEST_INVALID";
    if (code === "BOOK_CRAFT_REQUEST_TOO_LARGE") throw error;
    throw new Error("BOOK_CRAFT_REQUEST_INVALID");
  }
  if (!source.trim()) throw new Error("BOOK_CRAFT_REQUEST_INVALID");
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error("BOOK_CRAFT_REQUEST_INVALID");
  }
}

export async function GET() {
  return privateResponse(apiOk({
    outputKind: "evavo_book_studio_craft_genome_capability",
    schemaVersion: 2,
    operations: EVAVO_LEGACY_CRAFT_OPERATIONS,
    providers: ["chatgpt", "claude", "other_compatible_model"],
    providerExecutionModes: {
      chatgpt: "strict_json_schema",
      claude: "forced_single_tool",
      other_compatible_model: "adapter_json_schema"
    },
    sourceKinds: [
      "public_domain",
      "licensed",
      "user_owned",
      "project_owned",
      "abstract_profile",
      "restricted_reference",
      "synthesized_profile"
    ],
    executionOwner: "Docs Suite compatibility authority",
    websiteExecutionMode: "proxy_only",
    constraints: {
      namedCreatorPrompting: false,
      directImitation: false,
      phraseLaundering: false,
      projectOwnedExpressionRequired: true,
      exactProfileFingerprintRequired: true,
      exactPacketFingerprintRequired: true,
      strictResponseContractRequired: true,
      responseContractHashRequired: true,
      providerResponseIdentityValidationRequired: true,
      phraseOverlapScanBeforeCanonicalAdmission: true,
      schemaValidityGrantsCanonicalAdmission: false,
      websiteLocalCraftExecutionAllowed: false,
      automaticRetryAllowed: false,
      localFallbackAllowed: false,
      streamingBodyLimitsRequired: true,
      adaptiveBodyBufferRequired: true,
      remoteErrorBodiesParsed: false,
      remoteSuccessJsonContentTypeRequired: true,
      remoteOwnerOrClientActorRequired: true,
      rawInternalErrorsExposed: false
    },
    boundary: "Website preserves the legacy API and CLI surface, but all deterministic craft compilation, provider-packet construction, provider-response validation and phrase-overlap execution now occur in Docs Suite. Website performs no local craft calculation, model call, canonical manuscript mutation, automatic admission or publication."
  }));
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const payload = validateEvavoLegacyCraftPublicRequest(await readBoundedJson(request));
    const receipt = await requestEvavoDocsSuiteLegacyCraft({
      requestId,
      requestedAt: new Date().toISOString(),
      payload
    });
    return privateResponse(apiOk(receipt.result, { requestId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "BOOK_CRAFT_OPERATION_FAILED";
    if (message === "BOOK_CRAFT_REQUEST_TOO_LARGE") {
      return privateResponse(apiFail({
        code: "BOOK_CRAFT_REQUEST_TOO_LARGE",
        message: "Craft request body is too large."
      }, { status: 413, requestId }));
    }
    if (message === "BOOK_CRAFT_REQUEST_INVALID" || message === "BOOK_CRAFT_OPERATION_UNSUPPORTED") {
      return privateResponse(apiFail({
        code: "VALIDATION_ERROR",
        message: "Craft request body is invalid.",
        details: { reason: message }
      }, { status: 400, requestId }));
    }
    if (error instanceof EvavoDocsSuiteLegacyCraftProxyError) {
      if (error.code === "BOOK_CRAFT_PROXY_REMOTE_REJECTED" && error.status === 400) {
        return privateResponse(apiFail({
          code: "VALIDATION_ERROR",
          message: "Craft request body was rejected by the authoritative compatibility validator."
        }, { status: 400, requestId }));
      }
      if (error.code === "BOOK_CRAFT_PROXY_REMOTE_REJECTED" && error.status === 413) {
        return privateResponse(apiFail({
          code: "BOOK_CRAFT_REQUEST_TOO_LARGE",
          message: "Craft request body is too large."
        }, { status: 413, requestId }));
      }
      return privateResponse(apiFail({
        code: error.code,
        message: "Craft operation failed closed at the Docs Suite compatibility boundary."
      }, { status: error.status, requestId }));
    }
    return privateResponse(apiFail({
      code: "BOOK_CRAFT_OPERATION_FAILED",
      message: "Craft operation failed."
    }, { status: 500, requestId }));
  }
}
