#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = ".githooks";

function git(args, optional = false) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", shell: false });
  if (result.status !== 0) {
    if (optional) return undefined;
    throw new Error((result.stderr || `git ${args.join(" ")} failed`).trim());
  }
  return (result.stdout || "").trim();
}

function main() {
  const mode = process.argv[2] ?? "install";
  if (!fs.existsSync(path.join(ROOT, ".git"))) throw new Error("run hook setup from a local Git checkout");
  if (!fs.existsSync(path.join(ROOT, EXPECTED, "pre-push"))) throw new Error("local pre-push hook is missing");
  const current = git(["config", "--local", "--get", "core.hooksPath"], true);
  if (mode === "--check") {
    if (current !== EXPECTED) throw new Error(`core.hooksPath is ${current || "unset"}; expected ${EXPECTED}`);
  } else if (mode === "--disable") {
    if (current === EXPECTED) git(["config", "--local", "--unset", "core.hooksPath"]);
  } else if (mode === "install") {
    if (current && current !== EXPECTED) throw new Error(`refusing to replace existing core.hooksPath ${current}`);
    git(["config", "--local", "core.hooksPath", EXPECTED]);
  } else {
    throw new Error("mode must be install, --check or --disable");
  }
  process.stdout.write(`${JSON.stringify({ ok: true, mode, hooksPath: git(["config", "--local", "--get", "core.hooksPath"], true) ?? null })}\n`);
}

main();
