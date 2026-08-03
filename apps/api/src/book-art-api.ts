import type { IncomingMessage, ServerResponse } from "node:http";

import type { ArtifactStore } from "@evavo/art-artifacts";
import {
  BOOK_ART_PROFILE_CONTRACT,
  BOOK_ART_PROFILE_SCHEMA_VERSION,
  translateLegacyWebsiteBookArtGenerationPlan,
  translateLegacyWebsiteBookIllustrationGenerationPlan,
} from "@evavo/art-contracts";
import {
  BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
  BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
  compileBookArtProviderShadowJob,
  submitBookArtProviderShadowJob,
  type BookArtProviderAdapterPolicyV1,
} from "@evavo/art-book-runtime";
import {
  DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT,
  compileDocsBookArtReleaseShadowJob,
  submitDocsBookArtReleaseShadowJob,
} from "@evavo/art-book-runtime/docs-release";
import { inspectBookArtProviderShadowJob } from "@evavo/art-book-runtime/inspection";
import { compareBookArtProviderShadowParity } from "@evavo/art-book-runtime/parity";
import { RuntimeError, type RuntimeRepository } from "@evavo/art-runtime";

export interface BookArtApiContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly requestId: string;
  readonly maximumBodyBytes: number;
  readonly runtime: RuntimeRepository | undefined;
  readonly artifacts: ArtifactStore | undefined;
  readonly adapterPolicy: BookArtProviderAdapterPolicyV1 | undefined;
  readonly accessReady: boolean;
  readonly accessAuthorized: boolean;
  readonly readJsonBody: (
    request: IncomingMessage,
    maximumBytes: number,
  ) => Promise<unknown>;
  readonly writeJson: (
    response: ServerResponse,
    status: number,
    body: unknown,
    requestId: string,
  ) => void;
}

const PROTOCOL_PATH = "/v1/book-art/provider-runtime";
const COMPILE_PATH = "/v1/book-art/provider-jobs/compile";
const SUBMIT_PATH = "/v1/book-art/provider-jobs/submit";
const INSPECT_PATH = "/v1/book-art/provider-jobs/inspect";
const PARITY_PATH = "/v1/book-art/provider-jobs/parity";
const LEGACY_PLAN_PROTOCOL_PATH = "/v1/book-art/legacy-plan-runtime";
const LEGACY_PLAN_TRANSLATE_PATH = "/v1/book-art/legacy-plans/translate";
const LEGACY_ILLUSTRATION_PLAN_PROTOCOL_PATH =
  "/v1/book-art/legacy-illustration-plan-runtime";
const LEGACY_ILLUSTRATION_PLAN_TRANSLATE_PATH =
  "/v1/book-art/legacy-illustration-plans/translate";
