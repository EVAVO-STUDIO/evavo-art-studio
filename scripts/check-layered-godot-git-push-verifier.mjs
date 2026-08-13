#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tests = spawnSync(
  process.execPath,
  ["--test", path.join(root, "scripts/test-layered-godot-git-push-verifier.mjs")],
  { cwd: root, encoding: "utf8", shell: false, windowsHide: true, timeout: 120_000 },
);
if (tests.stdout) process.stdout.write(tests.stdout);
if (tests.stderr) process.stderr.write(tests.stderr);
assert.equal(tests.status, 0, "push verifier tests failed");
console.log("Layered Godot Git push verifier contract passed.");
console.log("- exact source commit and push receipts are re-admitted through closed contracts");
console.log("- generated verification receipts are re-admitted through their own exact closed contract");
console.log("- inherited hashes and commit, parent, tree and branch identity must agree across receipts");
console.log("- local and remote identities are proved twice across the verification window");
console.log("- the Git command surface is closed and read-only");
console.log("- commit, push, deployment and release authority remain false");
