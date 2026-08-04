import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const exact = new Map([
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftTypes.ts", "42be33c54ee61e4989295c8635bd869a0704f37f"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftContracts.ts", "76ec858968b8697404c4b4423ef0f1f067af3403"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftShared.ts", "07b733ea5b70b329f6e3f6ca4180b566256c96f1"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftClient.ts", "93254f5e9e9852da6ffc2e1374ffbc9cd3ea3458"],
  ["tools/evavo-doc-studio/src/app/api/books/write/craft-genome/route.ts", "23d1c9db421052b18b26f43c10fdaeefa96732c1"],
  ["tools/evavo-doc-studio/scripts/check-book-studio-craft-provider-contract.ts", "a87f481a6b4e293adda34c6f41e6625a509f04e4"],
  ["tools/evavo-doc-studio/scripts/check-book-studio-craft-genome.ts", "39061ad13f30fd37627b37b65c302b22faf5d08d"],
  ["tools/evavo-doc-studio/src/evavo/bookStudio/index.ts", "a6f3e2b27948f6ccacbc32455b088abf71a71768"],
  ["tools/evavo-doc-studio/src/evavo/cli/bookCommandRegistry.ts", "1756862e13a732911ece684651aad8e768715aea"],
  ["tools/evavo-doc-studio/tsconfig.book-studio-craft-genome.json", "cd99f194472a8efe75bab448b8a56d635af9312a"],
  ["tools/evavo-doc-studio/docs/BOOK_STUDIO_CRAFT_GENOME.md", "0d2226ecb31ea55f87c6862116b7daffd82acc88"],
  [".github/workflows/book-studio-craft-genome.yml", "555b1ecefd19ca6f17e51f4ddecfd11a04ab93b8"]
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
  console.error("Exact Website craft proxy mirror verification failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  websiteRepository: "EVAVO-STUDIO/Website",
  websitePullRequest: 73,
  websiteHead: "c9bfc9617daf83a2e3de0699b7b2b1679545a79d",
  exactGitBlobs: exact.size,
  retiredLocalRuntimeFilesAbsent: retired.length,
  websiteLocalCraftExecutionAllowed: false,
  providerCalled: false,
  canonicalManuscriptMutationPerformed: false,
  automaticCanonicalAdmissionAllowed: false,
  publicationPerformed: false
}, null, 2));
