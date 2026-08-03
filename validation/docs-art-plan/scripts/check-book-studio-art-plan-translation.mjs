import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing Art plan translation file: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "");
}

function requireTokens(label, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${label} is missing: ${token}`);
  }
}

function forbidTokens(label, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) failures.push(`${label} contains forbidden authority: ${token}`);
  }
}

const core = read("packages/core/src/book-studio-art-plan-translation.ts");
const index = read("packages/core/src/index.ts");
const coreTest = read("packages/core/test/book-studio-art-plan-translation.test.mjs");
const client = read("apps/web/src/lib/book-studio-art-plan-translation-client.ts");
const service = read("apps/web/src/lib/book-studio-art-plan-translation-service.ts");
const route = read("apps/web/src/app/api/v1/book-studio/art-plan-translation/route.ts");
const transportTest = read("apps/web/test/book-studio-art-plan-translation.test.mjs");
const surfaceTest = read("apps/web/test/book-studio-art-plan-translation-cli-mcp.test.mjs");
const cli = read("apps/web/scripts/evavo-docs-book-cli.mjs");
const mcp = read("apps/web/scripts/evavo-docs-book-mcp.mjs");
const docs = read("docs/migrations/book-studio/BOOK_STUDIO_ART_PLAN_TRANSLATION_MIGRATION.md");
const env = read(".env.example");
const workflow = read(".github/workflows/book-studio-art-plan-translation.yml");

requireTokens("Core contract", core, [
  "evavo_docs_book_art_plan_translation_v1",
  "compileBookArtPlanTranslationRequest",
  "validateBookArtPlanTranslationResult",
  "validateBookArtBriefExact",
  "compileExpectedWorkOrder",
  "workOrderFingerprintSha256",
  "independently compiled Docs Suite expectation",
  "providerCallPerformed: false",
  "runtimeJobSubmitted: false",
  "artifactBytesWritten: false",
  "selectionPerformed: false",
  "promotionPerformed: false",
  "bookUseBindingCreated: false",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]);
requireTokens("Core index", index, [
  'export * from "./book-studio-art-plan-translation";',
]);
requireTokens("Art Studio client", client, [
  "EVAVO_ART_STUDIO_BOOK_ART_URL",
  "EVAVO_ART_STUDIO_BOOK_ART_TOKEN",
  "/v1/book-art/legacy-plans/translate",
  "/v1/book-art/legacy-illustration-plans/translate",
  "redirect: \"error\"",
  "AMBIGUOUS_TIMEOUT_NO_RETRY",
  "AMBIGUOUS_NETWORK_NO_RETRY",
  "X-EVAVO-Actor",
  "maximumResponseBytes",
]);
requireTokens("Coordinator", service, [
  "coordinateBookArtPlanTranslation",
  "compileBookArtPlanTranslationRequest",
  "callArtStudioBookPlanTranslation",
  "validateBookArtPlanTranslationResult",
  "remoteCallMayHaveOccurred",
]);
requireTokens("Protected route", route, [
  "documents:read",
  "maxDuration = 300",
  "MAXIMUM_BODY_BYTES = 4_400_000",
  "artStudioCallMaximum: 1",
  "ambiguousRetryAllowed: false",
  "providerCallPerformed: false",
  "runtimeJobSubmitted: false",
  "publicationPerformed: false",
]);
requireTokens("Book CLI", cli, [
  "art-plan-capabilities",
  "art-plan-translate",
  "/api/v1/book-studio/art-plan-translation",
  "flag: \"wx\"",
]);
requireTokens("Book MCP", mcp, [
  "translate_legacy_book_art_plan",
  "/api/v1/book-studio/art-plan-translation",
  "additionalProperties: false",
  "provider call, artifact write, selection, promotion, Book-use binding or publication",
]);
requireTokens("Core attacks", coreTest, [
  "independently compiles and accepts one exact cover translation result",
  "accepts illustration evidence while preserving page and live-text authority",
  "rejects substituted work orders, legacy evidence and authority escalation",
  "preserves a valid blocked Art result without inventing a work order",
]);
requireTokens("Transport attacks", transportTest, [
  "cover coordination makes one exact protected call",
  "illustration client uses the exact illustration endpoint",
  "tampered Art results are blocked",
  "network ambiguity is not retried",
  "preserves stable Art Studio error codes",
]);
requireTokens("CLI and MCP attacks", surfaceTest, [
  "Art translation CLI forwards one exact request",
  "MCP exposes and forwards the exact Art translation tool",
  "translate_legacy_book_art_plan",
]);
requireTokens("Migration documentation", docs, [
  "Docs Suite does not trust a returned work-order fingerprint by itself",
  "No ambiguous retry",
  "ready_for_shadow_comparison",
  "run-book-cover-artwork-generation.ts",
  "run-book-illustration-studio.ts",
]);
requireTokens("Environment template", env, [
  "EVAVO_WRITING_STUDIO_BOOK_CANDIDATE_TIMEOUT_MS=280000",
  "EVAVO_ART_STUDIO_BOOK_ART_URL",
  "EVAVO_ART_STUDIO_BOOK_ART_TOKEN",
  "EVAVO_ART_STUDIO_BOOK_ART_TIMEOUT_MS=120000",
  "EVAVO_ART_STUDIO_BOOK_ART_MAX_RESPONSE_BYTES=4000000",
]);
requireTokens("Permanent workflow", workflow, [
  "book-studio-art-plan-translation.yml",
  "pnpm install --frozen-lockfile",
  "check-book-studio-art-plan-translation.mjs",
  "@evavo-docs/core typecheck",
  "@evavo-docs/web typecheck",
  "book-studio-art-plan-translation.test.mjs",
  "book-studio-art-plan-translation-cli-mcp.test.mjs",
  "git diff --exit-code",
]);

forbidTokens("Art plan translation implementation", `${core}\n${client}\n${service}\n${route}`, [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "images.generate",
  "images.edit",
  "providerCallPerformed: true",
  "runtimeJobSubmitted: true",
  "artifactBytesWritten: true",
  "authoritativeBookWritesPerformed: true",
  "selectionPerformed: true",
  "promotionPerformed: true",
  "bookUseBindingCreated: true",
  "runtimeCutoverApproved: true",
  "publicationPerformed: true",
  "sourceDeletionApproved: true",
]);

if (failures.length) {
  console.error("Book Studio Art plan translation check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "evavo_docs_book_art_plan_translation_v1",
  coverTranslation: true,
  illustrationTranslation: true,
  independentWorkOrderRecompilation: true,
  artStudioCallMaximum: 1,
  ambiguousRetryAllowed: false,
  providerCallPerformed: false,
  runtimeJobSubmitted: false,
  artifactBytesWritten: false,
  authoritativeBookWritesPerformed: false,
  selectionPerformed: false,
  promotionPerformed: false,
  bookUseBindingCreated: false,
  runtimeCutoverApproved: false,
  publicationPerformed: false,
}, null, 2));
