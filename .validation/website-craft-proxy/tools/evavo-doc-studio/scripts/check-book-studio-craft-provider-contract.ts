import assert from "node:assert/strict";

import { validateEvavoLegacyCraftPublicRequest } from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftContracts";
import {
  buildEvavoDocsSuiteLegacyCraftRequest,
  EvavoDocsSuiteLegacyCraftProxyError,
  requestEvavoDocsSuiteLegacyCraft,
  resolveEvavoDocsSuiteLegacyCraftConfiguration
} from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftClient";
import { fingerprintEvavoLegacyCraftValue } from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftShared";
import type {
  EvavoDocsSuiteLegacyCraftConfiguration,
  EvavoDocsSuiteLegacyCraftRequestV1,
  EvavoLegacyCraftPublicRequest
} from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftTypes";

const configuration: EvavoDocsSuiteLegacyCraftConfiguration = {
  baseUrl: new URL("https://docs.example.test"),
  token: "header.payload",
  websiteCommit: "a".repeat(40),
  timeoutMs: 1_000,
  maximumResponseBytes: 8 * 1024 * 1024
};

const payload: EvavoLegacyCraftPublicRequest = {
  operation: "compile_profile",
  compileInput: {
    programmeId: "programme:test",
    profileId: "profile:test",
    profileVersion: 1,
    influences: [],
    projectVoiceAnchorIds: [],
    narrativeConstraintIds: [],
    acceptedPatternIds: [],
    rejectedPatternIds: []
  }
};

function remoteResponse(
  request: EvavoDocsSuiteLegacyCraftRequestV1,
  options: {
    actorType?: string;
    workspaceId?: string;
    contentType?: string;
    resultOverrides?: Record<string, unknown>;
    envelopeOverrides?: Record<string, unknown>;
  } = {}
): Response {
  const unsigned = {
    outputKind: "evavo_docs_book_legacy_craft_genome_result",
    schemaVersion: 1,
    contract: "evavo_docs_book_legacy_craft_genome_v1",
    status: "completed",
    requestId: request.requestId,
    operation: request.payload.operation,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: request.sourceCommit,
    requestFingerprint: fingerprintEvavoLegacyCraftValue(request),
    result: {
      outputKind: "evavo_book_studio_craft_genome_profile",
      status: "blocked",
      blockers: ["Test profile is intentionally incomplete."]
    },
    blockers: ["Test profile is intentionally incomplete."],
    warnings: [],
    docsSuiteCompatibilityExecutionPerformed: true,
    websiteLocalCraftExecutionPerformed: false,
    legacyWebsiteCraftSourceRetired: true,
    authoritativeWritesPerformed: false,
    providerCalled: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    docsSuiteCanonicalWriterEnabled: false,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
    ...options.resultOverrides
  };
  const result = { ...unsigned, resultFingerprint: fingerprintEvavoLegacyCraftValue(unsigned) };
  return new Response(JSON.stringify({
    ok: true,
    workspaceId: options.workspaceId ?? "workspace_test",
    actorType: options.actorType ?? "owner",
    result,
    ...options.envelopeOverrides
  }), {
    status: 200,
    headers: { "content-type": options.contentType ?? "application/json; charset=utf-8" }
  });
}

function streamedBody(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  });
}

function rejectedBody(status: number): { response: Response; cancelled: () => boolean } {
  let wasCancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("private-non-json-error-that-never-finishes"));
    },
    cancel() {
      wasCancelled = true;
    }
  });
  return {
    response: new Response(body, { status, headers: { "content-type": "text/plain" } }),
    cancelled: () => wasCancelled
  };
}

