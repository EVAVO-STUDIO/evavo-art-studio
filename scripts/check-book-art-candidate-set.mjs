#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = {
  contract: "packages/contracts/src/book-art-candidate-set.ts",
  canonicalContract: "packages/contracts/src/book-art-candidate-set-canonical.ts",
  contractIndex: "packages/contracts/src/index.ts",
  contractTest: "packages/contracts/test/book-art-candidate-set.test.mjs",
  runtime: "packages/book-art-runtime/src/candidate-set.ts",
  executionRuntime:
    "packages/book-art-runtime/src/candidate-set-execution.ts",
  runtimePackage: "packages/book-art-runtime/package.json",
  runtimeTest: "packages/book-art-runtime/test/candidate-set-runtime.test.mjs",
  executionRuntimeTest:
    "packages/book-art-runtime/test/candidate-set-execution.test.mjs",
  providerPrompt: "packages/providers/src/prompt.ts",
  providerTest: "packages/providers/test/providers.test.mjs",
  recipeCheck: "scripts/check-image-processing-recipes.mjs",
  workflow: ".github/workflows/book-art-candidate-set.yml",
  docs: "docs/book-art-candidate-set.md",
};
const failures = [];
const sources = {};
for (const [name, relative] of Object.entries(required)) {
  const absolute = path.join(root, relative);
  try {
    await access(absolute);
    sources[name] = await readFile(absolute, "utf8");
  } catch {
    failures.push(`Required file is missing: ${relative}.`);
  }
}
function expect(source, token, label) {
  if (!source.includes(token)) failures.push(`${label} is missing ${JSON.stringify(token)}.`);
}
function reject(source, token, label) {
  if (source.includes(token)) failures.push(`${label} contains prohibited ${JSON.stringify(token)}.`);
}
if (!failures.length) {
  const implementation = `${sources.contract}\n${sources.canonicalContract}\n${sources.runtime}\n${sources.executionRuntime}\n${sources.providerPrompt}`;
  for (const token of [
    "evavo_book_art_candidate_set_production_v1",
    "evavo_book_art_candidate_set_provider_runtime_v1",
    "evavo_book_art_candidate_set_execution_evidence_v1",
    "book.candidate_set.generate",
    "book.visual.candidate_set.consensus",
    "BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES = 3",
    "BOOK_ART_CANDIDATE_SET_DEFAULT_CANDIDATES = 4",
    "BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES = 8",
    "BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS = 9_200",
    "completePairwiseComparisonRequired: true",
    "independentSetReviewRequired: true",
    "generatedTextProhibited: true",
    "expectedCandidateCount",
    "BOOK CANDIDATE-SET DIVERSITY CONTRACT",
    "canonical semantic replay",
    "compileBookArtCandidateSetProviderRunReceipt",
    "evaluateBookArtCandidateSetExecutionConsensus",
    "exactOutputSetVerified: true",
    "immutableArtifactsVerified: true",
    "oneProviderAttemptForEntireSet: true",
    "providerFallbackAllowed: false",
    "automaticSelectionAllowed: false",
    "automaticPromotionAllowed: false",
    "publicationPerformed: false",
    'kind: "art.candidate.generate"',
    "maximumAttempts: 1",
    "canonicalSourceBriefFingerprint",
    "exact canonical work-order digest",
    "metadata identity differs from the exact work order",
  ]) expect(implementation, token, "candidate-set implementation");
  for (const token of [
    "providerFallbackAllowed: true",
    "automaticSelectionAllowed: true",
    "automaticPromotionAllowed: true",
    "publicationPerformed: true",
  ]) reject(implementation, token, "candidate-set implementation");
  expect(
    sources.contractIndex,
    'export * from "./book-art-candidate-set.js";',
    "contract barrel",
  );
  expect(
    sources.contractIndex,
    'from "./book-art-candidate-set-canonical.js";',
    "canonical contract barrel",
  );
  for (const token of ['"./candidate-set"', '"./candidate-set-execution"']) {
    expect(sources.runtimePackage, token, "runtime package export");
  }
  for (const token of [
    "pnpm run build:domain",
    "candidate-set-execution.test.mjs",
    '"packages/book-art-runtime/src/candidate-set*.ts"',
  ]) expect(sources.workflow, token, "candidate-set workflow");
  for (const token of [
    "omits outputs from the governed set",
    "near duplicates",
    "machine-only",
    "producer self-review",
    "candidate-producer participation hidden inside visual consensus",
    "missing or duplicated pair coverage",
    "freshly re-fingerprinted forged ready evaluations",
  ]) expect(sources.contractTest, token, "candidate-set attacks");
  for (const token of [
    "genuinely distinct non-template alternatives",
    "same template with cosmetic changes",
  ]) expect(sources.providerTest, token, "provider prompt attacks");
  for (const token of [
    "TemporaryDirectory",
    "py_compile.compile",
  ]) expect(sources.recipeCheck, token, "isolated Python syntax validation");
  for (const token of [
    "exact four-output set",
    "without creating four provider attempts",
    "fallback tampering",
  ]) expect(sources.runtimeTest, token, "candidate-set runtime attacks");
  for (const token of [
    "exact durable provider execution",
    "exact provider output set",
    "omitted or substituted candidates",
    "forged receipt",
  ]) expect(sources.executionRuntimeTest, token, "execution-evidence attacks");
}
if (failures.length) {
  for (const failure of failures) {
    console.error(`book_art_candidate_set_check_failure: ${failure}`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    contract: "evavo_book_art_candidate_set_production_v1",
    runtimeContract: "evavo_book_art_candidate_set_provider_runtime_v1",
    executionEvidenceContract:
      "evavo_book_art_candidate_set_execution_evidence_v1",
    minimumCandidates: 3,
    defaultCandidates: 4,
    maximumCandidates: 8,
    nearDuplicateBasisPoints: 9200,
    canonicalSourceEvidence: true,
    exactProviderRunEvidence: true,
    oneProviderAttemptForEntireSet: true,
    providerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationPerformed: false,
  })}\n`);
}
