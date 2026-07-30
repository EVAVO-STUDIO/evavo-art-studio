import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../openapi.revision-promotion.yaml", import.meta.url);

test("revision promotion OpenAPI remains compile-only and capability complete", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const token of [
    "/v1/repair-revision-promotion-protocol:",
    "/v1/repair-revision-promotions/validate:",
    "/v1/repair-revision-promotions/compile:",
    "art.repair.promote-revision",
    "revision-bound-candidate-selection-evidence",
    "revision-bound-promotion-evidence",
    "expectedArtifactId",
    "expectedGeneration",
    "repair.revision-promote",
    "selection.promote",
    "artifacts.store",
    "evidence.bundle",
  ]) {
    assert.ok(source.includes(token), `missing promotion OpenAPI token: ${token}`);
  }
  for (const forbidden of [
    "/run:",
    "/execute:",
    "provider.inpaint",
    "updateReference",
    "OPENAI_API_KEY",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `promotion OpenAPI exposes forbidden authority: ${forbidden}`,
    );
  }
});
