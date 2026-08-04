import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = {
  types: "src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftTypes.ts",
  contracts: "src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftContracts.ts",
  shared: "src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftShared.ts",
  stream: "src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftStream.ts",
  client: "src/evavo/bookStudio/storyBookStudioDocsSuiteLegacyCraftClient.ts",
  route: "src/app/api/books/write/craft-genome/route.ts",
  index: "src/evavo/bookStudio/index.ts",
  providerAttack: "scripts/check-book-studio-craft-provider-contract.ts",
  routeAttack: "scripts/check-book-studio-craft-proxy-route.ts",
  tsconfig: "tsconfig.book-studio-craft-genome.json",
  documentation: "docs/BOOK_STUDIO_CRAFT_GENOME.md",
  workflow: "../../.github/workflows/book-studio-craft-genome.yml",
  registry: "src/evavo/cli/bookCommandRegistry.ts"
} as const;

const retired = [
  "src/evavo/bookStudio/storyBookStudioCraftGenome.ts",
  "src/evavo/bookStudio/storyBookStudioCraftGenomeTypes.ts",
  "src/evavo/bookStudio/storyBookStudioCraftGenomeUtils.ts",
  "src/evavo/bookStudio/storyBookStudioCraftGenomeCompiler.ts",
  "src/evavo/bookStudio/storyBookStudioCraftPhraseOverlap.ts",
  "src/evavo/bookStudio/storyBookStudioCraftProviderPacketValidation.ts",
  "src/evavo/bookStudio/storyBookStudioCraftProviderResponseContract.ts",
  "src/evavo/bookStudio/storyBookStudioCraftGenomeProviderPacket.ts",
  "src/evavo/bookStudio/storyBookStudioCraftProviderResponseValidation.ts"
] as const;

const retiredRuntimeTokens = [
  ...retired.map((relative) => path.basename(relative, path.extname(relative))),
  "compileEvavoCraftGenome",
  "createEvavoCraftGenomeProviderPacket",
  "scanEvavoCraftPhraseOverlap",
  "validateEvavoCraftGenomeProviderResponse",
  "createEvavoCraftProviderResponseContract",
  "validateEvavoCraftProviderPacketInput",
  "textLeaksPrivateLabel",
  "craftInfluenceVector",
  "craftVectorDistance"
] as const;

const failures: string[] = [];
const source = {} as Record<keyof typeof required, string>;
for (const [name, relative] of Object.entries(required) as Array<[keyof typeof required, string]>) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) failures.push(`missing ${relative}`);
  source[name] = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}
for (const relative of retired) {
  if (existsSync(path.join(root, relative))) failures.push(`retired local craft source still exists: ${relative}`);
}

function requireTokens(name: keyof typeof required, tokens: readonly string[]): void {
  for (const token of tokens) if (!source[name].includes(token)) failures.push(`${required[name]} missing ${token}`);
}

function forbidTokens(name: keyof typeof required, tokens: readonly string[]): void {
  for (const token of tokens) if (source[name].includes(token)) failures.push(`${required[name]} must not contain ${token}`);
}

const scannableExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"]);
const ignoredDirectoryNames = new Set(["node_modules", ".next", "storage", "tmp", "dist", "coverage"]);
const checkerPath = path.resolve(root, "scripts/check-book-studio-craft-genome.ts");
const scannedFiles: string[] = [];

function collectScannableFiles(directory: string): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) collectScannableFiles(absolute);
      continue;
    }
    if (entry.isFile() && scannableExtensions.has(path.extname(entry.name)) && path.resolve(absolute) !== checkerPath) {
      scannedFiles.push(absolute);
    }
  }
}

collectScannableFiles(path.join(root, "src"));
collectScannableFiles(path.join(root, "scripts"));
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && /^tsconfig(?:\.[A-Za-z0-9._-]+)?\.json$/.test(entry.name)) {
    scannedFiles.push(path.join(root, entry.name));
  }
}

for (const absolute of scannedFiles.sort()) {
  const value = readFileSync(absolute, "utf8");
  const leaked = retiredRuntimeTokens.filter((token) => value.includes(token));
  if (leaked.length) {
    failures.push(`hidden legacy craft reference in ${path.relative(root, absolute)}: ${leaked.join(", ")}`);
  }
}

