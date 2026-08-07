import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/legacy-registration-readiness-batch.ts", import.meta.url),
  "utf8",
);
const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("batch readiness delegates only to the compile-only single-item boundary", () => {
  assert.match(source, /assessLegacyBookArtDryRunReadiness/);
  for (const forbidden of [
    "ArtifactStore",
    "RuntimeRepository",
    "ProviderRegistry",
    "registerLegacyBookArtBytes",
    "writeFile",
    "appendFile",
    "fetch(",
    "provider.generate",
    "selectBookArt",
    "promoteBookArt",
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `batch readiness source must not contain ${forbidden}`,
    );
  }
});

test("batch readiness preserves all migration authority as false", () => {
  for (const token of [
    "dryRunOnly: true as const",
    "sourceArtifactWriteAttempted: false as const",
    "evidenceArtifactWriteAttempted: false as const",
    "providerCallPerformed: false as const",
    "selectionPerformed: false as const",
    "promotionPerformed: false as const",
    "bookUseBindingCreated: false as const",
    "canonicalWriterChanged: false as const",
    "runtimeCutoverApproved: false as const",
    "publicationPerformed: false as const",
  ]) {
    assert.match(
      source,
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")),
    );
  }
  for (const forbidden of [
    "sourceArtifactWriteAttempted: true",
    "evidenceArtifactWriteAttempted: true",
    "providerCallPerformed: true",
    "selectionPerformed: true",
    "promotionPerformed: true",
    "bookUseBindingCreated: true",
    "canonicalWriterChanged: true",
    "runtimeCutoverApproved: true",
    "publicationPerformed: true",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});

test("batch readiness snapshots hostile input and exact bytes before awaiting", () => {
  const snapshotPosition = source.indexOf("snapshotBatch(value, blockers)");
  const awaitPosition = source.indexOf("await assessLegacyBookArtDryRunReadiness");
  assert.ok(snapshotPosition >= 0);
  assert.ok(awaitPosition > snapshotPosition);
  assert.match(source, /Object\.getOwnPropertyDescriptors/);
  assert.match(source, /must not contain sparse slots or accessors/);
  assert.match(source, /output\.set\(value\)/);
  assert.match(source, /registration plan is replayed/);
});

test("package exports the compiled batch boundary", () => {
  assert.deepEqual(
    packageManifest.exports["./legacy-registration-readiness-batch"],
    {
      types: "./dist/legacy-registration-readiness-batch.d.ts",
      import: "./dist/legacy-registration-readiness-batch.js",
    },
  );
});
