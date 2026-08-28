#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const HOOKS_PATH = ".githooks";
export const PRE_PUSH_HOOK = `${HOOKS_PATH}/pre-push`;
export const EXPECTED_PRE_PUSH_CONTENT = `#!/bin/sh
set -eu
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
exec node scripts/local-quality-gate.mjs push
`;

function fail(code, message) {
  const error = new Error(message);
  error.name = "LocalHookSetupError";
  error.code = code;
  throw error;
}

function runGit(args, root, optional = false) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    if (optional) return undefined;
    fail(
      "LOCAL_HOOK_GIT_FAILED",
      `git ${args.join(" ")} failed: ${result.error?.message ?? (result.stderr || "").trim()}`,
    );
  }
  return (result.stdout || "").trim();
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function validatePrePushHook(root = REPOSITORY_ROOT) {
  const hook = path.resolve(root, PRE_PUSH_HOOK);
  if (!within(path.resolve(root), hook)) {
    fail("LOCAL_HOOK_PATH_ESCAPED", "pre-push hook escaped the repository root.");
  }
  if (!fs.existsSync(hook)) {
    fail("LOCAL_HOOK_MISSING", `${PRE_PUSH_HOOK} is missing.`);
  }
  const state = fs.lstatSync(hook);
  if (state.isSymbolicLink() || !state.isFile()) {
    fail("LOCAL_HOOK_FILE_INVALID", `${PRE_PUSH_HOOK} must be an ordinary file.`);
  }
  const content = fs.readFileSync(hook, "utf8").replace(/\r\n?/gu, "\n");
  if (content !== EXPECTED_PRE_PUSH_CONTENT) {
    fail(
      "LOCAL_HOOK_CONTENT_DRIFT",
      `${PRE_PUSH_HOOK} must invoke the authoritative local push profile exactly.`,
    );
  }
  if (process.platform !== "win32" && (state.mode & 0o111) === 0) {
    fail("LOCAL_HOOK_NOT_EXECUTABLE", `${PRE_PUSH_HOOK} is not executable.`);
  }
  return Object.freeze({ path: PRE_PUSH_HOOK, executable: process.platform === "win32" || (state.mode & 0o111) !== 0 });
}

export function localHooksStatus(root = REPOSITORY_ROOT) {
  const configured = runGit(["config", "--local", "--get", "core.hooksPath"], root, true);
  let hook;
  let hookError;
  try {
    hook = validatePrePushHook(root);
  } catch (error) {
    hookError = {
      code: error?.code ?? "LOCAL_HOOK_INVALID",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return Object.freeze({
    schema: "evavo.art-studio.local-hooks-status.v1",
    configuredHooksPath: configured ?? null,
    expectedHooksPath: HOOKS_PATH,
    configured: configured === HOOKS_PATH,
    hook: hook ?? null,
    hookError: hookError ?? null,
    githubActionsRequired: false,
    vercelRequired: false,
  });
}

export function installLocalHooks(root = REPOSITORY_ROOT) {
  const repositoryRoot = path.resolve(root);
  const dotGit = path.join(repositoryRoot, ".git");
  if (!fs.existsSync(dotGit)) {
    fail("LOCAL_HOOK_NOT_GIT_CHECKOUT", "local hooks can only be installed in a Git checkout.");
  }
  const hook = path.join(repositoryRoot, PRE_PUSH_HOOK);
  if (!fs.existsSync(hook)) {
    fs.mkdirSync(path.dirname(hook), { recursive: true });
    fs.writeFileSync(hook, EXPECTED_PRE_PUSH_CONTENT, { encoding: "utf8", mode: 0o755, flag: "wx" });
  } else {
    const state = fs.lstatSync(hook);
    if (state.isSymbolicLink() || !state.isFile()) {
      fail("LOCAL_HOOK_FILE_INVALID", `${PRE_PUSH_HOOK} must be an ordinary file.`);
    }
    const current = fs.readFileSync(hook, "utf8").replace(/\r\n?/gu, "\n");
    if (current !== EXPECTED_PRE_PUSH_CONTENT) {
      fail(
        "LOCAL_HOOK_CONTENT_DRIFT",
        `${PRE_PUSH_HOOK} differs from the governed hook; refusing to overwrite it automatically.`,
      );
    }
  }
  if (process.platform !== "win32") fs.chmodSync(hook, 0o755);
  runGit(["config", "--local", "core.hooksPath", HOOKS_PATH], repositoryRoot);
  const status = localHooksStatus(repositoryRoot);
  if (!status.configured || status.hookError) {
    fail("LOCAL_HOOK_INSTALL_VERIFY_FAILED", "local hook installation did not verify cleanly.");
  }
  return status;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const planOnly = args.has("--plan");
  const checkOnly = args.has("--check");
  if (args.size > Number(planOnly) + Number(checkOnly)) {
    fail("LOCAL_HOOK_ARGUMENT_INVALID", "supported arguments are --plan and --check.");
  }
  if (planOnly) {
    process.stdout.write(
      `${JSON.stringify({
        schema: "evavo.art-studio.local-hooks-plan.v1",
        operation: "install",
        hooksPath: HOOKS_PATH,
        hook: PRE_PUSH_HOOK,
        command: ["node", "scripts/local-quality-gate.mjs", "push"],
        repositoryMutation: false,
        gitLocalConfigurationMutation: true,
        cloudRequired: false,
      }, null, 2)}\n`,
    );
    return;
  }
  const status = checkOnly ? localHooksStatus(REPOSITORY_ROOT) : installLocalHooks(REPOSITORY_ROOT);
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  if (!status.configured || status.hookError) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code: error?.code ?? "LOCAL_HOOK_UNEXPECTED_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      })}\n`,
    );
    process.exitCode = 1;
  }
}
