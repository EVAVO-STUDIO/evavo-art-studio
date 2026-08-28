#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCUMENT = path.join(ROOT, "docs", "LOCAL_FIRST_WORKSTATION.md");

const REQUIRED_FILES = Object.freeze([
  ".githooks/pre-push",
  "scripts/check-github-workflow-contexts.mjs",
  "scripts/check-local-storage-headroom.mjs",
  "scripts/local-quality-gate.mjs",
  "scripts/run-local-studio.mjs",
  "scripts/run-local-worker.mjs",
  "scripts/setup-local-hooks.mjs",
]);

const REQUIRED_COMMANDS = Object.freeze([
  "node scripts/local-quality-gate.mjs fast",
  "node scripts/local-quality-gate.mjs changed",
  "node scripts/local-quality-gate.mjs push",
  "node scripts/local-quality-gate.mjs full",
  "node scripts/local-quality-gate.mjs release",
  "node scripts/run-local-studio.mjs --plan",
  "node scripts/check-local-storage-headroom.mjs",
  "node scripts/run-local-worker.mjs daemon",
  "node scripts/setup-local-hooks.mjs --check",
]);

function writeFixture(root, relative, content = "fixture\n") {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

export function inspectLocalFirstRunbook(root = ROOT) {
  const document = path.join(root, "docs", "LOCAL_FIRST_WORKSTATION.md");
  if (!fs.existsSync(document)) {
    return Object.freeze({ passed: false, errors: Object.freeze(["runbook is missing"]) });
  }
  const state = fs.lstatSync(document);
  if (state.isSymbolicLink() || !state.isFile()) {
    return Object.freeze({ passed: false, errors: Object.freeze(["runbook must be an ordinary file"]) });
  }
  const content = fs.readFileSync(document, "utf8").replace(/\r\n?/gu, "\n");
  const errors = [];
  for (const relative of REQUIRED_FILES) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) errors.push(`referenced implementation is missing: ${relative}`);
    else {
      const implementationState = fs.lstatSync(file);
      if (implementationState.isSymbolicLink() || !implementationState.isFile()) {
        errors.push(`referenced implementation is not an ordinary file: ${relative}`);
      }
    }
  }
  for (const command of REQUIRED_COMMANDS) {
    if (!content.includes(command)) errors.push(`runbook omits command: ${command}`);
  }
  if (!content.includes("GitHub Actions") || !content.includes("Vercel")) {
    errors.push("runbook must state both hosted execution boundaries");
  }
  if (!content.includes("ops/github-actions-reference/workflows")) {
    errors.push("runbook must identify the inactive workflow archive");
  }
  if (!content.includes("EVAVO_ART_MIN_FREE_BYTES") || !content.includes("EVAVO_ART_LOCAL_GATE_TIMEOUT_MS")) {
    errors.push("runbook must document storage and timeout controls");
  }
  return Object.freeze({ passed: errors.length === 0, errors: Object.freeze(errors) });
}

test("the local-first runbook references every governed implementation and canonical command", () => {
  const result = inspectLocalFirstRunbook();
  assert.equal(result.passed, true, result.errors.join("\n"));
});

test("runbook inspection fails closed for missing referenced implementation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-local-docs-"));
  try {
    for (const relative of REQUIRED_FILES.slice(1)) writeFixture(root, relative);
    writeFixture(
      root,
      "docs/LOCAL_FIRST_WORKSTATION.md",
      [
        ...REQUIRED_COMMANDS,
        "GitHub Actions Vercel ops/github-actions-reference/workflows",
        "EVAVO_ART_MIN_FREE_BYTES EVAVO_ART_LOCAL_GATE_TIMEOUT_MS",
      ].join("\n"),
    );
    const result = inspectLocalFirstRunbook(root);
    assert.equal(result.passed, false);
    assert.match(result.errors.join("\n"), /\.githooks\/pre-push/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectLocalFirstRunbook();
  process.stdout.write(`${JSON.stringify({ schema: "evavo.art-studio.local-first-runbook-check.v1", ...result })}\n`);
  if (!result.passed) process.exitCode = 1;
}
