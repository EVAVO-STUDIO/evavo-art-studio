import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  source: "packages/contracts/src/book-illustration-intelligence.ts",
  index: "packages/contracts/src/index.ts",
  test: "packages/contracts/test/book-illustration-intelligence.test.mjs",
  cli: "scripts/evavo-art-book-illustration-cli.mjs",
  cliTest: "packages/contracts/test/book-illustration-intelligence-cli.test.mjs",
  docs: "docs/book-illustration-intelligence.md",
  workflow: ".github/workflows/book-illustration-intelligence.yml",
};
const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, relative]) => [
      key,
      await readFile(path.join(root, relative), "utf8"),
    ]),
  ),
);
function requireText(file, snippets) {
  for (const snippet of snippets) {
    if (!content[file].includes(snippet)) {
      throw new Error(`${files[file]} is missing required contract text: ${snippet}`);
    }
  }
}
requireText("source", [
  "evavo_art_book_illustration_intelligence_v1",
  "book.print_craft.qa",
  "book.cover.candidates.generate",
  "book.interior.candidates.generate",
  "book.visual.consensus",
  "BOOK_ILLUSTRATION_CAPABILITY_DESCRIPTORS",
  "compileBookIllustrationIntelligencePlan",
  "compileBookIllustrationGenerationDispatch",
  "evaluateBookIllustrationCandidate",
  "evaluateBookIllustrationVisualConsensus",
  "evavo_book_art_provider_shadow_runtime_v1",
  "providerAttemptLimit: 1",
  "providerFallbackAllowed: false",
  "reviewerWasCandidateProducer: false",
  "ready_for_governed_selection",
  "deliveryWidthInches",
  "deliveryHeightInches",
  'geometryAuthority: "docs_suite_exact_dimensions"',
  "externalTemplateFingerprint",
  "editableLayeredMasterAvailable",
  "namedCreatorImitationDetected",
  "brandedFranchiseElementsDetected",
  "falseHandmadeClaimDetected",
  "syntheticProvenanceHidden",
  "selectionPerformed: false",
  "promotionPerformed: false",
  "publicationPerformed: false",
]);
requireText("index", ['export * from "./book-illustration-intelligence.js";']);
requireText("test", [
  "old-school print-craft",
  "does not infer print geometry",
  "external template",
  "synthetic-looking craft",
  "graphic-novel artwork",
  "standards-compliant SHA-256",
  "existing shadow runtime",
  "independent visual consensus",
  "low-scoring receipts falsely labelled pass",
  "freshly recomputed forged receipts",
]);
requireText("cli", [
  "MAXIMUM_INPUT_BYTES",
  'open(resolved, "wx"',
  "compile-plan",
  "compile-generation-dispatch",
  "evaluate-candidate",
  "evaluate-visual-consensus",
]);
requireText("cliTest", ["exclusive no-clobber output", "status, 2"]);
requireText("docs", [
  "Exact print geometry",
  "Rights-safe genre translation",
  "Candidate generation dispatch",
  "Independent visual consensus",
  "ready_for_governed_selection",
]);
requireText("workflow", [
  "node scripts/check-book-illustration-intelligence.mjs",
  "@evavo/art-contracts build",
  "book-illustration-intelligence.test.mjs",
  "book-illustration-intelligence-cli.test.mjs",
  "pnpm check",
]);
console.log("Book illustration intelligence authority: PASS");
