import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("operator responses redact lease tokens and secret-like payload fields", async () => {
  const redaction = await read("lib/operator-redaction.ts");
  const gateway = await read("lib/operator-server.ts");
  for (const token of [
    "leaseToken",
    "api[_-]?key",
    "authorization",
    "credential",
    "password",
    "secret",
    "token",
    'const REDACTED = "[REDACTED]"',
    "redactOperatorValue(body)",
    "operatorUpstreamPathAllowed",
    "ALLOWED_UPSTREAM_PATHS",
  ]) {
    assert.ok(`${redaction}\n${gateway}`.includes(token), `missing redaction invariant: ${token}`);
  }
  assert.ok(!gateway.includes("operatorResponse(body, response.status"), "raw upstream body must not be returned");
});
