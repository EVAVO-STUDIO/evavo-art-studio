import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  runLocalWorker,
  workerCommandLine,
} from "./run-local-worker.mjs";

function fakeChild(pid = 12345) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {};
  child.finish = (code = 0, signal = null) => {
    child.exitCode = code;
    child.signalCode = signal;
    child.emit("exit", code, signal);
  };
  return child;
}

test("local worker wrapper supports the complete governed command set", () => {
  for (const command of ["once", "until-idle", "daemon"]) {
    assert.deepEqual(workerCommandLine(command), [
      "pnpm",
      "--filter",
      "@evavo/art-studio-worker",
      "start",
      "--",
      command,
    ]);
  }
  assert.throws(
    () => workerCommandLine("cloud"),
    /once, until-idle or daemon/u,
  );
});

test("worker launch is shell-free and hidden on Windows-capable hosts", async () => {
  let spawnOptions;
  const child = fakeChild();
  const running = runLocalWorker("once", {
    inspectStorage() {},
    spawn(_executable, _args, options) {
      spawnOptions = options;
      queueMicrotask(() => child.finish(0));
      return child;
    },
    stdio: "ignore",
  });
  const result = await running;
  assert.equal(result.status, "passed");
  assert.equal(spawnOptions.shell, false);
  assert.equal(spawnOptions.windowsHide, true);
});

test("an already-aborted run escalates to force termination without hanging", async () => {
  const child = fakeChild();
  const controller = new AbortController();
  controller.abort();
  const terminations = [];
  const result = await runLocalWorker("daemon", {
    signal: controller.signal,
    intervalMs: 1_000,
    terminationGraceMs: 0,
    inspectStorage() {},
    spawn() {
      return child;
    },
    terminateProcessTree(_child, force) {
      terminations.push(force);
      if (force) child.finish(null, "SIGKILL");
    },
    stdio: "ignore",
  });
  assert.equal(result.status, "cancelled");
  assert.deepEqual(terminations, [false, true]);
});
