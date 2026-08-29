#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  source: "packages/contracts/src/book-creative-direction.ts",
  profiles: "packages/contracts/src/book-creative-direction-profiles.ts",
  types: "packages/contracts/src/book-creative-direction-types.ts",
  test: "packages/contracts/test/book-creative-direction.test.mjs",
  index: "packages/contracts/src/index.ts",
  package: "package.json",
  docs: "docs/book-creative-direction.md",
  commercialSource: "packages/contracts/src/book-cover-commercial-release.ts",
  commercialTest: "packages/contracts/test/book-cover-commercial-release.test.mjs",
  commercialRunner: "scripts/run-book-cover-commercial-release-local.mjs",
  commercialCheck: "scripts/check-book-cover-commercial-release.mjs",
  commercialDocs: "docs/book-cover-commercial-release.md",
};
const failures = [];
const sources = {};

for (const [name, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  try {
    await access(absolute);
    sources[name] = await readFile(absolute, "utf8");
  } catch {
    failures.push(`Required file is missing: ${relative}.`);
  }
}

function expect(name, token) {
  if (!sources[name]?.includes(token)) {
    failures.push(`${files[name]} is missing ${JSON.stringify(token)}.`);
  }
}

function reject(name, token) {
  if (sources[name]?.includes(token)) {
    failures.push(`${files[name]} contains prohibited token ${JSON.stringify(token)}.`);
  }
}

if (!failures.length) {
  expect("types", "evavo_art_book_creative_direction_v1");
  expect("source", "BOOK_CREATIVE_DIRECTION_CONTRACT");

  for (const token of [
    "compileBookCreativeDirection",
    "material_symbol",
    "environmental_pressure",
    "relational_tension",
    "consequence_moment",
    "systems_cutaway",
    "sequential_rhythm",
    "Every visible choice must be traceable",
    "Named-creator imitation is prohibited",
    "Branded-franchise transfer is prohibited",
    "Generated Book Art must remain text-free",
    "providerCallPerformed:false",
    "selectionPerformed:false",
    "promotionPerformed:false",
    "publicationPerformed:false",
  ]) expect("source", token);

  for (const token of [
    "grimdark_fantasy",
    "relief_engraving",
    "graphic_novel_ink",
    "STOCK_MOTIFS",
    "SYNTHETIC_FAILURES",
    "floating head montage",
    "plastic or waxy materials",
    "generic movie-poster hierarchy",
  ]) expect("profiles", token);

  for (const token of [
    "rejects vague provider buzzwords",
    "rejects named creators and branded franchises",
    "rejects generated typography inside artwork",
    "rejects ending spoilers when a cover lacks two safe scenes",
    "compiles technical systems with label-ready negative space",
    "compiles graphic-novel sequential rhythm while keeping lettering editable",
    "preserves compile-only authority",
  ]) expect("test", token);

  expect("index", 'export * from "./book-creative-direction.js";');
  expect("index", 'export * from "./book-cover-commercial-release.js";');
  expect("package", '"book:creative-direction:check": "node scripts/check-book-creative-direction.mjs"');
  expect("package", "pnpm run book:creative-direction:check");

  for (const token of [
    "Evidence before aesthetics",
    "Multiple concept territories",
    "Material-specific mark grammar",
    "Controlled first production use",
    "editable typography",
  ]) expect("docs", token);

  for (const token of [
    "evavo_art_book_cover_commercial_release_v1",
    "ready_for_docs_composition",
    "localValidationAuthoritative: true",
    "githubHostedActionsRequired: false",
    "paidCiRequired: false",
    "vercelBackgroundWorkerRequired: false",
    "networkRequiredForValidation: false",
    "workflowFilesAuthoritative: false",
  ]) expect("commercialSource", token);

  for (const token of [
    "blocks paid or workflow-authoritative execution dependencies",
    "detects authority tampering",
  ]) expect("commercialTest", token);

  for (const token of [
    "--input <release-input.json>",
    "githubHostedActionsUsed: false",
    "vercelBackgroundWorkerUsed: false",
    "paidServiceUsed: false",
  ]) expect("commercialRunner", token);

  for (const token of [
    "localValidationAuthoritative: true",
    "githubHostedActionsRequired: false",
    "workflowFilesAuthoritative: false",
  ]) expect("commercialCheck", token);

  for (const token of [
    "Local validation is authoritative",
    "GitHub Actions are optional wrappers",
    "Vercel is not a background worker",
  ]) expect("commercialDocs", token);

  for (const token of [
    "automaticSelectionAllowed:true",
    "automaticPromotionAllowed:true",
    "publicationPerformed:true",
  ]) reject("source", token);

  for (const token of [
    "githubHostedActionsRequired: true",
    "paidCiRequired: true",
    "workflowFilesAuthoritative: true",
  ]) reject("commercialSource", token);
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`book_creative_direction_check_failure: ${failure}`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    contract: "evavo_art_book_creative_direction_v1",
    evidenceBoundSubjects: true,
    genreAwareComposition: true,
    historicalPrintProcesses: true,
    publicPackageExported: true,
    permanentRepositoryCheckInstalled: true,
    localValidationAuthoritative: true,
    workflowRequired: false,
    githubHostedActionsRequired: false,
    paidCiRequired: false,
    vercelBackgroundWorkerRequired: false,
    networkRequiredForValidation: false,
    genericProviderShorthandAllowed: false,
    namedCreatorImitationAllowed: false,
    brandedFranchiseTransferAllowed: false,
    generatedTypographyAllowed: false,
    providerCallPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    publicationPerformed: false,
  })}\n`);
}