#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  ArtWorkspaceWriterError,
  applyArtWorkspaceFilePlan,
  archiveArtWorkspaceFileToStorage,
  artWorkspaceWriterCapabilities,
  artWorkspaceWriterPolicyFromEnvironment,
  compileArtWorkspaceFilePlan,
  intakeArtWorkspaceFiles,
  readArtWorkspaceMediaPreview,
} from "@evavo/art-repo-inspector/workspace-writer";

const help = `EVAVO Art Studio workspace writer

Usage:
  evavo-art-workspace capabilities [--output capabilities.json]
  evavo-art-workspace preview --input preview.json [--output preview.json]
  evavo-art-workspace intake --input intake.json [--output receipt.json]
  evavo-art-workspace plan --input operations.json [--output plan.json]
  evavo-art-workspace apply --input plan.json [--output receipt.json]
  evavo-art-workspace archive --input storage.json [--output receipt.json]

The writer is root-scoped, hash-bound, no-overwrite and publication-free.
Mutations require EVAVO_ART_ALLOW_WRITES=true. EVAVO Storage handoff also
requires EVAVO_ART_ALLOW_STORAGE_WRITES=true and a fixed
EVAVO_STORAGE_OPERATOR_COMMAND_JSON server-side command array.
`;

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function emit(value: unknown, output?: string): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (output) await writeFile(output, content, "utf8");
  else process.stdout.write(content);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!command || parsed.values.help) {
    process.stdout.write(help);
    return;
  }
  const policy = artWorkspaceWriterPolicyFromEnvironment();
  if (command === "capabilities") {
    await emit(artWorkspaceWriterCapabilities(policy), parsed.values.output);
    return;
  }
  if (!parsed.values.input) {
    throw new ArtWorkspaceWriterError(
      "ART_WORKSPACE_CLI_INPUT_REQUIRED",
      `--input is required for ${command}.`,
    );
  }
  const input = await readJson(parsed.values.input);
  if (command === "preview") {
    await emit(await readArtWorkspaceMediaPreview(input, policy), parsed.values.output);
    return;
  }
  if (command === "intake") {
    await emit(await intakeArtWorkspaceFiles(input, policy), parsed.values.output);
    return;
  }
  if (command === "plan") {
    await emit(await compileArtWorkspaceFilePlan(input, policy), parsed.values.output);
    return;
  }
  if (command === "apply") {
    await emit(await applyArtWorkspaceFilePlan(input, policy), parsed.values.output);
    return;
  }
  if (command === "archive") {
    await emit(await archiveArtWorkspaceFileToStorage(input, policy), parsed.values.output);
    return;
  }
  throw new ArtWorkspaceWriterError(
    "ART_WORKSPACE_CLI_COMMAND_INVALID",
    `Unknown command: ${command}.`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        code:
          error instanceof ArtWorkspaceWriterError
            ? error.code
            : "ART_WORKSPACE_CLI_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
