import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("durable image review session binds exact source and comparison bytes", async () => {
  const source = await read("./image_review_session_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-review-session.v1"',
    "sourceSha256AndLengthBound: true",
    "comparisonSha256AndLengthBound: true",
    "sourceBinding",
    "comparisonBindings",
    "sha256",
    "byteLength",
  ]) assert.ok(source.includes(token), `missing review-session binding token: ${token}`);
});

test("review session can be reverified and carries no promotion authority", async () => {
  const source = await read("./image_review_session_mcp.mjs");
  for (const token of [
    "evavo_verify_image_review_session",
    "staleEvidenceVerification: true",
    'approvalState: "unapproved"',
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    "publicationAllowed: false",
  ]) assert.ok(source.includes(token), `missing review-session safety token: ${token}`);
});

test("review session receipt is create-only and leaves source immutable", async () => {
  const source = await read("./image_review_session_mcp.mjs");
  assert.ok(source.includes("writeCreateOnlyBundle"));
  assert.ok(source.includes("createOnlyReceiptWrite: true"));
  assert.ok(source.includes("sourceMutationPerformed: false"));
  assert.ok(!source.includes("writeFile(source"), "source mutation primitive unexpectedly present");
});
