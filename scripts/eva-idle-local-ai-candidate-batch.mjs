#!/usr/bin/env node

import { lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";

import {
  applyEvaIdleLocalAiCandidateBatch,
  prepareEvaIdleLocalAiCandidateBatch,
} from "../tools/eva_idle_local_ai_candidate_batch_v1.mjs";

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}
function inside(root, absolute) {
  const rel = relative(root, absolute);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
async function existingFile(root, value, code) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    fail(code);
  }
  const lexical = resolve(root, value);
  if (!inside(root, lexical)) fail(code);
  const stat = await lstat(lexical);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code);
  const physical = await realpath(lexical);
  if (!inside(root, physical)) fail(code);
  return physical;
}
async function createPath(root, value, code) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    fail(code);
  }
  const absolute = resolve(root, value);
  if (!inside(root, absolute) || absolute === root) fail(code);
  const rel = relative(root, absolute).replaceAll("\\", "/");
  let probe = root;
  for (const part of rel.split("/").slice(0, -1)) {
    probe = resolve(probe, part);
    try {
      const stat = await lstat(probe);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail(code);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      break;
    }
  }
  await mkdir(dirname(absolute), { recursive: true });
  const parent = await realpath(dirname(absolute));
  if (!inside(root, parent)) fail(code);
  try {
    await lstat(absolute);
    fail(`${code}_EXISTS`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return absolute;
}
function exactTime(value, code) {
  if (typeof value !== "string") fail(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) fail(code);
  return parsed;
}
async function writeExclusive(path, body) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(body, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function main() {
  const [command, inputValue, outputValue] = process.argv.slice(2);
  if (
    !["prepare", "apply"].includes(command) ||
    !inputValue ||
    !outputValue ||
    process.argv.length !== 5
  ) {
    fail(
      "EVA_IDLE_CANDIDATE_BATCH_USAGE",
      "node scripts/eva-idle-local-ai-candidate-batch.mjs <prepare|apply> <input.json> <create-only-output.json>",
    );
  }
  const root = await realpath(process.cwd());
  const inputPath = await existingFile(
    root,
    inputValue,
    "EVA_IDLE_CANDIDATE_BATCH_INPUT_PATH_INVALID",
  );
  const outputPath = await createPath(
    root,
    outputValue,
    "EVA_IDLE_CANDIDATE_BATCH_OUTPUT_PATH_INVALID",
  );
  if (inputPath === outputPath) fail("EVA_IDLE_CANDIDATE_BATCH_PATH_ALIAS_FORBIDDEN");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result =
    command === "prepare"
      ? await prepareEvaIdleLocalAiCandidateBatch(
          {
            profile: input.profile,
            intake: input.intake,
            completions: input.completions,
          },
          exactTime(input.preparedAt, "EVA_IDLE_CANDIDATE_BATCH_PREPARED_TIME_INVALID"),
        )
      : await applyEvaIdleLocalAiCandidateBatch(
          {
            profile: input.profile,
            intake: input.intake,
            completions: input.completions,
            prepared: input.prepared,
          },
          exactTime(input.appliedAt, "EVA_IDLE_CANDIDATE_BATCH_APPLIED_TIME_INVALID"),
        );
  await writeExclusive(outputPath, result);
  process.stdout.write(
    `${JSON.stringify({
      status:
        command === "prepare"
          ? "candidate-batch-prepared"
          : "candidate-batch-admitted-for-review",
      schema: result.schema,
      contentDigest: result.contentDigest,
      outputPath: relative(root, outputPath).replaceAll("\\", "/"),
      ledgerRevision:
        command === "apply" ? result.nextLedger.revision : result.applicationInput.ledger.revision,
      nextOwnerRole:
        command === "apply" ? result.summary.nextOwnerRole : "art-studio",
      creativeApprovalGranted: false,
      sequenceAcceptanceGranted: false,
      artifactPromotionGranted: false,
      runtimeActivationGranted: false,
      publicationGranted: false,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      creativeApprovalGranted: false,
      sequenceAcceptanceGranted: false,
      artifactPromotionGranted: false,
      runtimeActivationGranted: false,
      publicationGranted: false,
    })}\n`,
  );
  process.exitCode = 1;
});
