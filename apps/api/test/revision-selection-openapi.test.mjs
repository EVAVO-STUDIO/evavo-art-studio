import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const specificationUrl = new URL(
  "../openapi.revision-selection.yaml",
  import.meta.url,
);

test("revision selection OpenAPI remains compile-only and capability complete", async () => {
  const source = await readFile(specificationUrl, "utf8");
  for (const token of [
    "/v1/repair-revision-selection-protocol:",
    "/v1/repair-revision-selections/validate:",
    "/v1/repair-revision-selections/compile:",
    "art.repair.prepare-revision-selection",
    "art.candidate.select",
    "repair.revision-selection",
    "artifacts.store",
    "evidence.bundle",
    "minItems: 2",
    "maxItems: 32",
    "durable-worker-or-deliberate-local-run",
  ]) {
    assert.ok(source.includes(token), `missing revision selection OpenAPI token: ${token}`);
  }
  for (const forbidden of [
    "/run:",
    "/execute:",
    "selection.promote",
    "provider.inpaint",
    "updateReference",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `revision selection OpenAPI exposes forbidden authority: ${forbidden}`,
    );
  }
});
