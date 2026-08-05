import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const exact = new Map([
  ["tools/evavo-doc-studio/src/evavo/api/apiResponse.ts", "fa0574887e110c74fc2a9b4c322dd4c403c2aef1"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftContracts.ts", "ba47423fc28a7e225ad69ba0443bf595f0431ebd"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftShared.ts", "07b733ea5b70b329f6e3f6ca4180b566256c96f1"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftTypes.ts", "3d4743e9106f763957beacaddcaef8ab64a598e6"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftStream.ts", "11f5ed979eafaa64bf767b8ae19f71d836087c03"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftClient.ts", "1cc6fc432b1280b7e490cda121e03d58436d3653"],
  ["tools/evavo-doc-studio/src/app/api/books/write/craft-genome/route.ts", "b898a24006b2d59c70235ae8dab10872432276f6"],
  ["tools/evavo-doc-studio/scripts/check-book-studio-craft-stream.ts", "5dbb0d5373d726ca3355a8b973c65f7dc92520df"],
  ["tools/evavo-doc-studio/scripts/check-book-studio-craft-provider-contract.ts", "8f8b7564dd860e0e1546e3f85efa8b2193f85922"],
  ["tools/evavo-doc-studio/scripts/check-book-studio-craft-proxy-route.ts", "2689abeb83735e3168d7fbf353253bff26347ac9"]
]);

const retired = [
  "tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioCraftGenome.ts",
  "tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioCraftGenomeTypes.ts",
  "tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioCraftGenomeUtils.ts",
  "tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioCraftGenomeCompiler.ts",
  "tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioCraftPhraseOverlap.ts",
  "tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioCraftProviderPacketValidation.ts",
  "tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioCraftProviderResponseContract.ts",
  "tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioCraftGenomeProviderPacket.ts",
  "tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioCraftProviderResponseValidation.ts"
];

const failures = [];
for (const [relative, expected] of exact) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) {
    failures.push(`${relative}: missing`);
    continue;
  }
  const actual = execFileSync("git", ["hash-object", absolute], { encoding: "utf8" }).trim();
  if (actual !== expected) failures.push(`${relative}: expected ${expected}, received ${actual}`);
}
for (const relative of retired) {
  if (existsSync(path.join(root, relative))) failures.push(`${relative}: retired source unexpectedly exists`);
}

if (failures.length) {
  console.error("Exact Website craft proxy HTTP mirror verification failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  websiteRepository: "EVAVO-STUDIO/Website",
  websiteBase: "42d859fe76306d25df93e8201b3911c3f79d163b",
  websiteHead: "983adc48176a673acaaf4199ade99e62831dff82",
  exactExecutableGitBlobs: exact.size,
  retiredLocalRuntimeFilesAbsent: retired.length,
  adaptiveBodyBufferRequired: true,
  remoteErrorBodiesParsed: false,
  ownerOrClientActorTypeRequired: true,
  rawInternalErrorsExposed: false,
  providerCalled: false,
  canonicalManuscriptMutationPerformed: false,
  automaticCanonicalAdmissionAllowed: false,
  publicationPerformed: false
}, null, 2));
