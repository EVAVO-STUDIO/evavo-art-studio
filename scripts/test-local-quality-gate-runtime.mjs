import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn as spawnChild, spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildRuntimePlan,
  parseGateArguments,
  runCommand,
  runLocalQualityGate,
  runLocalQualityGateCli,
  safeWorktreeSnapshot,
} from "./local-quality-gate-guard.mjs";

function git(root, ...args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function repositoryFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-gate-runtime-"));
  git(root, "init");
  git(root, "config", "user.name", "EVAVO Test");
  git(root, "config", "user.email", "test@example.invalid");
  fs.writeFileSync(path.join(root, ".gitignore"), ".art-studio/\n");
  fs.writeFileSync(path.join(root, "tracked.txt"), "initial\n");
  git(root, "add", ".gitignore", "tracked.txt");
  git(root, "commit", "-m", "fixture");
  return root;
}

function plan(commands, options = {}) {
  return Object.freeze({
    requestedProfile: options.requestedProfile ?? "fast",
    profile: options.profile ?? "fast",
    reason: "runtime test",
    files: Object.freeze([]),
    workspaces: Object.freeze([]),
    commands: Object.freeze(commands),
    requireCleanStart: options.requireCleanStart ?? false,
    proveNoMutation: options.proveNoMutation ?? true,
  });
}

function nodeCommand(label, source) {
  return Object.freeze({
    label,
    executable: process.execPath,
    args: Object.freeze(["-e", source]),
  });
}

test("gate arguments are strict and preserve legacy profile names", () => {
  assert.deepEqual(parseGateArguments([]), {
    requestedProfile: "changed",
    planOnly: false,
  });
  assert.deepEqual(parseGateArguments(["prepush", "--plan"]), {
    requestedProfile: "prepush",
    planOnly: true,
  });
  assert.throws(
    () => parseGateArguments(["fast", "full"]),
    /accepts one profile/u,
  );
  assert.throws(
    () => parseGateArguments(["--cloud"]),
    /unsupported local gate argument/u,
  );
});

test("main pushes select clean release validation without hosted authority", () => {
  const result = buildRuntimePlan("push", {
    updates: [
      {
        localRef: "refs/heads/main",
        localSha: "a".repeat(40),
        remoteRef: "refs/heads/main",
        remoteSha: "b".repeat(40),
      },
    ],
  });
  assert.equal(result.profile, "release");
  assert.equal(result.requestedProfile, "push");
  assert.equal(result.requireCleanStart, true);
});

test("deleting main is rejected before any validation plan is built", () => {
  assert.throws(
    () =>
      buildRuntimePlan("push", {
        updates: [
          {
            localRef: "(delete)",
            localSha: "0".repeat(40),
            remoteRef: "refs/heads/main",
            remoteSha: "b".repeat(40),
          },
        ],
      }),
    (error) => error.code === "LOCAL_GATE_MAIN_DELETE_FORBIDDEN",
  );
});

test("runCommand hides child windows and returns bounded evidence", async () => {
  let spawnOptions;
  const result = await runCommand(
    nodeCommand("pass", "process.exit(0)"),
    {
      timeoutMs: 5_000,
      spawn(executable, args, options) {
        spawnOptions = options;
        return spawnChild(executable, args, options);
      },
    },
  );
  assert.equal(result.status, "passed");
  assert.equal(spawnOptions.windowsHide, true);
  assert.equal(spawnOptions.shell, false);
});

test("a clean gate writes an ignored atomic receipt and proves no source mutation", async () => {
  const root = repositoryFixture();
  try {
    const execution = await runLocalQualityGate(
      plan([nodeCommand("pass", "process.exit(0)")], {
        requireCleanStart: true,
      }),
      {
        root,
        timeoutMs: 5_000,
        skipRuntimeSelfTest: true,
        stdio: "ignore",
      },
    );
    assert.equal(execution.receipt.status, "passed");
    assert.equal(execution.receipt.before.clean, true);
    assert.equal(execution.receipt.after.clean, true);
    assert.equal(execution.receipt.commandResults.length, 1);
    assert.equal(fs.existsSync(execution.paths.versionedPath), true);
    assert.equal(fs.existsSync(execution.paths.latestPath), true);
    assert.equal(safeWorktreeSnapshot(root).clean, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("source mutation fails closed and persists a failed receipt", async () => {
  const root = repositoryFixture();
  try {
    await assert.rejects(
      runLocalQualityGate(
        plan([
          nodeCommand(
            "mutate",
            "require('node:fs').writeFileSync('tracked.txt', 'changed\\n')",
          ),
        ]),
        {
          root,
          timeoutMs: 5_000,
          skipRuntimeSelfTest: true,
          stdio: "ignore",
        },
      ),
      (error) => {
        assert.equal(error.code, "LOCAL_GATE_SOURCE_MUTATED");
        assert.equal(fs.existsSync(error.receiptPaths.latestPath), true);
        const receipt = JSON.parse(
          fs.readFileSync(error.receiptPaths.latestPath, "utf8"),
        );
        assert.equal(receipt.status, "failed");
        return true;
      },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("plan-only CLI serialises authority without executing commands", async () => {
  const root = repositoryFixture();
  const output = [];
  try {
    const result = await runLocalQualityGateCli(["fast", "--plan"], {
      root,
      writeStdout(value) {
        output.push(value);
      },
    });
    assert.equal(result.execution, null);
    const parsed = JSON.parse(output.join(""));
    assert.equal(parsed.profile, "fast");
    assert.equal(parsed.authority.githubActionsRequired, false);
    assert.equal(parsed.authority.vercelRequired, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
