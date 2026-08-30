#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";

import {
  inspectAnimationPipelineV1,
  planAnimationPipelineRepairsV1,
  verifyAnimationPipelineV1,
} from "./animation_pipeline_doctor_v1.mjs";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;

function fail(code, detail) { throw new Error(detail ? `${code}:${detail}` : code); }
function safePath(value) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.includes("\0") || value.split(/[\\/]+/u).includes("..")) fail("ANIMATION_PIPELINE_DOCTOR_INPUT_PATH_INVALID", String(value));
  const root = process.cwd();
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) fail("ANIMATION_PIPELINE_DOCTOR_INPUT_PATH_OUTSIDE_WORKSPACE");
  return absolute;
}
async function input(path) {
  if (!path) return {};
  const absolute = safePath(path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_INPUT_BYTES) fail("ANIMATION_PIPELINE_DOCTOR_INPUT_FILE_INVALID");
  return JSON.parse(await readFile(absolute, "utf8"));
}
async function main() {
  const [command = "inspect", inputPath] = process.argv.slice(2);
  if (!new Set(["inspect", "verify", "plan"]).has(command)) fail("ANIMATION_PIPELINE_DOCTOR_USAGE", "node tools/animation_pipeline_doctor_v1_cli.mjs <inspect|verify|plan> [input.json]");
  const value = await input(inputPath);
  const report = command === "verify" ? await verifyAnimationPipelineV1(value) : await inspectAnimationPipelineV1(value);
  process.stdout.write(`${JSON.stringify(command === "plan" ? planAnimationPipelineRepairsV1(report) : report, null, 2)}\n`);
}
main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error), authority: { fileRead: true, fileWrite: false, providerExecution: false, automaticCreativeApproval: false, artifactPromotion: false, targetRepositoryMutation: false, gitCommit: false, gitPush: false, runtimeActivation: false, publication: false } })}\n`);
  process.exitCode = 1;
});