function assertConfigurationHardening(): void {
  const baseEnvironment: NodeJS.ProcessEnv = {
    EVAVO_DOCS_SUITE_BOOK_CRAFT_URL: "https://docs.example.test",
    EVAVO_DOCS_SUITE_BOOK_CRAFT_TOKEN: "header.payload",
    EVAVO_WEBSITE_COMMIT_SHA: "a".repeat(40),
    EVAVO_DOCS_SUITE_BOOK_CRAFT_TIMEOUT_MS: "500"
  };
  const resolved = resolveEvavoDocsSuiteLegacyCraftConfiguration(baseEnvironment);
  assert.equal(resolved.baseUrl.href, "https://docs.example.test/");
  assert.equal(resolved.timeoutMs, 500);
  assert.equal(resolved.websiteCommit, "a".repeat(40));

  for (const url of [
    "https://docs.example.test/hidden/path",
    "https://docs.example.test/?query=1",
    "https://user:pass@docs.example.test/",
    " https://docs.example.test",
    "http://docs.example.test"
  ]) {
    assert.throws(
      () => resolveEvavoDocsSuiteLegacyCraftConfiguration({ ...baseEnvironment, EVAVO_DOCS_SUITE_BOOK_CRAFT_URL: url }),
      (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
        && error.code === "BOOK_CRAFT_PROXY_CONFIGURATION_INVALID"
    );
  }

  for (const token of [
    "onepart",
    "three.part.extra",
    "header pay.load",
    "header\u00a0.payload",
    " header.payload",
    "header.payload ",
    `h.${"p".repeat(4096)}`
  ]) {
    assert.throws(
      () => resolveEvavoDocsSuiteLegacyCraftConfiguration({ ...baseEnvironment, EVAVO_DOCS_SUITE_BOOK_CRAFT_TOKEN: token }),
      (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
        && error.code === "BOOK_CRAFT_PROXY_CONFIGURATION_INVALID"
    );
  }

  for (const commit of [` ${"a".repeat(40)}`, `${"a".repeat(40)} `, "A".repeat(40)]) {
    assert.throws(
      () => resolveEvavoDocsSuiteLegacyCraftConfiguration({ ...baseEnvironment, EVAVO_WEBSITE_COMMIT_SHA: commit }),
      (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
        && error.code === "BOOK_CRAFT_PROXY_CONFIGURATION_INVALID"
    );
  }

  assert.throws(
    () => resolveEvavoDocsSuiteLegacyCraftConfiguration({ ...baseEnvironment, EVAVO_DOCS_SUITE_BOOK_CRAFT_TIMEOUT_MS: "499" }),
    (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
      && error.code === "BOOK_CRAFT_PROXY_CONFIGURATION_INVALID"
  );
}

function assertRequestIdentityHardening(): void {
  assert.throws(
    () => buildEvavoDocsSuiteLegacyCraftRequest({
      requestId: "request:noncanonical-time",
      requestedAt: "2026-08-05T00:00:00Z",
      payload,
      configuration
    }),
    /canonical UTC timestamp/
  );
}

async function assertExactRemoteExecution(): Promise<void> {
  let calls = 0;
  for (const actorType of ["owner", "client"] as const) {
    const receipt = await requestEvavoDocsSuiteLegacyCraft({
      requestId: `request:exact:${actorType}`,
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration,
      fetchImpl: async (input, init) => {
        calls += 1;
        assert.equal(String(input), "https://docs.example.test/api/v1/book-studio/legacy-craft-genome");
        assert.equal(init?.method, "POST");
        assert.equal(init?.cache, "no-store");
        assert.equal(init?.redirect, "error");
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer header.payload");
        assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
        const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
        assert.equal(request.requestedBy, "Website Book Studio craft-genome compatibility route");
        assert.equal(request.sourceCommit, configuration.websiteCommit);
        assert.equal(request.authoritativeWritesAllowed, false);
        assert.equal(request.providerCallAllowed, false);
        assert.equal(request.canonicalManuscriptMutationAllowed, false);
        assert.equal(request.automaticCanonicalAdmissionAllowed, false);
        assert.equal(request.runtimeCutoverApproved, false);
        assert.equal(request.publicationPerformed, false);
        assert.deepEqual(request.payload, payload);
        return remoteResponse(request, { actorType, contentType: "application/vnd.evavo+json" });
      }
    });
    assert.equal(receipt.remoteExecutionPerformed, true);
    assert.equal(receipt.localExecutionPerformed, false);
    assert.equal(receipt.operation, "compile_profile");
    assert.equal(JSON.stringify(receipt).includes(configuration.token), false);
  }
  assert.equal(calls, 2);
}

async function assertNoRetryAndNoSecretLeak(): Promise<void> {
  let calls = 0;
  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:network",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration,
      fetchImpl: async () => {
        calls += 1;
        throw new Error(`network failed with ${configuration.token}`);
      }
    }),
    (error: unknown) => {
      assert.ok(error instanceof EvavoDocsSuiteLegacyCraftProxyError);
      assert.equal(error.code, "BOOK_CRAFT_PROXY_NETWORK_FAILED");
      assert.equal(error.message.includes(configuration.token), false);
      return true;
    }
  );
  assert.equal(calls, 1);
}

async function assertTimeoutsAreNotRetried(): Promise<void> {
  let headerCalls = 0;
  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:timeout",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration: { ...configuration, timeoutMs: 10 },
      fetchImpl: async (_input, init) => {
        headerCalls += 1;
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      }
    }),
    (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
      && error.code === "BOOK_CRAFT_PROXY_TIMEOUT"
      && error.status === 504
  );
  assert.equal(headerCalls, 1);

  let bodyCalls = 0;
  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:response-timeout",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration: { ...configuration, timeoutMs: 10 },
      fetchImpl: async (_input, init) => {
        bodyCalls += 1;
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("aborted while reading response");
              error.name = "AbortError";
              controller.error(error);
            }, { once: true });
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    }),
    (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
      && error.code === "BOOK_CRAFT_PROXY_TIMEOUT"
      && error.status === 504
  );
  assert.equal(bodyCalls, 1);
}

