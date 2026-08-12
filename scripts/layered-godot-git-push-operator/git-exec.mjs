import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { pushFail } from "./contract.mjs";

const MAXIMUM_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_LOCAL_TIMEOUT_MS = 30_000;
const DEFAULT_NETWORK_TIMEOUT_MS = 120_000;

function appendBounded(chunks, chunk, state) {
  const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  state.bytes += data.byteLength;
  if (state.bytes > state.maximumBytes) {
    state.outputExceeded = true;
    state.kill?.();
    return;
  }
  chunks.push(data);
}

export async function runGit(root, args, {
  gitExecutable = "git",
  timeoutMs = DEFAULT_LOCAL_TIMEOUT_MS,
  maximumBytes = MAXIMUM_GIT_OUTPUT_BYTES,
  env = {},
  stdin = null,
  allowedExitCodes = [0],
  allowAnyExitCode = false,
  errorCode = "GIT_FAILED",
} = {}) {
  if (
    !Array.isArray(args) || args.length < 1 ||
    args.some((entry) => typeof entry !== "string" || entry.length > 8192 || entry.includes("\0")) ||
    (!allowAnyExitCode && (!Array.isArray(allowedExitCodes) || allowedExitCodes.some((entry) => !Number.isInteger(entry))))
  ) pushFail("GIT_COMMAND_REJECTED", "Git invocation arguments are invalid or unbounded.");

  return await new Promise((resolve, reject) => {
    const child = spawn(gitExecutable, args, {
      cwd: root,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
        LC_ALL: "C",
        LANG: "C",
        ...env,
      },
    });
    const stdout = [];
    const stderr = [];
    const state = { bytes: 0, maximumBytes, outputExceeded: false, kill: null };
    let timedOut = false;
    let settled = false;
    const kill = () => {
      if (child.killed) return;
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    state.kill = kill;
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    child.stdout.on("data", (chunk) => appendBounded(stdout, chunk, state));
    child.stderr.on("data", (chunk) => appendBounded(stderr, chunk, state));
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { pushFail("GIT_EXECUTION_FAILED", error.message); }
      catch (failure) { reject(failure); }
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      if (timedOut) {
        try { pushFail("GIT_TIMEOUT", `Git command exceeded ${timeoutMs} ms.`); }
        catch (failure) { reject(failure); }
        return;
      }
      if (state.outputExceeded) {
        try { pushFail("GIT_OUTPUT_LIMIT", `Git command exceeded ${maximumBytes} output bytes.`); }
        catch (failure) { reject(failure); }
        return;
      }
      const exitCode = code ?? 1;
      if (!allowAnyExitCode && !allowedExitCodes.includes(exitCode)) {
        const message = (err.length ? err : out).toString("utf8").trim().slice(-4096);
        try { pushFail(errorCode, `Git exited with ${exitCode}${signal ? ` (${signal})` : ""}: ${message}`); }
        catch (failure) { reject(failure); }
        return;
      }
      resolve(Object.freeze({ exitCode, signal: signal ?? null, stdout: out, stderr: err }));
    });
    if (stdin === null) child.stdin.end();
    else child.stdin.end(Buffer.isBuffer(stdin) ? stdin : Buffer.from(String(stdin), "utf8"));
  });
}

export async function gitText(root, args, options = {}) {
  return (await runGit(root, args, options)).stdout.toString("utf8").trim();
}

export function nulPaths(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean).sort();
}

export function networkOptions(options = {}) {
  return { timeoutMs: DEFAULT_NETWORK_TIMEOUT_MS, ...options };
}

export async function createEmptyHooksDirectory() {
  return mkdtemp(path.join(os.tmpdir(), "evavo-git-push-hooks-"));
}

export async function removeHooksDirectory(directory) {
  await rm(directory, { recursive: true, force: true });
}
