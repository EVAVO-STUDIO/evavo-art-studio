import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { GET, POST } from "../src/app/api/books/write/craft-genome/route";
import { fingerprintEvavoLegacyCraftValue } from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftShared";
import type { EvavoDocsSuiteLegacyCraftRequestV1 } from "../src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftTypes";

const environmentKeys = [
  "EVAVO_DOCS_SUITE_BOOK_CRAFT_URL",
  "EVAVO_DOCS_SUITE_BOOK_CRAFT_TOKEN",
  "EVAVO_WEBSITE_COMMIT_SHA",
  "EVAVO_DOCS_SUITE_BOOK_CRAFT_TIMEOUT_MS"
] as const;

function successfulRemoteResponse(
  request: EvavoDocsSuiteLegacyCraftRequestV1,
  overrides: Record<string, unknown> = {}
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
      schemaVersion: 1,
      status: "blocked",
      blockers: ["Validation fixture is intentionally incomplete."]
    },
    blockers: ["Validation fixture is intentionally incomplete."],
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
    workspaceId: "workspace:validation",
    actorType: "automation",
    result
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function publicPayload() {
  return {
    operation: "compile_profile",
    compileInput: {
      programmeId: "programme:validation",
      profileId: "profile:validation",
      profileVersion: 1,
      influences: [],
      projectVoiceAnchorIds: [],
      narrativeConstraintIds: [],
      acceptedPatternIds: [],
      rejectedPatternIds: []
    }
  };
}

test("exact Website route remains proxy-only and fails closed", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  process.env.EVAVO_DOCS_SUITE_BOOK_CRAFT_URL = "https://docs.example.test";
  process.env.EVAVO_DOCS_SUITE_BOOK_CRAFT_TOKEN = "secret.payload";
  process.env.EVAVO_WEBSITE_COMMIT_SHA = "a".repeat(40);
  process.env.EVAVO_DOCS_SUITE_BOOK_CRAFT_TIMEOUT_MS = "1000";

  try {
    const capability = await GET();
    assert.equal(capability.status, 200);
    assert.equal(capability.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(capability.headers.get("x-robots-tag"), "noindex, nofollow");
    const capabilityBody = await capability.json() as Record<string, unknown>;
    assert.equal(capabilityBody.ok, true);
    const capabilityData = capabilityBody.data as Record<string, unknown>;
    assert.equal(capabilityData.websiteExecutionMode, "proxy_only");
    assert.equal(capabilityData.executionOwner, "Docs Suite compatibility authority");

    let calls = 0;
    globalThis.fetch = (async (input, init) => {
      calls += 1;
      assert.equal(String(input), "https://docs.example.test/api/v1/book-studio/legacy-craft-genome");
      assert.equal(init?.redirect, "error");
      const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
      return successfulRemoteResponse(request);
    }) as typeof fetch;

    const success = await POST(new NextRequest("http://website.test/api/books/write/craft-genome", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(publicPayload())
    }));
    assert.equal(success.status, 200);
    assert.equal(success.headers.get("cache-control"), "private, no-store, max-age=0");
    const successBody = await success.json() as Record<string, unknown>;
    assert.equal(successBody.ok, true);
    const successData = successBody.data as Record<string, unknown>;
    assert.equal(successData.outputKind, "evavo_book_studio_craft_genome_profile");
    assert.equal(Object.hasOwn(successData, "remoteExecutionPerformed"), false);
    assert.equal(calls, 1);

    calls = 0;
    const invalid = await POST(new NextRequest("http://website.test/api/books/write/craft-genome", {
      method: "POST",
      body: "{not-json}"
    }));
    assert.equal(invalid.status, 400);
    assert.equal(calls, 0);

    const oversized = await POST({
      headers: new Headers({ "content-length": String(8 * 1024 * 1024 + 1) }),
      text: async () => "{}"
    } as NextRequest);
    assert.equal(oversized.status, 413);
    assert.equal(calls, 0);

    calls = 0;
    globalThis.fetch = (async (_input, init) => {
      calls += 1;
      const request = JSON.parse(String(init?.body)) as EvavoDocsSuiteLegacyCraftRequestV1;
      return successfulRemoteResponse(request, { providerCalled: true });
    }) as typeof fetch;
    const escalated = await POST(new NextRequest("http://website.test/api/books/write/craft-genome", {
      method: "POST",
      body: JSON.stringify(publicPayload())
    }));
    assert.equal(escalated.status, 502);
    const escalatedSource = await escalated.text();
    assert.equal(escalatedSource.includes("secret.payload"), false);
    assert.match(escalatedSource, /BOOK_CRAFT_PROXY_RESPONSE_TAMPERED/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of environmentKeys) {
      const previous = previousEnvironment[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
});