async function assertRemoteStatusesAreNormalisedWithoutParsing(): Promise<void> {
  for (const [remoteStatus, expectedStatus] of [[400, 400], [413, 413], [401, 502], [429, 503], [302, 502]] as const) {
    const remote = rejectedBody(remoteStatus);
    await assert.rejects(
      requestEvavoDocsSuiteLegacyCraft({
        requestId: `request:remote:${remoteStatus}`,
        requestedAt: "2026-08-05T00:00:00.000Z",
        payload,
        configuration,
        fetchImpl: async () => remote.response
      }),
      (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
        && error.code === "BOOK_CRAFT_PROXY_REMOTE_REJECTED"
        && error.status === expectedStatus
    );
    await Promise.resolve();
    assert.equal(remote.cancelled(), true, `Remote ${remoteStatus} body was not cancelled.`);
  }
}

async function assertResponseAdmissionHardening(): Promise<void> {
  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:stream-limit",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration: { ...configuration, maximumResponseBytes: 32 },
      fetchImpl: async () => new Response(streamedBody([
        new Uint8Array(24).fill(120),
        new Uint8Array(24).fill(121)
      ]), {
        status: 200,
        headers: { "content-length": "2", "content-type": "application/json" }
      })
    }),
    (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
      && error.code === "BOOK_CRAFT_PROXY_RESPONSE_TOO_LARGE"
  );

  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:utf8",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration,
      fetchImpl: async () => new Response(new Uint8Array([0xff]), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    }),
    (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
      && error.code === "BOOK_CRAFT_PROXY_RESPONSE_INVALID"
  );

  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:media-type",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration,
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
        return remoteResponse(request, { contentType: "text/plain" });
      }
    }),
    (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
      && error.code === "BOOK_CRAFT_PROXY_RESPONSE_INVALID"
  );

  for (const actorType of ["automation", "human", ""] as const) {
    await assert.rejects(
      requestEvavoDocsSuiteLegacyCraft({
        requestId: `request:actor:${actorType || "empty"}`,
        requestedAt: "2026-08-05T00:00:00.000Z",
        payload,
        configuration,
        fetchImpl: async (_input, init) => {
          const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
          return remoteResponse(request, { actorType });
        }
      }),
      (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
        && error.code === "BOOK_CRAFT_PROXY_RESPONSE_INVALID"
    );
  }

  for (const workspaceId of [" ws", "ws ", "ws:invalid", "w".repeat(161)]) {
    await assert.rejects(
      requestEvavoDocsSuiteLegacyCraft({
        requestId: "request:workspace",
        requestedAt: "2026-08-05T00:00:00.000Z",
        payload,
        configuration,
        fetchImpl: async (_input, init) => {
          const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
          return remoteResponse(request, { workspaceId });
        }
      }),
      (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
        && error.code === "BOOK_CRAFT_PROXY_RESPONSE_INVALID"
    );
  }
}

async function assertTamperingIsRejected(): Promise<void> {
  for (const resultOverrides of [
    { providerCalled: true },
    { requestFingerprint: `sha256:${"f".repeat(64)}` }
  ]) {
    await assert.rejects(
      requestEvavoDocsSuiteLegacyCraft({
        requestId: "request:tamper",
        requestedAt: "2026-08-05T00:00:00.000Z",
        payload,
        configuration,
        fetchImpl: async (_input, init) => {
          const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
          return remoteResponse(request, { resultOverrides });
        }
      }),
      (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
        && error.code === "BOOK_CRAFT_PROXY_RESPONSE_TAMPERED"
    );
  }

  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:unknown-field",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration,
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
        return remoteResponse(request, { envelopeOverrides: { unexpected: true } });
      }
    }),
    (error: unknown) => error instanceof EvavoDocsSuiteLegacyCraftProxyError
      && error.code === "BOOK_CRAFT_PROXY_RESPONSE_INVALID"
  );
}

function assertPublicRequestValidation(): void {
  assert.deepEqual(validateEvavoLegacyCraftPublicRequest(payload), payload);
  assert.throws(() => validateEvavoLegacyCraftPublicRequest({ ...payload, localFallback: true }), /BOOK_CRAFT_REQUEST_INVALID/);
  assert.throws(() => validateEvavoLegacyCraftPublicRequest({ operation: "unknown" }), /BOOK_CRAFT_OPERATION_UNSUPPORTED/);
}

async function main(): Promise<void> {
  assertConfigurationHardening();
  assertRequestIdentityHardening();
  assertPublicRequestValidation();
  await assertExactRemoteExecution();
  await assertNoRetryAndNoSecretLeak();
  await assertTimeoutsAreNotRetried();
  await assertRemoteStatusesAreNormalisedWithoutParsing();
  await assertResponseAdmissionHardening();
  await assertTamperingIsRejected();

  console.log(JSON.stringify({
    status: "PASS",
    contract: "evavo_docs_book_legacy_craft_genome_v1",
    endpoint: "/api/v1/book-studio/legacy-craft-genome",
    adaptiveStreamBufferRequired: true,
    cancellationCannotDelayDeterministicRejection: true,
    requestAndResponseBodyTimeoutsClassified: true,
    strictUtf8Required: true,
    successJsonMediaTypeRequired: true,
    ownerOrClientActorTypeRequired: true,
    workspaceIdentityBoundToDocsContract: true,
    automationGrantTokenShapeRequired: true,
    exactWebsiteCommitRequired: true,
    remoteErrorBodiesParsed: false,
    remoteStatusesNormalised: true,
    redirectsAllowed: false,
    automaticRetriesAllowed: false,
    localFallbackAllowed: false,
    providerCalled: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
