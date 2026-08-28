#!/usr/bin/env node
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  inspectArtStudioStorage,
  storageThresholds,
} from "./check-local-storage-headroom.mjs";

export const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const DEFAULT_TERMINATION_GRACE_MS = 5_000;
const COMMANDS = new Set(["once", "until-idle", "daemon"]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "LocalArtStudioWorkerError";
  error.code = code;
  throw error;
}

function boundedInteger(value, fallback, minimum, maximum, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail(
      "LOCAL_WORKER_INTEGER_INVALID",
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return parsed;
}

export function workerCommandLine(command) {
  if (!COMMANDS.has(command)) {
    fail(
      "LOCAL_WORKER_COMMAND_INVALID",
      "worker command must be once, until-idle or daemon.",
    );
  }
  return Object.freeze([
    "pnpm",
    "--filter",
    "@evavo/art-studio-worker",
    "start",
    "--",
    command,
  ]);
}

function terminateProcessTree(child, force = false, options = {}) {
  if (!child?.pid) return;
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    (options.spawnSync ?? spawnSync)(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        shell: false,
        stdio: "ignore",
        timeout: 10_000,
        windowsHide: true,
      },
    );
    return;
  }
  const signal = force ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The child has already stopped.
    }
  }
}

export async function runLocalWorker(command, options = {}) {
  const root = options.root ?? REPOSITORY_ROOT;
  const environment = { ...process.env, ...(options.environment ?? {}) };
  const thresholds = storageThresholds(environment, options);
  const inspect = options.inspectStorage ?? inspectArtStudioStorage;
  const spawnChild = options.spawn ?? spawn;
  const terminate =
    options.terminateProcessTree ??
    ((child, force) => terminateProcessTree(child, force, options));
  const terminationGraceMs = boundedInteger(
    options.terminationGraceMs ?? environment.EVAVO_ART_WORKER_TERMINATION_GRACE_MS,
    DEFAULT_TERMINATION_GRACE_MS,
    0,
    60_000,
    "worker termination grace",
  );

  inspect({ root, environment, ...thresholds });
  const [executable, ...args] = workerCommandLine(command);
  const child = spawnChild(executable, args, {
    cwd: root,
    env: environment,
    shell: false,
    stdio: options.stdio ?? "inherit",
    detached: (options.platform ?? process.platform) !== "win32",
    windowsHide: true,
  });

  let storageFailure;
  let checking = false;
  let stopping = false;
  let forceTimer;
  const requestStop = () => {
    if (stopping || child.exitCode !== null || child.signalCode !== null) return;
    stopping = true;
    terminate(child, false);
    forceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        terminate(child, true);
      }
    }, terminationGraceMs);
    forceTimer.unref?.();
  };
  const check = () => {
    if (
      checking ||
      stopping ||
      child.exitCode !== null ||
      child.signalCode !== null
    ) {
      return;
    }
    checking = true;
    try {
      inspect({ root, environment, ...thresholds });
    } catch (error) {
      storageFailure = error;
      requestStop();
    } finally {
      checking = false;
    }
  };
  const timer =
    command === "daemon"
      ? setInterval(check, thresholds.intervalMs)
      : undefined;
  timer?.unref?.();

  const onAbort = () => requestStop();
  if (options.signal?.aborted) onAbort();
  else options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    if (storageFailure) throw storageFailure;
    if (options.signal?.aborted) {
      return Object.freeze({ status: "cancelled", ...result });
    }
    if (result.code !== 0) {
      fail(
        "LOCAL_WORKER_EXITED",
        `worker exited with code ${result.code ?? "unknown"}${
          result.signal ? ` (${result.signal})` : ""
        }.`,
      );
    }
    return Object.freeze({ status: "passed", ...result });
  } finally {
    if (timer) clearInterval(timer);
    if (forceTimer) clearTimeout(forceTimer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

async function main() {
  const command = process.argv[2] ?? "once";
  if (process.argv.length > 3) {
    fail(
      "LOCAL_WORKER_ARGUMENT_UNSUPPORTED",
      "unexpected worker arguments.",
    );
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const result = await runLocalWorker(command, {
      root: REPOSITORY_ROOT,
      signal: controller.signal,
    });
    process.stdout.write(
      `${JSON.stringify({
        service: "evavo-art-studio-local-worker",
        command,
        ...result,
      })}\n`,
    );
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code: error?.code ?? "LOCAL_WORKER_UNEXPECTED_ERROR",
          message: error instanceof Error ? error.message : String(error),
          details: error?.details,
        },
      })}\n`,
    );
    process.exitCode = 1;
  });
}