requireTokens("types", [
  'EVAVO_DOCS_SUITE_LEGACY_CRAFT_CONTRACT = "evavo_docs_book_legacy_craft_genome_v1"',
  'EVAVO_DOCS_SUITE_LEGACY_CRAFT_ENDPOINT = "/api/v1/book-studio/legacy-craft-genome"',
  "websiteLocalCraftExecutionPerformed: false",
  "providerCalled: false",
  "canonicalManuscriptMutationPerformed: false",
  "automaticCanonicalAdmissionAllowed: false",
  "publicationPerformed: false"
]);
requireTokens("contracts", [
  "compile_profile",
  "create_provider_packet",
  "validate_provider_response",
  "scan_phrase_overlap",
  "exactKeys",
  "BOOK_CRAFT_OPERATION_UNSUPPORTED"
]);
requireTokens("shared", ["stableEvavoLegacyCraftJson", "sha256EvavoLegacyCraftText"]);
requireTokens("stream", [
  "readEvavoBoundedUtf8Body",
  "body.getReader()",
  "totalBytes > input.maximumBytes",
  "TextDecoder(\"utf-8\", { fatal: true })",
  "reader.cancel"
]);
requireTokens("client", [
  "requestEvavoDocsSuiteLegacyCraft",
  'redirect: "error"',
  "BOOK_CRAFT_PROXY_TIMEOUT",
  "BOOK_CRAFT_PROXY_NETWORK_FAILED",
  "fingerprintEvavoLegacyCraftValue(request)",
  "readEvavoBoundedUtf8Body",
  'url.pathname !== "/"',
  "/[\\u0000-\\u001f\\u007f]/",
  "websiteLocalCraftExecutionPerformed === false",
  "providerCalled === false",
  "canonicalManuscriptMutationPerformed === false",
  "automaticCanonicalAdmissionAllowed === false",
  "publicationPerformed === false"
]);
forbidTokens("client", [
  ".text()",
  ".arrayBuffer()",
  "compileEvavoCraftGenome(",
  "scanEvavoCraftPhraseOverlap(",
  "createEvavoCraftGenomeProviderPacket(",
  "validateEvavoCraftGenomeProviderResponse("
]);
requireTokens("route", [
  "MAXIMUM_BODY_BYTES = 8 * 1024 * 1024",
  "validateEvavoLegacyCraftPublicRequest",
  "requestEvavoDocsSuiteLegacyCraft",
  "readEvavoBoundedUtf8Body",
  "streamingBodyLimitsRequired: true",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  'response.headers.set("Cache-Control", "private, no-store, max-age=0")',
  'error.code === "BOOK_CRAFT_PROXY_REMOTE_REJECTED" && error.status === 400'
]);
forbidTokens("route", [
  "request.text()",
  "request.arrayBuffer()",
  "compileEvavoCraftGenome",
  "scanEvavoCraftPhraseOverlap",
  "createEvavoCraftGenomeProviderPacket",
  "validateEvavoCraftGenomeProviderResponse"
]);
requireTokens("index", [
  'export * from "./storyBookStudioDocsSuiteLegacyCraftTypes";',
  'export * from "./storyBookStudioDocsSuiteLegacyCraftContracts";',
  'export * from "./storyBookStudioDocsSuiteLegacyCraftShared";',
  'export * from "./storyBookStudioDocsSuiteLegacyCraftStream";',
  'export * from "./storyBookStudioDocsSuiteLegacyCraftClient";'
]);
forbidTokens("index", ['export * from "./storyBookStudioCraftGenome";']);
requireTokens("providerAttack", [
  "assertConfigurationHardening",
  "assertExactRemoteExecution",
  "assertNoRetryAndNoSecretLeak",
  "assertTimeoutIsNotRetried",
  "assertAuthorityTamperingIsRejected",
  "assertUnknownResponseFieldsAreRejected",
  "assertFingerprintTamperingIsRejected",
  "assertStreamedResponseLimit",
  "assertInvalidUtf8ResponseRejected",
  "assertRemoteValidationStatusPreserved",
  "streamedRequestAndResponseLimitsRequired: true",
  "redirectsAllowed: false",
  "automaticRetriesAllowed: false",
  "localFallbackAllowed: false"
]);
requireTokens("routeAttack", [
  "actualOversized",
  "invalidUtf8",
  "remotelyInvalid",
  "streamedOversizeRequestsRejectedBeforeTransport",
  "remoteValidationStatusPreserved: true",
  "authorityEscalationRejected: true"
]);
requireTokens("tsconfig", [
  "storyBookStudioDocsSuiteLegacyCraftTypes.ts",
  "storyBookStudioDocsSuiteLegacyCraftContracts.ts",
  "storyBookStudioDocsSuiteLegacyCraftShared.ts",
  "storyBookStudioDocsSuiteLegacyCraftStream.ts",
  "storyBookStudioDocsSuiteLegacyCraftClient.ts",
  "src/app/api/books/write/craft-genome/route.ts",
  "scripts/check-book-studio-craft-provider-contract.ts",
  "scripts/check-book-studio-craft-proxy-route.ts"
]);
forbidTokens("tsconfig", [
  "storyBookStudioCraftGenomeCompiler.ts",
  "storyBookStudioCraftPhraseOverlap.ts",
  "storyBookStudioCraftGenomeProviderPacket.ts"
]);
requireTokens("documentation", [
  "Docs Suite compatibility authority",
  "No local fallback",
  "streamed before buffering",
  "strict UTF-8",
  "EVAVO_DOCS_SUITE_BOOK_CRAFT_TOKEN",
  "EVAVO_WEBSITE_COMMIT_SHA",
  "The Website route does not call a model"
]);
requireTokens("workflow", [
  "npx tsx scripts/check-book-studio-craft-genome.ts",
  "npx tsx scripts/check-book-studio-craft-provider-contract.ts",
  "npx tsx scripts/check-book-studio-craft-proxy-route.ts",
  "npx tsc --noEmit --project tsconfig.book-studio-craft-genome.json",
  "npm run build",
  "git diff --exit-code"
]);
for (const command of ["book craft-genome", "book craft-packet", "book craft-response-validate", "book craft-overlap"]) {
  if (!source.registry.includes(command)) failures.push(`book CLI registry lost retained command: ${command}`);
}

if (failures.length) {
  console.error("Book Studio craft-genome proxy retirement check failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "evavo_docs_book_legacy_craft_genome_v1",
  publicEndpoint: "/api/books/write/craft-genome",
  docsEndpoint: "/api/v1/book-studio/legacy-craft-genome",
  retainedCliCommands: ["book craft-genome", "book craft-packet", "book craft-response-validate", "book craft-overlap"],
  retiredLocalRuntimeFiles: retired.length,
  scannedCodeAndConfigFiles: scannedFiles.length,
  streamedBodyLimitsRequired: true,
  strictUtf8Required: true,
  websiteLocalCraftExecutionAllowed: false,
  providerCallPerformed: false,
  canonicalManuscriptMutationPerformed: false,
  automaticCanonicalAdmissionAllowed: false,
  publicationPerformed: false
}, null, 2));
