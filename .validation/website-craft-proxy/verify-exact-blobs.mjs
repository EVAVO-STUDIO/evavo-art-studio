import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const exact = new Map([
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftTypes.ts", "42be33c54ee61e4989295c8635bd869a0704f37f"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftContracts.ts", "ba47423fc28a7e225ad69ba0443bf595f0431ebd"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftShared.ts", "07b733ea5b70b329f6e3f6ca4180b566256c96f1"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftStream.ts", "cedf55686fdb359f248d886d4b704c73af3d5d67"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftClient.ts", "729a7d6571a18b925959d63563cedabfcece4b27"],
  ["tools/evavo-doc-studio/src/app/api/books/write/craft-genome/route.ts", "162273537202cc666ad0ee92a03cf52ee7614461"],
  ["tools/evavo-doc-studio/scripts/check-book-studio-craft-provider-contract.ts", "726ccc606d8679e309ea5e6c1c31dd11c1a6b8a8"],
  ["tools/evavo-doc-studio/scripts/check-book-studio-craft-proxy-route.ts", "59db37cb9bff0c593e82c14a7d60c22a25d3a11b"],
  ["tools/evavo-doc-studio/scripts/check-book-studio-craft-genome.ts", "5780e839b8c2357367bd5ce48ac38e9fcee5bf7a"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/index.ts", "e3501830378171fc4473bc0115a3e00365900860"],
  ["tools/evavo-doc-studio/src/evavo/cli/bookCommandRegistry.ts", "1756862e13a732911ece684651aad8e768715aea"],
  ["tools/evavo-doc-studio/tsconfig.book-studio-craft-genome.json", "bc9e6d9ec308d1a70a26e0267dbbb23d43a9ac85"],
  ["tools/evavo-doc-studio/docs/BOOK_STUDIO_CRAFT_GENOME.md", "f34707226641d33964a395b357cf2e29a17665d1"],
  [".github/workflows/book-studio-craft-genome.yml", "97491758cc38a7b0df15e1928e305ce46702ce2f"]
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
  console.error("Exact Website craft proxy hardening mirror verification failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  websiteRepository: "EVAVO-STUDIO/Website",
  websiteBase: "9a39372a5d3ee63bf12f1c766828bb38b4d1645f",
  websiteHead: "af19c0fc7b650319b058c751f0d35c11bdc9882d",
  exactGitBlobs: exact.size,
  retiredLocalRuntimeFilesAbsent: retired.length,
  streamedRequestAndResponseLimitsRequired: true,
  strictUtf8Required: true,
  originOnlyConfigurationRequired: true,
  controlCharacterFreeTokenRequired: true,
  remoteValidationStatusPreserved: true,
  websiteLocalCraftExecutionAllowed: false,
  providerCalled: false,
  canonicalManuscriptMutationPerformed: false,
  automaticCanonicalAdmissionAllowed: false,
  publicationPerformed: false
}, null, 2));
