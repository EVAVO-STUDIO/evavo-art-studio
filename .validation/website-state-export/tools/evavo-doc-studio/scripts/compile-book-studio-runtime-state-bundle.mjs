import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  compileWebsiteBookStateMigrationBundle,
  writeBookStateMigrationBundleNoClobber,
} from "./book-studio-runtime-state-bundle-core.mjs";

function usage() {
  return [
    "Usage:",
    "  node tools/evavo-doc-studio/scripts/compile-book-studio-runtime-state-bundle.mjs \\",
    "    --spec export-spec.json \\",
    "    --root /private/book-state \\",
    "    --output state-bundle.json",
    "",
    "Environment:",
    "  EVAVO_WEBSITE_COMMIT_SHA  Exact 40-character Website commit bound to the source export.",
    "",
    "The exporter reads only explicitly listed JSON records, follows no symlinks, embeds no raw manuscript or binary payloads, performs no writes to Book state, and creates its output with no-clobber semantics.",
  ].join("\n");
}

function parse(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (["help", "--help", "-h"].includes(entry)) return { help: true, flags };
    if (!entry?.startsWith("--")) throw new Error(`Unexpected argument: ${entry ?? ""}`);
    const key = entry.slice(2);
    if (!key || flags.has(key)) throw new Error(`Duplicate or invalid option: ${entry}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Option ${entry} requires a value.`);
    flags.set(key, value);
    index += 1;
  }
  return { help: false, flags };
}

function required(flags, key) {
  const value = flags.get(key);
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

export async function runBookStateExportCli(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  const { help, flags } = parse(argv);
  if (help || !argv.length) {
    process.stdout.write(`${usage()}\n`);
    return undefined;
  }
  for (const key of flags.keys()) {
    if (!["spec", "root", "output"].includes(key)) {
      throw new Error(`Unsupported option --${key}.`);
    }
  }
  const expectedSourceCommit = environment.EVAVO_WEBSITE_COMMIT_SHA?.trim() ?? "";
  const bundle = await compileWebsiteBookStateMigrationBundle({
    specPath: required(flags, "spec"),
    stateRoot: required(flags, "root"),
    expectedSourceCommit,
  });
  const receipt = await writeBookStateMigrationBundleNoClobber(
    required(flags, "output"),
    bundle,
  );
  const result = {
    status: "compiled",
    contract: bundle.contract,
    bundleId: bundle.bundleId,
    sourceCommit: bundle.sourceCommit,
    expectedItemCount: bundle.expectedItems.length,
    itemCount: bundle.items.length,
    outputPath: receipt.outputPath,
    outputByteLength: receipt.outputByteLength,
    outputSha256: receipt.outputSha256,
    authoritativeWritesPerformed: false,
    canonicalManuscriptMutationPerformed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const directEntry = process.argv[1];
if (directEntry && import.meta.url === pathToFileURL(directEntry).href) {
  runBookStateExportCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
