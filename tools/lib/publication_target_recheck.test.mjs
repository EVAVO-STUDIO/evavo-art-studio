import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCloudinaryTargetIdentifier,
  normalizeCloudinaryUrl,
  recheckPublicationTarget,
} from "./publication_target_recheck.mjs";

test("accepts only governed unversioned Cloudinary stable delivery URLs", () => {
  const valid = normalizeCloudinaryUrl("https://res.cloudinary.com/dntogqtey/image/upload/evavo/work/header.png");
  assert.equal(valid.url.hostname, "res.cloudinary.com");
  assert.doesNotThrow(() => assertCloudinaryTargetIdentifier(valid.decodedPath, "evavo/work/header"));
  assert.throws(() => normalizeCloudinaryUrl("https://res.cloudinary.com/dntogqtey/image/upload/v123/evavo/work/header.png"), /unversioned stable delivery URL/u);
  assert.throws(() => normalizeCloudinaryUrl("https://res.cloudinary.com/other/image/upload/evavo/work/header.png"), /governed dntogqtey image cloud/u);
  assert.throws(() => normalizeCloudinaryUrl("https://res.cloudinary.com/dntogqtey/image/upload/evavo/work/header.png?cache=bust"), /must not contain query parameters/u);
});

test("rejects Cloudinary URL that does not address planned stable public ID", () => {
  const value = normalizeCloudinaryUrl("https://res.cloudinary.com/dntogqtey/image/upload/evavo/work/other.png");
  assert.throws(() => assertCloudinaryTargetIdentifier(value.decodedPath, "evavo/work/header"), /does not address the planned stable public ID/u);
});

test("website publication recheck remains governed-local and rejects remote URL", async () => {
  const bytes = Buffer.from("current-target");
  const result = await recheckPublicationTarget({
    targetKind: "website-header-source-update",
    targetIdentifier: "src/content/workHeaderHeritage.ts",
    currentTargetRecheckPath: "C:/evidence/current-target.bin",
    readLocal: async (path) => ({ path, bytes, sha256: "a".repeat(64), byteLength: bytes.length }),
  });
  assert.equal(result.mode, "governed-local-website-source");
  await assert.rejects(() => recheckPublicationTarget({
    targetKind: "website-header-source-update",
    targetIdentifier: "src/content/workHeaderHeritage.ts",
    currentTargetRecheckPath: "C:/evidence/current-target.bin",
    currentTargetRecheckUrl: "https://example.com/current",
    readLocal: async () => ({ bytes, sha256: "a".repeat(64), byteLength: bytes.length }),
  }), /must use currentTargetRecheckPath/u);
});

test("Cloudinary publication recheck refuses caller-supplied local target files", async () => {
  await assert.rejects(() => recheckPublicationTarget({
    targetKind: "cloudinary-stable-id-replacement",
    targetIdentifier: "evavo/work/header",
    currentTargetRecheckPath: "C:/evidence/stale-copy.png",
    currentTargetRecheckUrl: "https://res.cloudinary.com/dntogqtey/image/upload/evavo/work/header.png",
  }), /must use currentTargetRecheckUrl/u);
});
