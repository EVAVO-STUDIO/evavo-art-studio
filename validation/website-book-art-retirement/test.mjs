import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(root, "bookArtRetirementCompatibility.ts");
const source = await readFile(sourcePath);
const header = Buffer.from(`blob ${source.byteLength}\0`, "utf8");
const blobSha = createHash("sha1").update(header).update(source).digest("hex");
assert.equal(blobSha, "5895c06ce0f57271f09c29c5ec0841c0a9fd7f25");

const sourceText = source.toString("utf8");
for (const token of [
  "Website Book Art production is retired",
  "EVAVO-STUDIO/evavo-art-studio",
  "EVAVO-STUDIO/evavo-docs-suite",
  "retiredFunction",
]) assert.ok(sourceText.includes(token), `Exact source is missing ${token}.`);
for (const forbidden of [
  'from "sharp"',
  "new OpenAI",
  "images.generate",
  "images.edit",
  "artifactStore.put(",
  "providerCallPerformed: true",
  "selectionPerformed: true",
  "promotionPerformed: true",
  "publicationPerformed: true",
]) assert.ok(!sourceText.includes(forbidden), `Exact source contains ${forbidden}.`);

const manifest = JSON.parse(await readFile(path.join(root, "shim-paths.json"), "utf8"));
assert.equal(manifest.length, 62);
assert.equal(new Set(manifest).size, 62);
for (const name of manifest) {
  assert.equal(
    await readFile(path.join(root, "generated", name), "utf8"),
    'export * from "./bookArtRetirementCompatibility";\n',
    `${name} is not the exact fail-closed shim.`,
  );
}

const retired = await import(
  pathToFileURL(path.join(root, "dist", "bookArtRetirementCompatibility.js")).href
);
const classNames = new Set([
  "BookCoverIterationStore",
  "InMemoryBookCoverIterationStore",
  "FileBookCoverIterationStore",
  "BookCoverIterationStoreFactory",
]);
let checkedFunctions = 0;
for (const [name, value] of Object.entries(retired)) {
  if (name === "WEBSITE_BOOK_ART_RETIREMENT_MESSAGE") {
    assert.match(value, /Website Book Art production is retired/);
    continue;
  }
  if (name === "bookCoverAntiSyntheticWorkflow") {
    assert.equal(Object.isFrozen(value), true);
    assert.equal(value.status, "retired");
    assert.equal(value.authoritativeRepository, "EVAVO-STUDIO/evavo-art-studio");
    assert.match(value.boundary, /Website Book Art production is retired/);
    continue;
  }
  assert.equal(typeof value, "function", `${name} is an unexpected runtime export.`);
  if (classNames.has(name)) {
    assert.throws(() => new value(), /Website Book Art production is retired/);
  } else {
    assert.throws(() => value(), /Website Book Art production is retired/);
  }
  checkedFunctions += 1;
}
assert.ok(checkedFunctions >= 70, `Only ${checkedFunctions} runtime entrypoints were checked.`);

const signedReceipts = {
  authority: "dbb408f53f53c3ab1d295caa2168f01eaeb0ef7cb170367a29bdbf8bb3124c6e",
  retirement: "sha256:ebf3663aa2ac35b5b7b688d1b3af9699d891923a7a32bd79a109ef206cec7a62",
  destination: "sha256:6e25d289fbe58498b619ac674d4e1bcf29185b2b2e2e4d13d422279c32514e8b",
  symbolSplitClosure: "sha256:c5ea5c925773fa4509940e66196927f83bdc52070870d8eb1691cf390a47cc0a",
};
for (const [name, fingerprint] of Object.entries(signedReceipts)) {
  assert.match(fingerprint, name === "authority" ? /^[a-f0-9]{64}$/ : /^sha256:[a-f0-9]{64}$/);
}

console.log(JSON.stringify({
  status: "PASS",
  websiteCompatibilityBlobSha: blobSha,
  exactShimCount: manifest.length,
  failClosedRuntimeEntrypointsChecked: checkedFunctions,
  signedReceipts,
  providerExecutionRestored: false,
  sourceOwnershipBoundaryCount: 0,
  overallBookProductCutoverApproved: false,
  publicationPerformed: false,
}, null, 2));
