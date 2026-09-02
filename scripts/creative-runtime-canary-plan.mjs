#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const consumer = "art-studio";
const localStorageRoot = resolve(process.env.EVAVO_LOCAL_STORAGE_ROOT || "C:\\GitRepos\\evavo-local-storage");
const planner = join(localStorageRoot, "scripts", "plan_creative_media_canaries.py");
if (!existsSync(planner)) { process.stderr.write(`EVAVO creative canary planner is missing: ${planner}\n`); process.exit(2); }
const candidates = process.env.EVAVO_PYTHON ? [[process.env.EVAVO_PYTHON, []]] : [["py", ["-3.12"]], ["python", []], ["python3", []]];
for (const [command, prefix] of candidates) {
  const probe = spawnSync(command, [...prefix, "--version"], { encoding: "utf8", windowsHide: true });
  if (probe.error) continue;
  const run = spawnSync(command, [...prefix, planner, "--consumer", consumer, ...process.argv.slice(2)], { stdio: "inherit", windowsHide: true, shell: false });
  process.exit(run.status ?? 2);
}
process.stderr.write("No usable Python runtime was found for the EVAVO creative canary planner.\n"); process.exit(2);
