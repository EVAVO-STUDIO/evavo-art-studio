#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildFamily,
  planFamily,
  validateFamily,
} from "./pixel-font/builder.mjs";
import { writeJsonCreateOnly } from "./pixel-font/common.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const requestPath = path.join(
  repositoryRoot,
  "config",
  "pixel-font-family.brass-brine.v1.json",
);

function parse(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${token}.`);
    const key = token.slice(2);
    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate --${key}.`);
    result[key] = value;
    index += 1;
  }
  return result;
}

async function main() {
  const args = parse(process.argv.slice(2));
  if (!args.output) {
    throw new Error(
      "Usage: node scripts/build-brass-brine-pixel-font-family.mjs --output <empty-output-root> [--plan-output <plan.json>]",
    );
  }
  const outputRoot = path.resolve(args.output);
  const planOutput = path.resolve(
    args["plan-output"] ?? `${outputRoot}.plan.json`,
  );
  const plan = await planFamily({ requestPath, outputRoot });
  await writeJsonCreateOnly(planOutput, plan, path.dirname(planOutput));
  const result = await buildFamily({
    requestPath,
    outputRoot,
    planPath: planOutput,
  });
  const validation = await validateFamily({ familyPath: result.familyPath });
  if (validation.status !== "passed") {
    throw new Error(
      `Brass & Brine pixel-font family is blocked: ${validation.blockers.join(", ")}`,
    );
  }
  process.stdout.write(
    `${JSON.stringify({
      status: "passed",
      familyId: result.family.familyId,
      familySha256: result.family.familySha256,
      validationSha256: validation.validationSha256,
      receiptSha256: result.receipt.receiptSha256,
      planPath: planOutput,
      familyPath: result.familyPath,
      outputRoot,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
});
