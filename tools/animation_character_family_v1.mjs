#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import * as family from "./animation_character_family_v1_internal.mjs";

export * from "./animation_character_family_v1_internal.mjs";

const MAX_JSON_BYTES = 8 * 1024 * 1024;

function fail(code, detail = "") {
  throw new Error(detail ? `${code}:${detail}` : code);
}

async function readJson(path) {
  const bytes = await readFile(resolve(path));
  if (bytes.length > MAX_JSON_BYTES) {
    fail("ANIMATION_CHARACTER_FAMILY_CLI_INPUT_TOO_LARGE");
  }
  return JSON.parse(bytes.toString("utf8"));
}

async function cli(argv = process.argv.slice(2)) {
  const [command, inputPath] = argv;
  if (command === "describe") {
    process.stdout.write(
      `${JSON.stringify(family.describeAnimationCharacterFamilyV1(), null, 2)}\n`,
    );
    return;
  }
  if (!inputPath) fail("ANIMATION_CHARACTER_FAMILY_CLI_INPUT_REQUIRED");
  const input = await readJson(inputPath);
  const result =
    command === "compile-plan"
      ? family.compileAnimationCharacterFamilyPlan(input)
      : command === "verify-plan"
        ? family.assertAnimationCharacterFamilyPlanIntegrity(input)
        : command === "verify-clip"
          ? family.assertAnimationCharacterFamilyClipEvidenceIntegrity(input)
          : command === "compile-status"
            ? family.compileAnimationCharacterFamilyStatus(input)
            : command === "compile-review-input"
              ? family.compileAnimationCharacterFamilyReviewInput(input)
              : command === "compile-review-receipt"
                ? family.compileAnimationCharacterFamilyReviewReceipt(input)
                : command === "verify-review-receipt"
                  ? family.assertAnimationCharacterFamilyReviewReceiptIntegrity(
                      input.receipt ?? input,
                      input.reviewInput,
                    )
                  : command === "compile-runtime-plan"
                    ? family.compileAnimationCharacterFamilyRuntimePlan(input)
                    : command === "verify-runtime-plan"
                      ? family.assertAnimationCharacterFamilyRuntimePlanIntegrity(input)
                      : fail(
                          "ANIMATION_CHARACTER_FAMILY_CLI_COMMAND_INVALID",
                          String(command),
                        );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (
  (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "") ===
  import.meta.url
) {
  cli().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        authority: family.animationCharacterFamilyAuthority,
      })}\n`,
    );
    process.exitCode = 1;
  });
}