const DOCS_RELEASE_PROTOCOL_PATH = "/v1/book-art/docs-release-runtime";
const DOCS_RELEASE_COMPILE_PATH = "/v1/book-art/docs-releases/compile";
const DOCS_RELEASE_SUBMIT_PATH = "/v1/book-art/docs-releases/submit";
const PARITY_FIELDS = new Set(["request", "websiteObservation"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function pathHandled(pathname: string): boolean {
  return (
    pathname === PROTOCOL_PATH ||
    pathname === COMPILE_PATH ||
    pathname === SUBMIT_PATH ||
    pathname === INSPECT_PATH ||
    pathname === PARITY_PATH ||
    pathname === LEGACY_PLAN_PROTOCOL_PATH ||
    pathname === LEGACY_PLAN_TRANSLATE_PATH ||
    pathname === LEGACY_ILLUSTRATION_PLAN_PROTOCOL_PATH ||
    pathname === LEGACY_ILLUSTRATION_PLAN_TRANSLATE_PATH ||
    pathname === DOCS_RELEASE_PROTOCOL_PATH ||
    pathname === DOCS_RELEASE_COMPILE_PATH ||
    pathname === DOCS_RELEASE_SUBMIT_PATH
  );
}

function actor(request: IncomingMessage): string {
  const header = request.headers["x-evavo-actor"];
  const raw = Array.isArray(header) ? header[0] : header;
  return raw?.trim() || "api-book-art-shadow";
}

function requirePolicy(
  context: BookArtApiContext,
): BookArtProviderAdapterPolicyV1 | null {
  if (context.adapterPolicy) return context.adapterPolicy;
  context.writeJson(
    context.response,
    503,
    {
      error: {
        code: "BOOK_ART_PROVIDER_POLICY_NOT_CONFIGURED",
        message:
          "Book Art provider compilation requires a server-configured adapter allow-list.",
      },
    },
    context.requestId,
  );
  return null;
}

function requireProtectedAccess(context: BookArtApiContext): boolean {
  if (!context.accessReady) {
    context.writeJson(
      context.response,
      503,
      {
        error: {
          code: "BOOK_ART_RUNTIME_ACCESS_UNAVAILABLE",
          message:
            "Book Art legacy-plan translation, provider submission, inspection and parity require EVAVO_ART_ALLOW_WRITES=true and a server-side control token of at least 32 bytes.",
        },
      },
      context.requestId,
    );
    return false;
  }
  if (!context.accessAuthorized) {
    context.writeJson(
      context.response,
      401,
      {
        error: {
          code: "BOOK_ART_RUNTIME_UNAUTHORIZED",
          message: "A valid Art Studio control token is required.",
        },
      },
      context.requestId,
    );
    return false;
  }
  return true;
}

function configuredInput(
  body: unknown,
  adapterPolicy: BookArtProviderAdapterPolicyV1,
): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  if (Object.hasOwn(body, "adapterPolicy")) return null;
  return { ...body, adapterPolicy };
}

function configuredParityInput(
  body: unknown,
  adapterPolicy: BookArtProviderAdapterPolicyV1,
): Readonly<{
  request: Record<string, unknown>;
  websiteObservation: unknown;
}> | null {
  if (!isRecord(body)) return null;
  if (Object.keys(body).some((key) => !PARITY_FIELDS.has(key))) return null;
  if (
    !Object.hasOwn(body, "request") ||
    !Object.hasOwn(body, "websiteObservation")
  ) {
    return null;
  }
  const request = configuredInput(body.request, adapterPolicy);
  if (!request) return null;
  return { request, websiteObservation: body.websiteObservation };
}

function sendRuntimeError(context: BookArtApiContext, error: RuntimeError): void {
  const status = /CONFLICT/.test(error.code) ? 409 : 422;
  context.writeJson(
    context.response,
    status,
    { error: { code: error.code, message: error.message } },
    context.requestId,
  );
}

function providerProtocol(
  context: BookArtApiContext,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    contract: BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
    shadowOnly: true,
    providerPolicyConfigured: context.adapterPolicy !== undefined,
    oneCandidate: true,
    maximumRuntimeAttempts: 1,
    providerFallbackAllowed: false,
    compilePerformsProviderCall: false,
    submitPerformsProviderCall: false,
    inspectPerformsProviderCall: false,
    inspectionWritesArtifacts: false,
    parityPerformsProviderCall: false,
    parityWritesArtifacts: false,
    visualSimilarityEvaluated: false,
    cutoverEligible: false,
    candidateApprovalState: "unapproved",
    candidateStorageClass: "intermediate",
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function docsReleaseProtocol(
  context: BookArtApiContext,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    contract: DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT,
    shadowOnly: true,
    providerPolicyConfigured: context.adapterPolicy !== undefined,
    requiresReadyForArtShadowRelease: true,
    verifiesReleaseFingerprint: true,
    verifiesExactFinalBrief: true,
    verifiesRepositoryCompatibility: true,
    verifiesCompleteReleaseEvidence: true,
    oneCandidate: true,
    maximumRuntimeAttempts: 1,
    providerFallbackAllowed: false,
    compilePerformsProviderCall: false,
    submitPerformsProviderCall: false,
    candidateApprovalState: "unapproved",
    candidateStorageClass: "intermediate",
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}


function legacyPlanProtocol(): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: BOOK_ART_PROFILE_SCHEMA_VERSION,
    contract: BOOK_ART_PROFILE_CONTRACT,
    translationInputKind: "evavo_legacy_website_book_art_plan_translation_input",
    translationResultKind: "evavo_legacy_website_book_art_plan_translation_result",
    requiresCanonicalBookArtBrief: true,
    verifiesExactBriefFingerprint: true,
    verifiesLegacyPlanIdentity: true,
    verifiesCandidateUniqueness: true,
    verifiesArtDirectionDigest: true,
    rawLegacyPromptTrustedAsAuthority: false,
    translationReadOnly: true,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}


function legacyIllustrationPlanProtocol(): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: BOOK_ART_PROFILE_SCHEMA_VERSION,
    contract: BOOK_ART_PROFILE_CONTRACT,
    translationInputKind:
      "evavo_legacy_website_book_illustration_plan_translation_input",
    translationResultKind:
      "evavo_legacy_website_book_illustration_plan_translation_result",
    requiresCanonicalBookArtBrief: true,
    verifiesExactBriefFingerprint: true,
    verifiesLegacyPlanIdentity: true,
    verifiesCandidateUniqueness: true,
    verifiesArtDirectionDigest: true,
    verifiesStyleAuthorityDigest: true,
    verifiesPageAuthorityDigest: true,
    rawLegacyPromptTrustedAsAuthority: false,
    legacyLayoutTrustedAsArtAuthority: false,
    translationReadOnly: true,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

export async function handleBookArtApiRequest(
  context: BookArtApiContext,
): Promise<boolean> {
  if (!pathHandled(context.url.pathname)) return false;
  const { request, response, url, requestId } = context;

  if (request.method === "GET" && url.pathname === PROTOCOL_PATH) {
    context.writeJson(response, 200, providerProtocol(context), requestId);
    return true;
  }
  if (
    request.method === "GET" &&
    url.pathname === DOCS_RELEASE_PROTOCOL_PATH
  ) {
    context.writeJson(response, 200, docsReleaseProtocol(context), requestId);
    return true;
  }
  if (
    request.method === "GET" &&
    url.pathname === LEGACY_PLAN_PROTOCOL_PATH
  ) {
    context.writeJson(response, 200, legacyPlanProtocol(), requestId);
    return true;
  }
  if (
    request.method === "POST" &&
    url.pathname === LEGACY_PLAN_TRANSLATE_PATH
  ) {
    if (!requireProtectedAccess(context)) return true;
    const body = await context.readJsonBody(request, context.maximumBodyBytes);
    const result = await translateLegacyWebsiteBookArtGenerationPlan(body);
    context.writeJson(
      response,
      result.status === "ready_for_shadow_comparison" ? 200 : 422,
      result,
      requestId,
    );
    return true;
  }


  if (
    request.method === "GET" &&
    url.pathname === LEGACY_ILLUSTRATION_PLAN_PROTOCOL_PATH
  ) {
    context.writeJson(
      response,
      200,
      legacyIllustrationPlanProtocol(),
      requestId,
    );
    return true;
  }
  if (
    request.method === "POST" &&
    url.pathname === LEGACY_ILLUSTRATION_PLAN_TRANSLATE_PATH
  ) {
    if (!requireProtectedAccess(context)) return true;
    const body = await context.readJsonBody(
      request,
      context.maximumBodyBytes,
    );
    const result =
      await translateLegacyWebsiteBookIllustrationGenerationPlan(body);
    context.writeJson(
      response,
      result.status === "ready_for_shadow_comparison" ? 200 : 422,
      result,
      requestId,
    );
    return true;
  }

  const postPath =
    url.pathname === COMPILE_PATH ||
    url.pathname === SUBMIT_PATH ||
    url.pathname === INSPECT_PATH ||
    url.pathname === PARITY_PATH ||
    url.pathname === DOCS_RELEASE_COMPILE_PATH ||
    url.pathname === DOCS_RELEASE_SUBMIT_PATH;
  if (request.method === "POST" && postPath) {
    const adapterPolicy = requirePolicy(context);
    if (!adapterPolicy) return true;
    const protectedPath =
      url.pathname === SUBMIT_PATH ||
      url.pathname === INSPECT_PATH ||
      url.pathname === PARITY_PATH ||
      url.pathname === DOCS_RELEASE_SUBMIT_PATH;
    if (protectedPath && !requireProtectedAccess(context)) return true;
    if (protectedPath && !context.runtime) {
      context.writeJson(
        response,
        503,
        {
          error: {
            code: "ART_STUDIO_RUNTIME_NOT_CONFIGURED",
            message:
              "A durable runtime repository is not configured for this API process.",
          },
        },
        requestId,
      );
      return true;
    }
    if (
      (url.pathname === INSPECT_PATH || url.pathname === PARITY_PATH) &&
      !context.artifacts
    ) {
      context.writeJson(
        response,
        503,
        {
          error: {
            code: "ART_STUDIO_ARTIFACT_STORE_NOT_CONFIGURED",
            message:
              "An immutable artifact store is not configured for Book Art provider inspection or parity.",
          },
        },
        requestId,
      );
      return true;
    }

    const body = await context.readJsonBody(request, context.maximumBodyBytes);
    const parityInput =
      url.pathname === PARITY_PATH
        ? configuredParityInput(body, adapterPolicy)
        : null;
    const input =
      url.pathname === PARITY_PATH
        ? parityInput?.request ?? null
        : configuredInput(body, adapterPolicy);
    if (!input) {
      const docsReleasePath =
        url.pathname === DOCS_RELEASE_COMPILE_PATH ||
        url.pathname === DOCS_RELEASE_SUBMIT_PATH;
      context.writeJson(
        response,
        422,
        {
          error: {
            code: docsReleasePath
              ? "BOOK_ART_DOCS_RELEASE_REQUEST_INVALID"
              : "BOOK_ART_PROVIDER_REQUEST_INVALID",
            message:
              url.pathname === PARITY_PATH
                ? "Parity requires exactly request and websiteObservation; request must not contain adapterPolicy because provider policy is configured by the Art Studio host."
                : docsReleasePath
                  ? "The Docs release request must be one object and must not contain adapterPolicy; provider policy is configured by the Art Studio host."
                  : "The request must be one object and must not contain adapterPolicy; provider policy is configured by the Art Studio host.",
          },
        },
        requestId,
      );
      return true;
    }

    try {
      if (url.pathname === DOCS_RELEASE_COMPILE_PATH) {
        const result = await compileDocsBookArtReleaseShadowJob(input);
        context.writeJson(
          response,
          result.status === "ready" ? 200 : 422,
          result,
          requestId,
        );
        return true;
      }
      if (url.pathname === DOCS_RELEASE_SUBMIT_PATH) {
        const result = await submitDocsBookArtReleaseShadowJob(input, {
          runtime: context.runtime!,
          actor: actor(request),
        });
        context.writeJson(
          response,
          result.status === "submitted" ? 201 : 422,
          result,
          requestId,
        );
        return true;
      }

      const compilation = await compileBookArtProviderShadowJob(input);
      if (url.pathname === COMPILE_PATH) {
        context.writeJson(
          response,
          compilation.status === "ready" ? 200 : 422,
          compilation,
          requestId,
        );
        return true;
      }
      if (url.pathname === INSPECT_PATH) {
        const result = await inspectBookArtProviderShadowJob(compilation, {
          runtime: context.runtime!,
          artifacts: context.artifacts!,
        });
        context.writeJson(
          response,
          result.status === "blocked" ? 422 : 200,
          result,
          requestId,
        );
        return true;
      }
      if (url.pathname === PARITY_PATH) {
        const result = await compareBookArtProviderShadowParity(
          compilation,
          parityInput!.websiteObservation,
          {
            runtime: context.runtime!,
            artifacts: context.artifacts!,
          },
        );
        context.writeJson(
          response,
          result.status === "blocked"
            ? 422
            : result.status === "mismatched"
              ? 409
              : 200,
          result,
          requestId,
        );
        return true;
      }

      const result = await submitBookArtProviderShadowJob(input, {
        runtime: context.runtime!,
        actor: actor(request),
      });
      context.writeJson(
        response,
        result.status === "submitted" ? 201 : 422,
        result,
        requestId,
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof RuntimeError) {
        sendRuntimeError(context, error);
        return true;
      }
      throw error;
    }
  }

  context.writeJson(
    response,
    405,
    {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method is not allowed for this Book Art provider route.",
      },
    },
    requestId,
  );
  return true;
}
