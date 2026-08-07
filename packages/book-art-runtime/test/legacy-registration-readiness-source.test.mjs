import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/legacy-registration-readiness.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("legacy readiness remains a dedicated public compile-only subpath", () => {
  assert.deepEqual(packageJson.exports?.["./legacy-registration-readiness"], {
    types: "./dist/legacy-registration-readiness.d.ts",
    import: "./dist/legacy-registration-readiness.js",
  });
  for (const token of [
    "evavo_book_art_legacy_dry_run_readiness_v1",
    "assessLegacyBookArtDryRunReadiness",
    "dryRunOnly: true",
    "sourceArtifactWriteAttempted: false",
    "evidenceArtifactWriteAttempted: false",
    "providerCallPerformed: false",
    "selectionPerformed: false",
    "promotionPerformed: false",
    "bookUseBindingCreated: false",
    "canonicalWriterChanged: false",
    "runtimeCutoverApproved: false",
    "publicationPerformed: false",
  ]) {
    assert.ok(source.includes(token), `readiness boundary is missing ${token}`);
  }
  for (const forbidden of [
    "registerLegacyBookArtBytes(",
    ".artifacts.put(",
    ".put(sourceBytes",
    "submitBatch(",
    "executeProviderCandidateRequest(",
    "promoteSelectedCandidate(",
    "updateReference(",
  ]) {
    assert.equal(source.includes(forbidden), false, `readiness boundary contains forbidden side effect ${forbidden}`);
  }
});
