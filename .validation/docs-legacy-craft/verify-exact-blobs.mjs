import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const exact = new Map([
  ["packages/core/src/book-studio-legacy-craft-genome-types.ts", "aa6b1021e4dcb8ffa6e7f6b0b067cc6e3479b48d"],
  ["packages/core/src/book-studio-legacy-craft-genome-utils.ts", "d179e02e40c93b1d8455d0e682a47584d37604b1"],
  ["packages/core/src/book-studio-legacy-craft-genome-compiler.ts", "2a4ca9a168899efca4da5ba2e25c9e34631c45d1"],
  ["packages/core/src/book-studio-legacy-craft-phrase-overlap.ts", "61cf8f8353bfbe0e2adac66b0d45f02a61b8f1a0"],
  ["packages/core/src/book-studio-legacy-craft-provider-packet-validation.ts", "722c0865a3e5fc892fdeb2454e24439b9549ae68"],
  ["packages/core/src/book-studio-legacy-craft-provider-response-contract.ts", "5d369e620473d59bb25b01b7650eac808ab3b492"],
  ["packages/core/src/book-studio-legacy-craft-provider-packet.ts", "495fba484dc541ce09081c9825e61a7e9e04e84d"],
  ["packages/core/src/book-studio-legacy-craft-provider-response-validation.ts", "20f91c28923712ed31e0cd6db8a80f8210c96b98"],
  ["packages/core/src/book-studio-legacy-craft-genome-compat.ts", "2af209f86cbce790cf1d2217f549f010f0f1ea04"],
  ["packages/core/src/book-studio-legacy-craft-genome.ts", "00ad4bf49559f59cb6d148167920b5b97fa4d733"],
  ["packages/core/test/book-studio-legacy-craft-genome.test.mjs", "9b81dd01047c2c383136d9c6a33b0709b12f1a32"],
  ["apps/web/src/lib/book-studio-legacy-craft-genome-input.ts", "f49ca4c88e0eacee08bc288893ac1c7bd65a6b44"],
  ["apps/web/src/lib/book-studio-legacy-craft-genome-service.ts", "a393ff18f2e75d2ab570f8a2c27a8cd6fcd408bd"],
  ["apps/web/src/app/api/v1/book-studio/legacy-craft-genome/route.ts", "298474eba5149a13322e7a07148ab3d5d16f7939"],
  ["apps/web/scripts/docs-suite-api-client.mjs", "9c05188ea028616e125ab682bb4da33e99081d04"],
  ["apps/web/scripts/evavo-docs-book-legacy-craft-genome-common.mjs", "10aa10c62ecb3c5e6e5d8407dc97510e37de3ec1"],
  ["apps/web/scripts/evavo-docs-book-legacy-craft-genome-cli.mjs", "139d147cf7fe5fb082860be5f1fac027546788ba"],
  ["apps/web/scripts/evavo-docs-book-legacy-craft-genome-mcp.mjs", "062819bc41c57609ec22fda63c18a8ba6a3e3e0d"],
  ["apps/web/scripts/test-book-studio-legacy-craft-genome-input.mjs", "684e7a199d9978cf4b09384b5c31e67dc21e3d1d"],
  ["apps/web/scripts/test-book-studio-legacy-craft-genome-adapters.mjs", "3445b2dc3baab6f06755c281dcbf461b9743f981"],
]);

const failures = [];
for (const [relative, expected] of exact) {
  const actual = execFileSync("git", ["hash-object", path.join(root, relative)], { encoding: "utf8" }).trim();
  if (actual !== expected) failures.push(`${relative}: expected ${expected}, received ${actual}`);
}

if (failures.length) {
  console.error("Exact Docs legacy craft mirror verification failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  docsRepository: "EVAVO-STUDIO/evavo-docs-suite",
  docsHead: "432954f64688c7d0648c8a58a5ebdad68f7cb709",
  exactGitBlobs: exact.size,
  productionProviderCalled: false,
  canonicalManuscriptMutationPerformed: false,
  automaticCanonicalAdmissionAllowed: false,
  publicationPerformed: false,
}, null, 2));
