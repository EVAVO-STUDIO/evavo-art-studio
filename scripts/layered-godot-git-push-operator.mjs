#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
  LAYERED_GODOT_GIT_PUSH_RECEIPT_KIND,
  LayeredGodotGitPushOperatorError,
  canonicalSha256,
  pushFail,
} from "./layered-godot-git-push-operator/contract.mjs";
import { pushLayeredGodotCommit } from "./layered-godot-git-push-operator/runtime.mjs";

export {
  LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
  LAYERED_GODOT_GIT_PUSH_RECEIPT_KIND,
  LayeredGodotGitPushOperatorError,
  canonicalSha256,
} from "./layered-godot-git-push-operator/contract.mjs";
export { runGit } from "./layered-godot-git-push-operator/git-exec.mjs";
export { inspectOrigin, readRemoteHead } from "./layered-godot-git-push-operator/origin.mjs";
export { pushLayeredGodotCommit } from "./layered-godot-git-push-operator/runtime.mjs";

async function readJson(filePath, label, readStableRegularFile) {
  const inspected = await readStableRegularFile(path.resolve(filePath), label);
  if (inspected.bytes > 32 * 1024 * 1024) pushFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  try { return JSON.parse(inspected.data.toString("utf8")); }
  catch { pushFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`); }
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (command !== "push") pushFail("CLI_INVALID", "Usage: layered-godot-git-push-operator.mjs push --commit-receipt FILE --workspace DIR --repository OWNER/REPO");
  if (rest.length % 2 !== 0) pushFail("CLI_INVALID", "CLI flags must be --flag value pairs.");
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index], value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) pushFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`);
    if (values.has(flag)) pushFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`);
    values.set(flag, value);
  }
  const allowed = ["--commit-receipt", "--workspace", "--repository"];
  for (const key of allowed) if (!values.has(key)) pushFail("CLI_INVALID", `Missing ${key}.`);
  for (const key of values.keys()) if (!allowed.includes(key)) pushFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
  return values;
}

async function main() {
  try {
    const values = parseCli(process.argv.slice(2));
    const filesystem = await import("./layered-godot-workspace-writer/filesystem.mjs");
    const commitReceipt = await readJson(values.get("--commit-receipt"), "commit receipt", filesystem.readStableRegularFile);
    console.log(JSON.stringify(await pushLayeredGodotCommit({
      commitReceipt,
      workspaceRoot: path.resolve(values.get("--workspace")),
      expectedRepository: values.get("--repository"),
      authorization: { push: true, forcePush: false, tags: false },
    }), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      code: error instanceof LayeredGodotGitPushOperatorError ? error.code : "LAYERED_GODOT_GIT_PUSH_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof LayeredGodotGitPushOperatorError && error.details !== undefined ? { details: error.details } : {}),
    }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
