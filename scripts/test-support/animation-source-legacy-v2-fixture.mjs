import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function git(root, ...args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

export async function legacyFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-legacy-v2-"));
  git(root, "init");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "user.name", "Fixture");
  return root;
}

export async function track(root, trackedPath, content) {
  const target = path.join(root, ...trackedPath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  git(root, "add", "--", trackedPath);
  return target;
}

export async function removeFixture(root) {
  await rm(root, { recursive: true, force: true });
}
