#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticOnly = process.argv.includes("--static-only");
const required = {
  source: "packages/contracts/src/book-cover-commercial-release-v2.ts",
  test: "packages/contracts/test/book-cover-commercial-release-v2.test.mjs",
  runner: "scripts/run-book-cover-commercial-release-v2-local.mjs",
  docs: "docs/book-cover-commercial-release-v2.md",
  index: "packages/contracts/src/index.ts",
};
const files = {};
const failures = [];
for (const [name, relative] of Object.entries(required)) {
  const absolute = path.join(root, relative);
  try { await access(absolute); files[name] = await readFile(absolute, "utf8"); }
  catch { failures.push(`Missing ${relative}.`); }
}
const expect = (name, token) => { if (!files[name]?.includes(token)) failures.push(`${required[name]} is missing ${JSON.stringify(token)}.`); };
const reject = (name, token) => { if (files[name]?.includes(token)) failures.push(`${required[name]} contains prohibited ${JSON.stringify(token)}.`); };
if (!failures.length) {
  for (const token of [
    "evavo_art_book_cover_commercial_release_v2",
    "requiredArtStageProofIds",
    "deferredToDocsSuiteProofIds",
    "postCompositionProofsDeferred: true",
    "cannot be accepted before Docs Suite",
    "githubHostedActionsRequired: false",
    "paidCiRequired: false",
    "paidCrawlerRequired: false",
    "paidImageApiRequiredForValidation: false",
    "vercelBackgroundWorkerRequired: false",
    "networkRequiredForValidation: false",
    "workflowFilesAuthoritative: false",
  ]) expect("source", token);
  for (const token of [
    "rejects post-composition proof evidence before Docs Suite composition",
    "blocks paid or workflow-authoritative execution dependencies",
    "detects authority tampering",
  ]) expect("test", token);
  for (const token of [
    "--input <release-v2-input.json>",
    "networkUsed: false",
    "githubHostedActionsUsed: false",
    "vercelBackgroundWorkerUsed: false",
    "paidServiceUsed: false",
  ]) expect("runner", token);
  for (const token of [
    "Two-stage proof boundary",
    "Local validation is authoritative",
    "V1 remains readable",
    "Docs Suite",
  ]) expect("docs", token);
  expect("index", 'export * from "./book-cover-commercial-release-v2.js";');
  for (const token of [
    "githubHostedActionsRequired: true",
    "paidCiRequired: true",
    "workflowFilesAuthoritative: true",
  ]) reject("source", token);
  for (const token of ["fetch(", "https://api.github.com", "vercel.com/api"]) reject("runner", token);
}
function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "pipe", windowsHide: true });
  if (result.error) { failures.push(`${label} could not start: ${result.error.message}`); return; }
  if (result.status !== 0) failures.push(`${label} failed.\n${[result.stdout, result.stderr].filter(Boolean).join("\n")}`);
}
if (!failures.length && !staticOnly) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  run(process.execPath, ["--check", required.runner], "V2 runner syntax check");
  run(pnpm, ["--filter", "@evavo/art-contracts", "build"], "Art contracts build");
  if (!failures.length) run(process.execPath, ["--test", required.test], "Commercial release V2 tests");
}
if (failures.length) {
  failures.forEach((failure) => process.stderr.write(`book_cover_commercial_release_v2_check_failure: ${failure}\n`));
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    contract: "evavo_art_book_cover_commercial_release_v2",
    localValidationAuthoritative: true,
    staticOnly,
    postCompositionProofsDeferred: true,
    githubHostedActionsRequired: false,
    paidCiRequired: false,
    vercelBackgroundWorkerRequired: false,
    networkRequiredForValidation: false,
    workflowFilesAuthoritative: false,
    publicationAllowed: false,
  })}\n`);
}
