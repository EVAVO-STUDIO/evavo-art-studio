#!/usr/bin/env node

import process from "node:process";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ANIMATION_SOURCE_BUNDLE_SCHEMA,
  ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256,
  assertAnimationSourceBundleRelativePath,
} from "./lib/animation-source-bundle.mjs";
import {
  MAX_ANIMATION_SOURCE_CONTROL_BYTES,
  readAnimationSourceControlDocument,
} from "./lib/animation-source-control-document.mjs";
import {
  MAX_ANIMATION_SOURCE_OUTPUT_BYTES,
  writeAnimationSourceJson,
} from "./lib/animation-source-output.mjs";
import {
  SUPPORTED_ANIMATION_SOURCE_IMAGE_MEDIA_TYPES,
  compileAnimationSourceBundleStable,
  verifyAnimationSourceBundleFilesStable,
} from "./lib/animation-source-stable-observation.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/animation-source-bundle.mjs compile <request.json> --root <source-root> --output <manifest.json> [--replace-output] [--max-control-bytes <bytes>] [--max-output-bytes <bytes>]",
    "  node scripts/animation-source-bundle.mjs verify <manifest.json> [--root <source-root>] [--output <receipt.json>] [--replace-output] [--max-control-bytes <bytes>] [--max-output-bytes <bytes>]",
    "  node scripts/animation-source-bundle.mjs manifest",
    "",
    "Control documents are read twice from one ordinary single-link file,",
    "source media is observed from stable open handles, and generated JSON",
    "is create-only unless --replace-output is explicitly supplied.",
  ].join("\n");
}

function parseOptions(values) {
  const options = {};
  const seen = new Set();
  const valued = new Set([
    "--root",
    "--output",
    "--concurrency",
    "--max-control-bytes",
    "--max-output-bytes",
  ]);
  const booleans = new Set(["--replace-output"]);

  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (seen.has(flag)) {
      throw new Error(
        `ANIMATION_SOURCE_BUNDLE_OPTION_DUPLICATE:${flag}`,
      );
    }
    seen.add(flag);

    if (booleans.has(flag)) {
      options[flag.slice(2)] = true;
      continue;
    }
    if (valued.has(flag)) {
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

function parseByteLimit(value, maximum, code) {
  if (value === undefined) return undefined;
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new Error(code);
  }
  const parsed = Number.parseInt(value, 10);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    throw new Error(code);
  }
  return parsed;
}

function sourceAssetPaths(bundle, sourceRoot) {
  return bundle.assets.map((asset) =>
    resolve(
      sourceRoot,
      ...assertAnimationSourceBundleRelativePath(
        asset.relativePath,
      ).split("/"),
    ),
  );
}

async function output(path, value, options = {}) {
  if (path) {
    return await writeAnimationSourceJson(path, value, options);
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return undefined;
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
      version: "1.2.0",
      schema: ANIMATION_SOURCE_BUNDLE_SCHEMA,
      schemaSha256:
        ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256,
      commands: ["compile", "verify", "manifest"],
      producer: "evavo-art-studio",
      consumer: "cel-animation-studio",
      controlDocumentVerification: [
        "bounded-bytes",
        "ordinary-path-components",
        "single-link-file",
        "same-handle-double-read",
        "stable-stat-identity",
        "strict-utf8",
        "json-parse",
      ],
      mediaVerification: [
        "stable-before-after-observation",
        "single-handle-sha256",
        "byte-length",
        "png-ihdr",
        "jpeg-sof",
        "gif-logical-screen",
        "webp-canvas",
      ],
      supportedImageMediaTypes:
        SUPPORTED_ANIMATION_SOURCE_IMAGE_MEDIA_TYPES,
      outputPolicy: {
        default: "create-only",
        explicitReplacementFlag: "--replace-output",
        protectedInputCollision: "forbidden",
        symlinkAndHardlinkDestination: "forbidden",
        atomicPublish: true,
      },
      pathPolicy:
        "portable-relative-no-symlinks-stable-identity",
      sourceCopyRequired: false,
      authority: {
        providerExecution: false,
        renderExecution: false,
        publication: false,
        repositoryMutation: false,
      },
    });
    return;
  }

  if (command !== "compile" && command !== "verify") {
    throw new Error(
      `ANIMATION_SOURCE_BUNDLE_COMMAND_UNKNOWN:${command}`,
    );
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
  const maximumControlBytes = parseByteLimit(
    options["max-control-bytes"],
    MAX_ANIMATION_SOURCE_CONTROL_BYTES,
    "ANIMATION_SOURCE_BUNDLE_MAX_CONTROL_BYTES_INVALID",
  );
  const maximumOutputBytes = parseByteLimit(
    options["max-output-bytes"],
    MAX_ANIMATION_SOURCE_OUTPUT_BYTES,
    "ANIMATION_SOURCE_BUNDLE_MAX_OUTPUT_BYTES_INVALID",
  );
  if (command === "compile" && (!options.root || !options.output)) {
    throw new Error(
      "ANIMATION_SOURCE_BUNDLE_COMPILE_REQUIRES_ROOT_AND_OUTPUT",
    );
  }
  if (
    command === "verify" &&
    options["replace-output"] === true &&
    !options.output
  ) {
    throw new Error(
      "ANIMATION_SOURCE_BUNDLE_REPLACE_REQUIRES_OUTPUT",
    );
  }
  if (
    command === "verify" &&
    options["max-output-bytes"] !== undefined &&
    !options.output
  ) {
    throw new Error(
      "ANIMATION_SOURCE_BUNDLE_MAX_OUTPUT_REQUIRES_OUTPUT",
    );
  }

  const control =
    await readAnimationSourceControlDocument(subject, {
      maximumBytes: maximumControlBytes,
    });

  if (command === "compile") {
    const bundle = await compileAnimationSourceBundleStable(
      control.value,
      options.root,
      { concurrency },
    );
    const outputEvidence = await writeAnimationSourceJson(
      options.output,
      bundle,
      {
        replace: options["replace-output"] === true,
        maximumBytes: maximumOutputBytes,
        protectedPaths: [
          control.evidence.path,
          ...sourceAssetPaths(bundle, options.root),
        ],
      },
    );
    await output(undefined, {
      operation: "compile",
      output: resolve(options.output),
      outputEvidence,
      controlDocumentEvidence: control.evidence,
      bundleDigest: bundle.bundleDigest,
      approvalState: bundle.approval.state,
      assetCount: bundle.assets.length,
      stableSourceObservation: true,
    });
    return;
  }

  if (command === "verify") {
    const sourceRoot = options.root
      ? resolve(options.root)
      : dirname(resolve(subject));
    const receipt =
      await verifyAnimationSourceBundleFilesStable(
        control.value,
        sourceRoot,
        { concurrency },
      );
    const outputEvidence = await output(
      options.output,
      receipt,
      options.output
        ? {
            replace: options["replace-output"] === true,
            maximumBytes: maximumOutputBytes,
            protectedPaths: [
              control.evidence.path,
              ...sourceAssetPaths(control.value, sourceRoot),
            ],
          }
        : {},
    );
    if (options.output) {
      process.stdout.write(
        `${JSON.stringify({
          operation: "verify",
          output: resolve(options.output),
          outputEvidence,
          controlDocumentEvidence: control.evidence,
          bundleDigest: receipt.bundleDigest,
          assetCount: receipt.assetCount,
          stableSourceObservation: true,
        }, null, 2)}\n`,
      );
    }
    return;
  }

  throw new Error(
    `ANIMATION_SOURCE_BUNDLE_COMMAND_UNREACHABLE:${command}`,
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
