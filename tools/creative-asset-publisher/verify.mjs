#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const launcher = path.join(path.dirname(fileURLToPath(import.meta.url)), "run.mjs");
const result = spawnSync(process.execPath, [launcher, "verify"], {
  stdio: "inherit",
  shell: false,
  windowsHide: true,
  env: process.env
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Creative Asset Publisher verification terminated by ${result.signal}.`);
process.exitCode = result.status ?? 1;
