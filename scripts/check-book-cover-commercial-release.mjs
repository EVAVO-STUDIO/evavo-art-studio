#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticOnly = process.argv.includes("--static-only");
const files = {
  source: "packages/contracts/src/book-cover-commercial-release.ts",
  test: "packages/contracts/test/book-cover-commercial-release.test.mjs",
  index: "packages/contracts/src/index.ts",
  runner: "scripts/run-book-cover-commercial-release-local.mjs",
  docs: "docs/book-cover-commercial-release.md",
  package: "packages/contracts/package.json",
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
  for (const token of [
    "evavo_art_book_cover_commercial_release_v1",
    "compileBookCoverCommercialReleaseAuthority",
    "validateBookCoverCommercialReleaseAuthority",
    "ready_for_docs_composition",
    "BOOK_COVER_COMMERCIAL_MARKET_FRESHNESS_DAYS = 45",
    "localValidationAuthoritative: true",
    "githubHostedActionsRequired: false",
    "paidCiRequired: false",
    "paidCrawlerRequired: false",
    "paidImageApiRequiredForValidation: false",
    "vercelBackgroundWorkerRequired: false",
    "networkRequiredForValidation: false",
    "workflowFilesAuthoritative: false",
    "candidateArtworkTextFree",
    "pairwiseOriginalityReviewCompleted",
    "humanFinishingEvidenceSha256",
    "docsSuiteCompositionAuthorized",
    "authorityDigestSha256",
  ]) expect("source", token);

  for (const token of [
    "authorizes only a fully evidenced local-first Docs Suite handoff",
    "requires current market evidence",
    "requires every governed retail proof to pass",
    "blocks generated or baked-in cover typography",
    "blocks paid or workflow-authoritative execution dependencies",
    "blocks automatic selection",
    "detects authority tampering",
  ]) expect("test", token);

  expect("index", 'export * from "./book-cover-commercial-release.js";');

  for (const token of [
    "--input <release-input.json>",
    "--authority <authority.json>",
    "@evavo/art-contracts",
    "localValidationAuthoritative: true",
    "networkUsed: false",
    "githubHostedActionsUsed: false",
    "vercelBackgroundWorkerUsed: false",
    "paidServiceUsed: false",
    "ready_for_docs_composition",
  ]) expect("runner", token);

  for (const token of [
    "Local validation is authoritative",
    "GitHub Actions are optional wrappers",
    "Vercel is not a background worker",
    "text-free artwork",
    "Docs Suite",
    "node scripts/run-book-cover-commercial-release-local.mjs",
  ]) expect("docs", token);

  expect("package", '"build": "node scripts/clean-dist.mjs && tsc -p tsconfig.json"');
  expect("package", '"test": "npm run build --silent && node --test');

  for (const token of [
    "automaticSelectionAllowed: true",
    "automaticPromotionAllowed: true",
    "publicationAllowed: true",
    "githubHostedActionsRequired: true",
    "paidCiRequired: true",
    "workflowFilesAuthoritative: true",
  ]) reject("source", token);

  for (const token of [
    "fetch(",
    "https://api.github.com",
    "vercel.com/api",
  ]) reject("runner", token);
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });
  if (result.error) {
    failures.push(`${label} could not start: ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    failures.push(`${label} failed with exit code ${result.status}.${detail ? `\n${detail}` : ""}`);
  }
}

if (!failures.length && !staticOnly) {
  run(process.execPath, ["--check", files.runner], "Local runner syntax check");
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  run(pnpm, ["--filter", "@evavo/art-contracts", "build"], "Contracts build");
  if (!failures.length) {
    run(process.execPath, ["--test", files.test], "Commercial-release focused tests");
  }
}

if (failures.length) {
  for (const failure of failures) {
    process.stderr.write(`book_cover_commercial_release_check_failure: ${failure}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    contract: "evavo_art_book_cover_commercial_release_v1",
    localValidationAuthoritative: true,
    staticOnly,
    githubHostedActionsRequired: false,
    paidCiRequired: false,
    paidCrawlerRequired: false,
    paidImageApiRequiredForValidation: false,
    vercelBackgroundWorkerRequired: false,
    networkRequiredForValidation: false,
    workflowFilesAuthoritative: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
  })}\n`);
}
