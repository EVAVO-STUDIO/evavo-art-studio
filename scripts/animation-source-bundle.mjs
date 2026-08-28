#!/usr/bin/env node

import process from "node:process";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ANIMATION_SOURCE_BUNDLE_SCHEMA,
  ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256,
  compileAnimationSourceBundle,
  readJson,
  verifyAnimationSourceBundleFiles,
  writeJsonAtomic,
} from "./lib/animation-source-bundle.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/animation-source-bundle.mjs compile <request.json> --root <source-root> --output <manifest.json>",
    "  node scripts/animation-source-bundle.mjs verify <manifest.json> [--root <source-root>] [--output <receipt.json>]",
    "  node scripts/animation-source-bundle.mjs manifest",
    "",
    "Compilation measures source bytes, probes PNG dimensions, binds approval",
    "to the canonical digest, and writes the manifest atomically.",
  ].join("\n");
}

function parseOptions(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (
      flag === "--root" ||
      flag === "--output" ||
      flag === "--concurrency"
    ) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(
          `ANIMATION_SOURCE_BUNDLE_OPTION_VALUE_REQUIRED:${flag}`,
        );
      }
      options[flag.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(
      `ANIMATION_SOURCE_BUNDLE_OPTION_UNKNOWN:${flag}`,
    );
  }
  return options;
}

function parseConcurrency(value) {
  if (value === undefined) return 4;
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new Error(
      "ANIMATION_SOURCE_BUNDLE_CONCURRENCY_INVALID",
    );
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed > 16) {
    throw new Error(
      "ANIMATION_SOURCE_BUNDLE_CONCURRENCY_INVALID",
    );
  }
  return parsed;
}

async function output(path, value) {
  if (path) await writeJsonAtomic(path, value);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runAnimationSourceBundleCli(args) {
  const [command, subject, ...rest] = args;
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (command === "manifest") {
    if (subject !== undefined) {
      throw new Error(
        "ANIMATION_SOURCE_BUNDLE_MANIFEST_ARGUMENT_UNEXPECTED",
      );
    }
    await output(undefined, {
      service:
        "evavo-art-studio-animation-source-bundle",
      version: "1.0.0",
      schema: ANIMATION_SOURCE_BUNDLE_SCHEMA,
      schemaSha256:
        ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256,
      commands: ["compile", "verify", "manifest"],
      producer: "evavo-art-studio",
      consumer: "cel-animation-studio",
      mediaVerification: [
        "sha256",
        "byte-length",
        "png-ihdr",
      ],
      pathPolicy: "portable-relative-no-symlinks",
      authority: {
        providerExecution: false,
        renderExecution: false,
        publication: false,
        repositoryMutation: false,
      },
    });
    return;
  }

  if (!subject) {
    throw new Error(
      `ANIMATION_SOURCE_BUNDLE_SUBJECT_REQUIRED:${command}`,
    );
  }
  const options = parseOptions(rest);
  const concurrency = parseConcurrency(
    options.concurrency,
  );

  if (command === "compile") {
    if (!options.root || !options.output) {
      throw new Error(
        "ANIMATION_SOURCE_BUNDLE_COMPILE_REQUIRES_ROOT_AND_OUTPUT",
      );
    }
    const request = await readJson(subject);
    const bundle = await compileAnimationSourceBundle(
      request,
      options.root,
      { concurrency },
    );
    await writeJsonAtomic(options.output, bundle);
    await output(undefined, {
      operation: "compile",
      output: resolve(options.output),
      bundleDigest: bundle.bundleDigest,
      approvalState: bundle.approval.state,
      assetCount: bundle.assets.length,
    });
    return;
  }

  if (command === "verify") {
    const bundle = await readJson(subject);
    const sourceRoot = options.root
      ? resolve(options.root)
      : dirname(resolve(subject));
    const receipt =
      await verifyAnimationSourceBundleFiles(
        bundle,
        sourceRoot,
        { concurrency },
      );
    await output(options.output, receipt);
    return;
  }

  throw new Error(
    `ANIMATION_SOURCE_BUNDLE_COMMAND_UNKNOWN:${command}`,
  );
}

const entryPath = process.argv[1];
if (
  entryPath &&
  import.meta.url === pathToFileURL(entryPath).href
) {
  runAnimationSourceBundleCli(
    process.argv.slice(2),
  ).catch((error) => {
    const message =
      error instanceof Error
        ? error.message
        : "ANIMATION_SOURCE_BUNDLE_CLI_FAILED";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
