import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../openapi.revision-ranking.yaml", import.meta.url);

test("revision ranking OpenAPI remains compile-only and capability complete", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const token of [
    "/v1/repair-revision-ranking-protocol:",
    "/v1/repair-revision-rankings/validate:",
    "/v1/repair-revision-rankings/compile:",
    "art.repair.rank-revisions",
    "repaired-family-selection-bridge-evidence",
    "revision-bound-candidate-selection-evidence",
    "repair.revision-ranking",
    "selection.compare",
    "artifacts.store",
    "evidence.bundle",
  ]) {
    assert.ok(source.includes(token), `missing ranking OpenAPI token: ${token}`);
  }
  for (const forbidden of [
    "/run:",
    "/promote:",
    "selection.promote",
    "updateReference",
    "provider.inpaint",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `ranking OpenAPI exposes forbidden authority: ${forbidden}`,
    );
  }
});
