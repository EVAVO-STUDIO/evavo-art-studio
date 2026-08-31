#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  ANIMATION_EXECUTION_ADAPTER_CATALOGUE_SCHEMA,
  ANIMATION_EXECUTION_CYCLE_SCHEMA,
  ANIMATION_EXECUTION_EVENT_SCHEMA,
  ANIMATION_EXECUTION_REQUEST_SCHEMA,
  ANIMATION_EXECUTION_REVIEW_PACKET_SCHEMA,
  ANIMATION_EXECUTION_STATE_SCHEMA,
  ANIMATION_EXECUTION_SUPERVISOR_PROTOCOL_VERSION,
  animationExecutionSha256,
  animationExecutionSupervisorAuthority,
  assertAnimationExecutionAdapterCatalogueIntegrity,
  assertAnimationExecutionRequestIntegrity,
  compileAnimationExecutionReviewPacket,
  describeAnimationExecutionSupervisor,
  getAnimationExecutionStatus,
  initializeAnimationExecutionWorkspace,
  inspectAnimationCandidatePng,
  installAnimationSequenceCreativeApproval,
  planAnimationExecutionCycle,
  runAnimationExecutionCycle,
  sealAnimationExecutionAdapterCatalogue,
  sealAnimationExecutionRequest,
  verifyAnimationExecutionWorkspace,
} from "./animation_execution_supervisor_v1_internal.mjs";

export {
  ANIMATION_EXECUTION_ADAPTER_CATALOGUE_SCHEMA,
  ANIMATION_EXECUTION_CYCLE_SCHEMA,
  ANIMATION_EXECUTION_EVENT_SCHEMA,
  ANIMATION_EXECUTION_REQUEST_SCHEMA,
  ANIMATION_EXECUTION_REVIEW_PACKET_SCHEMA,
  ANIMATION_EXECUTION_STATE_SCHEMA,
  ANIMATION_EXECUTION_SUPERVISOR_PROTOCOL_VERSION,
  animationExecutionSha256,
  animationExecutionSupervisorAuthority,
  assertAnimationExecutionAdapterCatalogueIntegrity,
  assertAnimationExecutionRequestIntegrity,
  compileAnimationExecutionReviewPacket,
  describeAnimationExecutionSupervisor,
  getAnimationExecutionStatus,
  initializeAnimationExecutionWorkspace,
  inspectAnimationCandidatePng,
  installAnimationSequenceCreativeApproval,
  planAnimationExecutionCycle,
  runAnimationExecutionCycle,
  sealAnimationExecutionAdapterCatalogue,
  sealAnimationExecutionRequest,
  verifyAnimationExecutionWorkspace,
};

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function safeWorkspacePath(input) {
  if (typeof input !== "string" || !input) fail("ANIMATION_EXECUTION_CLI_PATH_INVALID");
  const root = process.cwd();
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return absolute;
  fail("ANIMATION_EXECUTION_CLI_PATH_OUTSIDE_WORKSPACE", input);
}

async function readJson(inputPath) {
  const bytes = await readFile(safeWorkspacePath(inputPath));
  if (bytes.length > 16 * 1024 * 1024) fail("ANIMATION_EXECUTION_CLI_INPUT_TOO_LARGE");
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("ANIMATION_EXECUTION_CLI_INPUT_JSON_INVALID");
  }
}

async function emit(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) process.stdout.write(body);
  else {
    await writeFile(safeWorkspacePath(outputPath), body, {
      encoding: "utf8",
      flag: "wx",
    });
  }
}

function runtimeOptions(input) {
  return {
    repositoryRoots: input.repositoryRoots,
    environment: process.env,
  };
}

async function cli(argv = process.argv.slice(2)) {
  const [command, inputPath, outputPath] = argv;
  if (
    !command ||
    !inputPath ||
    ![
      "describe",
      "seal-request",
      "seal-catalogue",
      "initialize",
      "plan",
      "run",
      "status",
      "review-packet",
      "verify",
      "approve",
      "inspect-png",
    ].includes(command)
  ) {
    fail(
      "ANIMATION_EXECUTION_CLI_USAGE",
      "node tools/animation_execution_supervisor_v1.mjs <describe|seal-request|seal-catalogue|initialize|plan|run|status|review-packet|verify|approve|inspect-png> <input.json> [output.json]",
    );
  }
  const input = await readJson(inputPath);
  if (command === "describe") return emit(describeAnimationExecutionSupervisor(), outputPath);
  if (command === "seal-request") return emit(sealAnimationExecutionRequest(input), outputPath);
  if (command === "seal-catalogue") {
    return emit(sealAnimationExecutionAdapterCatalogue(input), outputPath);
  }
  if (command === "initialize") {
    return emit(
      await initializeAnimationExecutionWorkspace(input, runtimeOptions(input)),
      outputPath,
    );
  }
  if (command === "plan") {
    return emit(
      await planAnimationExecutionCycle(input, runtimeOptions(input)),
      outputPath,
    );
  }
  if (command === "run") {
    return emit(
      await runAnimationExecutionCycle(input, runtimeOptions(input)),
      outputPath,
    );
  }
  if (command === "status") {
    return emit(
      await getAnimationExecutionStatus(input, runtimeOptions(input)),
      outputPath,
    );
  }
  if (command === "review-packet") {
    return emit(
      await compileAnimationExecutionReviewPacket(
        input,
        runtimeOptions(input),
      ),
      outputPath,
    );
  }
  if (command === "verify") {
    return emit(
      await verifyAnimationExecutionWorkspace(input, runtimeOptions(input)),
      outputPath,
    );
  }
  if (command === "approve") {
    return emit(
      await installAnimationSequenceCreativeApproval(input, runtimeOptions(input)),
      outputPath,
    );
  }
  return emit(
    await inspectAnimationCandidatePng(input.path, input.expected),
    outputPath,
  );
}

if ((process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "") === import.meta.url) {
  cli().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        authority: animationExecutionSupervisorAuthority,
      })}\n`,
    );
    process.exitCode = 1;
  });
}
