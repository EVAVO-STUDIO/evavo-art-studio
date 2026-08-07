#!/usr/bin/env node
import { parseArgs } from "node:util";

import {
  LEGACY_BOOK_ART_READINESS_FILE_CONTRACT,
  LegacyBookArtReadinessFileCommandError,
  runLegacyBookArtReadinessFileCommand,
} from "./book-art-legacy-readiness-file-command.js";

const help = `EVAVO legacy Book Art readiness batch

Usage:
  evavo-book-art-legacy-readiness-batch \\
    --input C:\\Private\\BookMigration\\legacy-art-readiness.json \\
    --source-root C:\\Private\\BookMigration\\legacy-art \\
    --receipt C:\\Private\\BookMigration\\legacy-art-readiness-receipt.json

The command reads only explicitly listed relative source files, creates the
receipt with exclusive no-clobber semantics, calls no network service, writes no
Art Studio artifact, and performs no selection, promotion, Book-use binding,
canonical-writer change, cutover, retailer upload, or publication.
`;

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: "string", short: "i" },
      "source-root": { type: "string", short: "r" },
      receipt: { type: "string", short: "o" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
    strict: true,
  });

  if (parsed.values.help) {
    process.stdout.write(help);
    return;
  }

  const result = await runLegacyBookArtReadinessFileCommand({
    inputPath: required(parsed.values.input, "--input"),
    sourceRoot: required(parsed.values["source-root"], "--source-root"),
    receiptPath: required(parsed.values.receipt, "--receipt"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "blocked") process.exitCode = 2;
}

function required(value: string | undefined, option: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new LegacyBookArtReadinessFileCommandError(
      `${option.replace(/^--/u, "").replace(/-/gu, "_").toUpperCase()}_REQUIRED`,
    );
  }
  return normalized;
}

main().catch((error: unknown) => {
  const errorCode = error instanceof LegacyBookArtReadinessFileCommandError
    ? error.code
    : "LEGACY_BOOK_ART_READINESS_FILE_COMMAND_FAILED";
  process.stderr.write(`${JSON.stringify({
    outputKind: "evavo_legacy_book_art_dry_run_readiness_batch_file_command_error",
    schemaVersion: 1,
    contract: LEGACY_BOOK_ART_READINESS_FILE_CONTRACT,
    status: "error",
    errorCode,
    localReceiptFileWritten: false,
    networkCallPerformed: false,
    sourceArtifactWriteAttempted: false,
    evidenceArtifactWriteAttempted: false,
    providerCallPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    canonicalWriterChanged: false,
    runtimeCutoverApproved: false,
    retailerUploadPerformed: false,
    publicationPerformed: false,
  }, null, 2)}\n`);
  process.exitCode = 1;
});
