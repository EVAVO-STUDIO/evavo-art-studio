import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));

const registration = read("packages/book-art-runtime/src/legacy-registration.ts");
const tests = read("packages/book-art-runtime/test/legacy-registration.test.mjs");
const packageJson = json("packages/book-art-runtime/package.json");
const tsconfig = json("packages/book-art-runtime/tsconfig.json");
const cli = read("apps/cli/src/book-art-commands.ts");
const cliTests = read("apps/cli/test/book-art-cli-legacy-registration.test.mjs");
const workflow = read(".github/workflows/book-art-provider-runtime.yml");
const docs = read("docs/book-art-provider-runtime.md");
const problems = [];

function assert(condition, message) {
  if (!condition) problems.push(message);
}

for (const token of [
  "evavo_book_art_legacy_byte_registration_v1",
  "compileLegacyBookArtByteRegistration",
  "registerLegacyBookArtBytes",
  "importLegacyWebsiteBookArtState",
  "validateLegacyCompatibleBookArtArtifactReceipt",
  "stateImportInput",
  "stateImportFingerprintSha256",
  "decodeSpriteFrame",
  'storageClass: "source"',
  'artifactRole: "book-art-legacy-source"',
  'approvalState: "unapproved"',
  'artifactRole: "book-art-legacy-byte-registration-evidence"',
  "storedBytes.equals(sourceBytes)",
  "exactSourceBytesPreserved: true",
  "artifactBytesRewritten: false",
  "legacyApprovalPromotedAutomatically: false",
  "technicalQaRequired: true",
  "selectionRequired: true",
  "promotionRequired: true",
  "bookUseBindingRequired: true",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]) {
  assert(registration.includes(token), `Legacy byte registration is missing ${token}`);
}
assert(
  (registration.match(/options\.artifacts\.put\(/g) ?? []).length === 2,
  "Legacy byte registration must write exactly one source artifact and one evidence artifact",
);
for (const forbidden of [
  "updateReference(",
  "promoteSelectedCandidate",
  "ProviderRegistry",
  "executeProviderCandidateRequest",
  'storageClass: "master"',
  'approvalState: "selected"',
  'approvalState: "approved"',
  "artifactBytesRewritten: true",
  "legacyApprovalPromotedAutomatically: true",
  "selectionPerformed: true",
  "promotionPerformed: true",
  "bookUseBindingCreated: true",
  "runtimeCutoverApproved: true",
  "publicationPerformed: true",
]) {
  assert(
    !registration.includes(forbidden),
    `Legacy byte registration contains forbidden authority shortcut ${forbidden}`,
  );
}

assert(
  packageJson.exports?.["./legacy-registration"]?.import ===
    "./dist/legacy-registration.js",
  "Book Art runtime package must export ./legacy-registration",
);
assert(
  packageJson.dependencies?.["@evavo/art-quality"] === "workspace:*",
  "Book Art runtime package must declare @evavo/art-quality",
);
assert(
  tsconfig.references?.some((entry) => entry.path === "../quality"),
  "Book Art runtime TypeScript project must reference ../quality",
);

for (const token of [
  "book-art-legacy-register",
  "registerLegacyBookArtBytes",
  "sourceFile",
  "LocalArtifactStore",
]) {
  assert(cli.includes(token), `Book Art CLI is missing ${token}`);
}
for (const title of [
  "registers exact legacy artwork bytes once without re-encoding or approval",
  "blocks checksum and dimension drift before any artifact write",
  "rejects unsafe legacy evidence, unsupported purpose and unsafe source paths",
]) {
  assert(tests.includes(title), `Legacy registration tests are missing: ${title}`);
}
for (const title of [
  "CLI registers exact legacy Book Art bytes without provider policy or approval",
  "CLI blocks checksum drift before writing any registration artifact",
]) {
  assert(cliTests.includes(title), `Legacy registration CLI tests are missing: ${title}`);
}

for (const token of [
  "scripts/check-book-art-legacy-registration.mjs",
  "apps/cli/test/book-art-cli-legacy-registration.test.mjs",
  "node scripts/check-book-art-legacy-registration.mjs",
  "pnpm --filter @evavo/art-book-runtime test",
  "pnpm --filter @evavo/art-studio-cli test",
  "pnpm check",
  "Remove bounded validation scratch and verify clean exact source",
  "rm -rf examples/legacy-book-artwork-registration/artifacts",
  "test ! -e examples/legacy-book-artwork-registration/artifacts",
  'git status --porcelain=v1 --untracked-files=all',
]) {
  assert(workflow.includes(token), `Book Art workflow is missing ${token}`);
}
assert(
  (workflow.match(/rm -rf examples\/legacy-book-artwork-registration\/artifacts/g) ?? [])
    .length === 1,
  "Book Art workflow must remove exactly one bounded legacy-registration scratch directory",
);
assert(
  !workflow.includes("rm -rf examples/legacy-book-artwork-registration\n"),
  "Book Art workflow must not remove the complete legacy-registration example boundary",
);
for (const token of [
  "Register exact legacy artwork bytes",
  "book-art-legacy-register",
  "byte-for-byte",
  "unapproved source artifact",
  "does not re-encode",
  "Website remains the active compatibility runtime",
]) {
  assert(docs.includes(token), `Book Art runtime documentation is missing ${token}`);
}

if (problems.length) {
  console.error("Book Art legacy byte-registration boundary check failed.");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      contract: "evavo_book_art_legacy_byte_registration_v1",
      sharedRuntimeExport: "@evavo/art-book-runtime/legacy-registration",
      cliCommand: "book-art-legacy-register",
      sourceStorageClass: "source",
      approvalState: "unapproved",
      exactSourceBytesPreserved: true,
      artifactBytesRewritten: false,
      sourceArtifactWrites: 1,
      evidenceArtifactWrites: 1,
      namedReferenceUpdates: 0,
      boundedValidationScratchCleanup: true,
      selectionPerformed: false,
      promotionPerformed: false,
      bookUseBindingCreated: false,
      websiteRuntimeStillActive: true,
      runtimeCutoverApproved: false,
      publicationPerformed: false,
    },
    null,
    2,
  ),
);
