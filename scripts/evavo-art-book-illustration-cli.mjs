#!/usr/bin/env node
import { open } from "node:fs/promises";
import path from "node:path";

import {
  BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT,
  BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION,
  compileBookIllustrationGenerationDispatch,
  compileBookIllustrationIntelligencePlan,
  evaluateBookIllustrationCandidate,
  evaluateBookIllustrationVisualConsensus,
  listBookIllustrationIntelligenceCapabilities,
  validateBookIllustrationIntelligencePlan,
} from "../packages/contracts/dist/book-illustration-intelligence.js";

const COMMANDS = new Set([
  "capabilities",
  "compile-plan",
  "compile-generation-dispatch",
  "validate-plan",
  "evaluate-candidate",
  "evaluate-visual-consensus",
]);

const MAXIMUM_INPUT_BYTES = 16 * 1024 * 1024;

function usage(lines) {
  return `${lines.join("\n")}\n`;
}

function parseArguments(argv, commands) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    return { help: true };
  }
  if (!commands.has(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (name !== "--input" && name !== "--output") {
      throw new Error(`Unknown option: ${name}`);
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value.`);
    }
    const key = name.slice(2);
    if (Object.hasOwn(options, key)) {
      throw new Error(`${name} may be supplied only once.`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

async function readJsonInput(filePath) {
  if (!filePath) throw new Error("--input is required for this command.");
  const resolved = path.resolve(filePath);
  const file = await open(resolved, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error("Input path must identify one regular file.");
    if (stat.size > MAXIMUM_INPUT_BYTES) {
      throw new Error(`Input exceeds ${MAXIMUM_INPUT_BYTES} bytes.`);
    }
    const bytes = await file.readFile();
    return JSON.parse(bytes.toString("utf8"));
  } finally {
    await file.close();
  }
}

async function writeResult(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(body);
    return;
  }
  const resolved = path.resolve(outputPath);
  const file = await open(resolved, "wx", 0o600);
  try {
    await file.writeFile(body, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
}

function failure(error) {
  const body = {
    error: {
      code:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "BOOK_VISUAL_CLI_ERROR",
      message: error instanceof Error ? error.message : String(error),
    },
  };
  process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
  process.exitCode = 1;
}


async function main() {
  const options = parseArguments(process.argv.slice(2), COMMANDS);
  if (options.help) {
    process.stdout.write(
      usage([
        "EVAVO Art Studio Book illustration-intelligence CLI",
        "",
        "Usage:",
        "  evavo-art-book-illustration-cli.mjs capabilities [--output FILE]",
        "  evavo-art-book-illustration-cli.mjs compile-plan --input FILE [--output FILE]",
        "  evavo-art-book-illustration-cli.mjs compile-generation-dispatch --input FILE [--output FILE]",
        "  evavo-art-book-illustration-cli.mjs validate-plan --input FILE [--output FILE]",
        "  evavo-art-book-illustration-cli.mjs evaluate-candidate --input FILE [--output FILE]",
        "  evavo-art-book-illustration-cli.mjs evaluate-visual-consensus --input FILE [--output FILE]",
        "",
        "Output files are created exclusively and are never overwritten.",
      ]),
    );
    return;
  }
  let result;
  let exitCode = 0;
  if (options.command === "capabilities") {
    if (options.input) throw new Error("capabilities does not accept --input.");
    result = listBookIllustrationIntelligenceCapabilities();
  } else if (options.command === "compile-plan") {
    result = compileBookIllustrationIntelligencePlan(
      await readJsonInput(options.input),
    );
    if (result.status !== "ready") exitCode = 2;
  } else if (options.command === "compile-generation-dispatch") {
    result = compileBookIllustrationGenerationDispatch(
      await readJsonInput(options.input),
    );
    if (result.status !== "ready") exitCode = 2;
  } else if (options.command === "validate-plan") {
    const issues = validateBookIllustrationIntelligencePlan(
      await readJsonInput(options.input),
    );
    result = {
      outputKind: "evavo_art_book_illustration_plan_validation",
      schemaVersion: BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION,
      contract: BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT,
      valid: issues.length === 0,
      issues,
      providerCallPerformed: false,
      selectionPerformed: false,
      promotionPerformed: false,
      publicationPerformed: false,
    };
    if (issues.length) exitCode = 2;
  } else if (options.command === "evaluate-candidate") {
    result = evaluateBookIllustrationCandidate(await readJsonInput(options.input));
    if (result.status !== "ready_for_independent_review") exitCode = 2;
  } else {
    result = evaluateBookIllustrationVisualConsensus(
      await readJsonInput(options.input),
    );
    if (result.status !== "ready_for_governed_selection") exitCode = 2;
  }
  await writeResult(result, options.output);
  process.exitCode = exitCode;
}

main().catch(failure);
