import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  EXPECTED_PRE_PUSH_CONTENT,
  installLocalHooks,
  localHooksStatus,
  validatePrePushHook,
} from "./setup-local-hooks.mjs";

function git(root, ...args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(content = EXPECTED_PRE_PUSH_CONTENT) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-local-hooks-"));
  git(root, "init");
  fs.mkdirSync(path.join(root, ".githooks"));
  fs.writeFileSync(path.join(root, ".githooks", "pre-push"), content, { mode: 0o755 });
  if (process.platform !== "win32") fs.chmodSync(path.join(root, ".githooks", "pre-push"), 0o755);
  return root;
}

test("the governed hook invokes the canonical local push profile", () => {
  assert.match(EXPECTED_PRE_PUSH_CONTENT, /local-quality-gate\.mjs push/u);
  assert.doesNotMatch(EXPECTED_PRE_PUSH_CONTENT, /vercel|workflow_dispatch|actions\//u);
});

test("hook installation is checkout-local, idempotent and verifiable", () => {
  const root = fixture();
  try {
    assert.equal(localHooksStatus(root).configured, false);
    const installed = installLocalHooks(root);
    assert.equal(installed.configured, true);
    assert.equal(installed.configuredHooksPath, ".githooks");
    assert.equal(installed.hookError, null);
    assert.equal(installLocalHooks(root).configured, true);
    assert.equal(git(root, "config", "--local", "--get", "core.hooksPath"), ".githooks");
    assert.equal(validatePrePushHook(root).path, ".githooks/pre-push");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installer refuses to overwrite a drifted governed hook", () => {
  const root = fixture("#!/bin/sh\necho bypass\n");
  try {
    assert.equal(localHooksStatus(root).hookError.code, "LOCAL_HOOK_CONTENT_DRIFT");
    assert.throws(() => installLocalHooks(root), /refusing to overwrite/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
