import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("operator gateway keeps API credentials server-side and bounds traffic", async () => {
  const source = await read("lib/operator-server.ts");
  for (const token of [
    "EVAVO_ART_API_BASE_URL",
    "EVAVO_ART_WRITE_TOKEN",
    "OPERATOR_SESSION_COOKIE",
    "verifyOperatorSession",
    "isSameOriginOperatorRequest",
    "readBoundedOperatorJson",
    "boundedResponseBody",
    "AbortController",
    "RATE_MAXIMUM_REQUESTS",
    'redirect: "error"',
    'cache: "no-store"',
    'authorization: `Bearer ${configuration.token}`',
    "operatorUpstreamPathAllowed",
    "redactOperatorValue(body)",
    "containsUnredactedSecretKey",
  ]) {
    assert.ok(source.includes(token), `missing gateway invariant: ${token}`);
  }
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "window.fetch",
    "eval(",
    "child_process",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "operatorResponse(body, response.status",
  ]) {
    assert.ok(!source.includes(forbidden), `forbidden gateway shortcut: ${forbidden}`);
  }
});

test("runtime proxy exposes only fixed routes and validated dynamic identifiers", async () => {
  const jobs = await read("app/api/operator/runtime/jobs/route.ts");
  const job = await read("app/api/operator/runtime/jobs/[jobId]/route.ts");
  const action = await read("app/api/operator/runtime/jobs/[jobId]/[action]/route.ts");
  const events = await read("app/api/operator/runtime/events/route.ts");
  const recover = await read("app/api/operator/runtime/recover/route.ts");
  const artifact = await read("app/api/operator/artifacts/[artifactId]/route.ts");
  const policy = await read("lib/operator-upstream-policy.ts");
  const combined = [jobs, job, action, events, recover, artifact, policy].join("\n");
  for (const token of [
    "/v1/runtime/jobs",
    "operatorJobPath",
    "/v1/runtime/recover",
    "/v1/runtime/events",
    "operatorArtifactPath",
    "readBoundedOperatorJson",
    "ALLOWED_UPSTREAM_PATHS",
    "operatorUpstreamPathAllowed",
    "cancel|pause|resume|redrive",
    "artifact_[a-f0-9]{64}",
  ]) {
    assert.ok(combined.includes(token), `missing proxy route invariant: ${token}`);
  }
  assert.ok(!combined.includes("process.env.EVAVO_ART_WRITE_TOKEN"), "browser routes must not read the API token directly");
  assert.ok(!policy.includes('startsWith("/v1/")'), "route policy must not use a broad prefix allow-list");
});
