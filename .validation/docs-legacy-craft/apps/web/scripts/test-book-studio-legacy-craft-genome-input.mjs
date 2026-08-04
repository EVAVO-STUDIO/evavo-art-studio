import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_LEGACY_CRAFT_GENOME_MAX_BODY_BYTES,
  readBoundedBookLegacyCraftGenomeJson,
} from "../src/lib/book-studio-legacy-craft-genome-input.ts";

function request(source, declaredLength) {
  const headers = new Headers();
  if (declaredLength !== undefined) headers.set("content-length", String(declaredLength));
  return {
    headers,
    text: async () => source,
  };
}

test("legacy craft reader accepts bounded JSON", async () => {
  const value = await readBoundedBookLegacyCraftGenomeJson(request('{"ok":true}', 11));
  assert.deepEqual(value, { ok: true });
});

test("legacy craft reader rejects declared oversize and malformed length", async () => {
  await assert.rejects(
    readBoundedBookLegacyCraftGenomeJson(request("{}", BOOK_LEGACY_CRAFT_GENOME_MAX_BODY_BYTES + 1)),
    /BODY_TOO_LARGE/,
  );
  await assert.rejects(
    readBoundedBookLegacyCraftGenomeJson(request("{}", "not-a-number")),
    /BODY_TOO_LARGE/,
  );
  await assert.rejects(
    readBoundedBookLegacyCraftGenomeJson(request("{}", -1)),
    /BODY_TOO_LARGE/,
  );
});

test("legacy craft reader enforces actual UTF-8 bytes without trusting content length", async () => {
  const oversized = `"${"x".repeat(BOOK_LEGACY_CRAFT_GENOME_MAX_BODY_BYTES)}"`;
  await assert.rejects(
    readBoundedBookLegacyCraftGenomeJson(request(oversized, 2)),
    /BODY_TOO_LARGE/,
  );
});

test("legacy craft reader rejects empty and invalid JSON", async () => {
  await assert.rejects(readBoundedBookLegacyCraftGenomeJson(request("   ")), /BODY_INVALID/);
  await assert.rejects(readBoundedBookLegacyCraftGenomeJson(request("{not-json}")), /BODY_INVALID/);
});
