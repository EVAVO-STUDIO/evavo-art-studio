import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ENHANCEMENT_ART_REVIEW_SCHEMA_SHA256 } from "../dist/index.js";

const schemaUrl = new URL("../../../contracts/art-studio-enhancement-review-v1.schema.json", import.meta.url);

test("Art Studio review schema bytes match the admission digest constant", async () => {
  const bytes = await readFile(schemaUrl);
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest, ENHANCEMENT_ART_REVIEW_SCHEMA_SHA256);
});

test("shared schema requires its own digest field and remains fail-closed", async () => {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes("schema_sha256"));
  assert.equal(schema.properties.schema_sha256.$ref, "#/$defs/sha256");
  assert.equal(schema.properties.publication_allowed.const, false);
  assert.equal(schema.properties.cloud_overwrite_allowed.const, false);
  assert.equal(schema.properties.source_immutable.const, true);
});
