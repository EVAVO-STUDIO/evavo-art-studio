import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("owner sessions use HMAC, constant-time comparison and HttpOnly cookies", async () => {
  const auth = await read("lib/operator-auth.ts");
  const route = await read("app/api/operator/session/route.ts");
  for (const token of [
    "createHmac",
    "timingSafeEqual",
    "randomUUID",
    "EVAVO_ART_OPERATOR_ACCESS_TOKEN",
    "EVAVO_ART_OPERATOR_SESSION_SECRET",
    "MINIMUM_SECRET_BYTES = 32",
    "OPERATOR_SESSION_COOKIE",
    'httpOnly: true',
    'sameSite: "strict"',
    'priority: "high"',
    "operatorAccessTokenMatches",
    "createOperatorSession",
  ]) {
    assert.ok(`${auth}\n${route}`.includes(token), `missing session token: ${token}`);
  }
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "document.cookie",
    "NEXT_PUBLIC_",
    "EVAVO_ART_WRITE_TOKEN",
  ]) {
    assert.ok(!route.includes(forbidden), `session route exposes forbidden token: ${forbidden}`);
  }
});

test("session claims are versioned, expiring and bounded", async () => {
  const auth = await read("lib/operator-auth.ts");
  for (const token of [
    'OPERATOR_SESSION_VERSION = "1"',
    'subject: "owner"',
    "issuedAt",
    "expiresAt",
    "CLOCK_SKEW_SECONDS",
    "MAXIMUM_SESSION_SECONDS",
    'toString("base64url")',
  ]) {
    assert.ok(auth.includes(token), `missing claim invariant: ${token}`);
  }
});
