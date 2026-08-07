import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const commandSource = readFileSync(
  new URL("../src/book-art-legacy-readiness-file-command.ts", import.meta.url),
  "utf8",
);
const cliSource = readFileSync(
  new URL("../src/legacy-readiness-cli.ts", import.meta.url),
  "utf8",
);
const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("local readiness command delegates only to the compile-only batch boundary", () => {
  assert.match(commandSource, /assessLegacyBookArtDryRunReadinessBatch/);
  for (const forbidden of [
    "LocalArtifactStore",
    "LocalRuntimeRepository",
    "ArtifactStore",
    "RuntimeRepository",
    "ProviderRegistry",
    "registerLegacyBookArtBytes",
    "submitBookArt",
    "fetch(",
    "provider.generate",
    "selectBookArt",
    "promoteBookArt",
  ]) {
    assert.equal(
      commandSource.includes(forbidden),
      false,
      `local readiness source must not contain ${forbidden}`,
    );
  }
});

test("local readiness command uses exclusive no-follow writes and exact readback", () => {
  for (const token of [
    "fsConstants.O_EXCL",
    "fsConstants.O_NOFOLLOW",
    "receipt.handle.sync()",
    "RECEIPT_READBACK_MISMATCH",
    "SOURCE_FILE_SYMLINK",
    "FALSE_AUTHORITY_FIELDS",
  ]) {
    assert.ok(
      commandSource.includes(token),
      `local readiness command must contain ${token}`,
    );
  }
  assert.ok(commandSource.indexOf("reserveReceipt(receiptPath)") <
    commandSource.indexOf("readExactRegularFile(\n      inputPath"));
});

test("success and error surfaces preserve zero migration authority", () => {
  for (const source of [commandSource, cliSource]) {
    for (const token of [
      "networkCallPerformed: false",
      "sourceArtifactWriteAttempted: false",
      "evidenceArtifactWriteAttempted: false",
      "providerCallPerformed: false",
      "selectionPerformed: false",
      "promotionPerformed: false",
      "bookUseBindingCreated: false",
      "canonicalWriterChanged: false",
      "runtimeCutoverApproved: false",
      "retailerUploadPerformed: false",
      "publicationPerformed: false",
    ]) {
      assert.ok(source.includes(token), `${token} must remain explicit`);
    }
  }
});

test("CLI package exposes the dedicated local readiness binary", () => {
  assert.equal(
    packageManifest.bin["evavo-book-art-legacy-readiness-batch"],
    "./dist/legacy-readiness-cli.js",
  );
  assert.equal(
    packageManifest.scripts["start:legacy-readiness"],
    "node dist/legacy-readiness-cli.js",
  );
});
