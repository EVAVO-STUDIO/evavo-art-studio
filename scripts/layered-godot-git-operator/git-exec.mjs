import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { operatorFail } from "./contract.mjs";

const MAXIMUM_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

function appendBounded(chunks, chunk, state, stream) {
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
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maximumBytes = MAXIMUM_GIT_OUTPUT_BYTES,
  env = {},
  stdin = null,
  errorCode = "GIT_FAILED",
} = {}) {
  if (!Array.isArray(args) || args.some((entry) => typeof entry !== "string" || entry.includes("\0"))) {
    operatorFail("GIT_COMMAND_REJECTED", "Git arguments must be bounded strings without NUL bytes.");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(gitExecutable, args, {
      cwd: root,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
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
    child.stdout.on("data", (chunk) => appendBounded(stdout, chunk, state, "stdout"));
    child.stderr.on("data", (chunk) => appendBounded(stderr, chunk, state, "stderr"));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { operatorFail("GIT_EXECUTION_FAILED", error.message); }
      catch (failure) { reject(failure); }
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      if (timedOut) {
        try { operatorFail("GIT_TIMEOUT", `Git command exceeded ${timeoutMs} ms.`); } catch (error) { reject(error); }
        return;
      }
      if (state.outputExceeded) {
        try { operatorFail("GIT_OUTPUT_LIMIT", `Git command exceeded ${maximumBytes} output bytes.`); } catch (error) { reject(error); }
        return;
      }
      if ((code ?? 1) !== 0) {
        const message = (err.length ? err : out).toString("utf8").trim().slice(-4096);
        try { operatorFail(errorCode, `Git exited with ${code ?? "null"}${signal ? ` (${signal})` : ""}: ${message}`); } catch (error) { reject(error); }
        return;
      }
      resolve({ code: code ?? 0, stdout: out, stderr: err });
    });
    if (stdin === null) child.stdin.end();
    else child.stdin.end(Buffer.isBuffer(stdin) ? stdin : Buffer.from(String(stdin), "utf8"));
  });
}

export function nulPaths(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean).sort();
}

export async function gitText(root, args, options = {}) {
  return (await runGit(root, args, options)).stdout.toString("utf8").trim();
}

export async function createEmptyHooksDirectory() {
  return mkdtemp(path.join(os.tmpdir(), "evavo-git-hooks-"));
}

export async function removeHooksDirectory(directory) {
  await rm(directory, { recursive: true, force: true });
}
