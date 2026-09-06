import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("existing-image review uses profile-aware hidden RGB policy", async () => {
  const source = await read("./existing_image_review_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.2.0"',
    'contract: "evavo_existing_image_review_v1_2"',
    "profileTransparentRgbMode",
    'profile.name === "logo-transparent" || profile.name === "product-cutout" ? "all" : "edge-only"',
    "edgeAwareTransparentRgbDefault: true",
    'strictWholeCanvasTransparentRgbProfiles: ["logo-transparent", "product-cutout"]',
  ]) assert.ok(source.includes(token), `missing profile-policy token: ${token}`);
});

test("existing-image edit review publishes proof diff and receipt atomically", async () => {
  const source = await read("./existing_image_review_mcp.mjs");
  for (const token of [
    "writeCreateOnlyBundle",
    "rollbackSafeReviewOutputBundle: true",
    "{ path: proofPath, data: review.proofPng }",
    "{ path: diffPath, data: review.differenceProofPng }",
  ]) assert.ok(source.includes(token), `missing rollback-safe review token: ${token}`);
  assert.ok(!source.includes("await writeFile(proofPath"), "sequential proof write unexpectedly returned");
  assert.ok(!source.includes("await writeFile(diffPath"), "sequential diff write unexpectedly returned");
  assert.ok(!source.includes("await writeFile(receiptPath"), "sequential receipt write unexpectedly returned");
});

test("technical edit pass remains explicitly separate from visual approval", async () => {
  const source = await read("./existing_image_review_mcp.mjs");
  assert.ok(source.includes('"technical-pass-visual-review-required"'));
  assert.ok(source.includes("visualReviewRequired: true"));
  assert.ok(source.includes("numeric QA is a gate, not final art direction"));
});
