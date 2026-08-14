import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  linkSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { REQUIRED_GAME_VALIDATION_SUITES } from "./frame-atlas-v3-game-validation-admission.mjs";

const HEAD = "723b6b6954e67c08ed337fad62c5ef2e10536234";
const CLI_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "heavy-metal-fighting-frame-atlas-v3.mjs",
);

function timestamp(second) {
  return `2026-08-14T10:00:${String(second).padStart(2, "0")}.0000000Z`;
}

function receiptBytes() {
  const receipt = {
    schema: "steel-dominion.hmf-atlas-v3-local-validation.v1",
    status: "passed",
    repository: "EVAVO-STUDIO/steel-dominion",
    public_title: "HEAVY METAL FIGHTING",
    branch: "codex/hmf-atlas-v3-runtime-cutover-20260812",
    head: HEAD,
    godot_exe: "C:\\Godot_v4.6.2-stable_win64\\Godot_v4.6.2-stable_win64.exe",
    godot_version: "4.6.2.stable.official.abcdef",
    started_at_utc: timestamp(0),
    completed_at_utc: timestamp(12),
    duration_seconds: 12,
    suite_count: 6,
    completed_suite_count: 6,
    suites: REQUIRED_GAME_VALIDATION_SUITES.map((suite, index) => ({
      id: suite.id,
      runner: suite.runner,
      status: "passed",
      started_at_utc: timestamp(index * 2),
      completed_at_utc: timestamp(index * 2 + 1),
      duration_seconds: 1,
      error: null,
    })),
    source_tree_clean_before: true,
    source_tree_clean_after: true,
    github_actions_required: false,
    image_generation: false,
    error: null,
  };
  return Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(`${JSON.stringify(receipt, null, 2)}\r\n`, "utf8"),
  ]);
}

function runCli(receiptPath) {
  return spawnSync(
    process.execPath,
    [
      CLI_PATH,
      "admit-game-validation",
      "--validation-receipt",
      receiptPath,
      "--expected-game-head",
      HEAD,
    ],
    { encoding: "utf8" },
  );
}

test("CLI admits one stable single-link regular validation receipt", () => {
  const root = mkdtempSync(path.join(tmpdir(), "hmf-game-validation-file-"));
  try {
    const receiptPath = path.join(root, "validation.json");
    writeFileSync(receiptPath, receiptBytes());
    const result = runCli(receiptPath);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const admission = JSON.parse(result.stdout);
    assert.equal(admission.validatedGameHead, HEAD);
    assert.equal(admission.authority.gameRepositoryMutation, false);
    assert.equal(admission.authority.runtimeActivation, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  "CLI rejects a symbolic validation-receipt endpoint before admission",
  { skip: process.platform === "win32" },
  () => {
    const root = mkdtempSync(path.join(tmpdir(), "hmf-game-validation-symlink-"));
    try {
      const realPath = path.join(root, "real.json");
      const linkPath = path.join(root, "linked.json");
      writeFileSync(realPath, receiptBytes());
      symlinkSync(realPath, linkPath, "file");
      const result = runCli(linkPath);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /path may not contain a symbolic link or junction/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "CLI rejects a symbolic parent directory in the validation-receipt path",
  { skip: process.platform === "win32" },
  () => {
    const root = mkdtempSync(path.join(tmpdir(), "hmf-game-validation-parent-link-"));
    try {
      const realDirectory = path.join(root, "real");
      const linkedDirectory = path.join(root, "linked");
      mkdirSync(realDirectory);
      writeFileSync(path.join(realDirectory, "validation.json"), receiptBytes());
      symlinkSync(realDirectory, linkedDirectory, "dir");
      const result = runCli(path.join(linkedDirectory, "validation.json"));
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /path may not contain a symbolic link or junction/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "CLI rejects multiply-linked validation evidence",
  { skip: process.platform === "win32" },
  () => {
    const root = mkdtempSync(path.join(tmpdir(), "hmf-game-validation-hardlink-"));
    try {
      const receiptPath = path.join(root, "validation.json");
      const aliasPath = path.join(root, "validation-alias.json");
      writeFileSync(receiptPath, receiptBytes());
      linkSync(receiptPath, aliasPath);
      const result = runCli(receiptPath);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /must have exactly one filesystem link/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
