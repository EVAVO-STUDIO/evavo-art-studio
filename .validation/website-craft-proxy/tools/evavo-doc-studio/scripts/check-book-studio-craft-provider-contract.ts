import assert from "node:assert/strict";

import {
  validateEvavoLegacyCraftPublicRequest
} from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftContracts";
import {
  EvavoDocsSuiteLegacyCraftProxyError,
  requestEvavoDocsSuiteLegacyCraft
} from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftClient";
import { fingerprintEvavoLegacyCraftValue } from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftShared";
import type {
  EvavoDocsSuiteLegacyCraftConfiguration,
  EvavoDocsSuiteLegacyCraftRequestV1,
  EvavoLegacyCraftPublicRequest
} from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftTypes";

const configuration: EvavoDocsSuiteLegacyCraftConfiguration = {
  baseUrl: new URL("https://docs.example.test"),
  token: "secret.payload",
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
  overrides: Record<string, unknown> = {},
  envelopeOverrides: Record<string, unknown> = {}
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
    ...overrides
  };
  const result = {
    ...unsigned,
    resultFingerprint: fingerprintEvavoLegacyCraftValue(unsigned)
  };
  return new Response(JSON.stringify({
    ok: true,
    workspaceId: "workspace:test",
    actorType: "automation",
    result,
    ...envelopeOverrides
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

async function assertExactRemoteExecution(): Promise<void> {
  let calls = 0;
  const receipt = await requestEvavoDocsSuiteLegacyCraft({
    requestId: "request:one",
    requestedAt: "2026-08-05T00:00:00.000Z",
    payload,
    configuration,
    fetchImpl: async (input, init) => {
      calls += 1;
      assert.equal(String(input), "https://docs.example.test/api/v1/book-studio/legacy-craft-genome");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer secret.payload");
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
      return remoteResponse(request);
    }
  });
  assert.equal(calls, 1);
  assert.equal(receipt.remoteExecutionPerformed, true);
  assert.equal(receipt.localExecutionPerformed, false);
  assert.equal(receipt.operation, "compile_profile");
  assert.equal(JSON.stringify(receipt).includes(configuration.token), false);
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

async function assertTimeoutIsNotRetried(): Promise<void> {
  let calls = 0;
  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:timeout",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration: { ...configuration, timeoutMs: 10 },
      fetchImpl: async (_input, init) => {
        calls += 1;
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      }
    }),
    (error: unknown) => {
      assert.ok(error instanceof EvavoDocsSuiteLegacyCraftProxyError);
      assert.equal(error.code, "BOOK_CRAFT_PROXY_TIMEOUT");
      return true;
    }
  );
  assert.equal(calls, 1);
}

async function assertAuthorityTamperingIsRejected(): Promise<void> {
  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:authority",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration,
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
        return remoteResponse(request, { providerCalled: true });
      }
    }),
    (error: unknown) => {
      assert.ok(error instanceof EvavoDocsSuiteLegacyCraftProxyError);
      assert.equal(error.code, "BOOK_CRAFT_PROXY_RESPONSE_TAMPERED");
      return true;
    }
  );
}

async function assertUnknownResponseFieldsAreRejected(): Promise<void> {
  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:unknown-field",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration,
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
        return remoteResponse(request, {}, { unexpected: true });
      }
    }),
    (error: unknown) => {
      assert.ok(error instanceof EvavoDocsSuiteLegacyCraftProxyError);
      assert.equal(error.code, "BOOK_CRAFT_PROXY_RESPONSE_INVALID");
      return true;
    }
  );
}

async function assertFingerprintTamperingIsRejected(): Promise<void> {
  await assert.rejects(
    requestEvavoDocsSuiteLegacyCraft({
      requestId: "request:fingerprint",
      requestedAt: "2026-08-05T00:00:00.000Z",
      payload,
      configuration,
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
        return remoteResponse(request, { requestFingerprint: `sha256:${"f".repeat(64)}` });
      }
    }),
    (error: unknown) => {
      assert.ok(error instanceof EvavoDocsSuiteLegacyCraftProxyError);
      assert.equal(error.code, "BOOK_CRAFT_PROXY_RESPONSE_TAMPERED");
      return true;
    }
  );
}

function assertPublicRequestValidation(): void {
  assert.deepEqual(validateEvavoLegacyCraftPublicRequest(payload), payload);
  assert.throws(
    () => validateEvavoLegacyCraftPublicRequest({ ...payload, localFallback: true }),
    /BOOK_CRAFT_REQUEST_INVALID/
  );
  assert.throws(
    () => validateEvavoLegacyCraftPublicRequest({ operation: "unknown" }),
    /BOOK_CRAFT_OPERATION_UNSUPPORTED/
  );
}

async function main(): Promise<void> {
  assertPublicRequestValidation();
  await assertExactRemoteExecution();
  await assertNoRetryAndNoSecretLeak();
  await assertTimeoutIsNotRetried();
  await assertAuthorityTamperingIsRejected();
  await assertUnknownResponseFieldsAreRejected();
  await assertFingerprintTamperingIsRejected();

  console.log(JSON.stringify({
    status: "PASS",
    contract: "evavo_docs_book_legacy_craft_genome_v1",
    endpoint: "/api/v1/book-studio/legacy-craft-genome",
    websiteLocalCraftExecutionAllowed: false,
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
