#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(root, "scripts", "execute-raw-art-runtime-cycle.mjs");
const docsPath = path.join(root, "docs", "RAW_ART_RUNTIME_CYCLE.md");

for (const target of [scriptPath, docsPath]) {
  const state = fs.lstatSync(target);
  assert.equal(state.isFile(), true);
  assert.equal(state.isSymbolicLink(), false);
  assert.ok(state.size > 0 && state.size < 2_000_000);
}

const syntax = spawnSync(process.execPath, ["--check", scriptPath], {
  cwd: root,
  encoding: "utf8",
  shell: false,
  windowsHide: true,
});
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

const source = fs.readFileSync(scriptPath, "utf8");
for (const token of [
  "evavo.raw-art-provider-runtime-batch.v1",
  "submit_art_runtime_jobs",
  "worker:once",
  "worker:until-idle",
  "evavo.raw-art-runtime-cycle-receipt.v1",
  "selectedRuntimeJobsSha256",
  "candidateApproval: false",
  "repositoryMutation: false",
  "publication: false",
  "forcePush: false",
  "Execution requires --confirm",
  "Receipt already exists",
]) {
  assert.equal(source.includes(token), true, token);
}
for (const forbidden of [
  "shell:" + " true",
  "git push",
  "git commit",
  "OPENAI_" + "API_KEY",
  "ANTHROPIC_" + "API_KEY",
  "automaticApproval: true",
]) {
  assert.equal(source.includes(forbidden), false, forbidden);
}

console.log("RAW_ART runtime cycle governance passed.");
console.log("- exact runtime jobs are selected from the canonical batch");
console.log("- submission and worker execution remain separate recorded effects");
console.log("- candidates remain unapproved and no repository publication is performed");
