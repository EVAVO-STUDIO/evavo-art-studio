#!/usr/bin/env node

import { lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parseArgs } from "node:util";

import { atomicWriteFile } from "@evavo/art-media";

import { executeDeliveryBatch } from "./batch.js";
import { readDeliveryBatchManifest } from "./manifest.js";
import {
  isDeliveryProfileId,
  listDeliveryImageProfiles,
  resolveDeliveryImageProfile,
} from "./profiles.js";
import { optimizeDeliveryImage } from "./optimizer.js";
import {
  DELIVERY_OPTIMIZER_RECEIPT_SCHEMA,
  DELIVERY_OPTIMIZER_VERSION,
  DeliveryOptimizerError,
  type DeliveryBackgroundPolicy,
} from "./types.js";

const HELP = `EVAVO Art Delivery Optimizer

Commands:
  evavo-art-optimize profiles
  evavo-art-optimize image --input <file> --profile <id> --background <preserve|black|#RRGGBB|luminance-alpha> (--dry-run | --apply --output <file>) [--evidence <json>]
  evavo-art-optimize batch --manifest <json> --source-root <dir> --output-root <new-dir> (--dry-run | --apply)

Production batches are create-only and publish through an atomic new output directory.
Dialogue portraits normally use --background preserve; standing characters, cutout props and UI icons may use black or an explicit matte colour.
Rain, snow, fog, spray and reflection sources painted over black may use --background luminance-alpha to create soft tintable alpha without a hard threshold.
Advanced luminance black point, white point, gamma, colour and inversion controls are available in batch manifests.
`;

function required(value: string | undefined, name: string): string {
  const candidate = value?.trim();
  if (!candidate) {
    throw new DeliveryOptimizerError(
      "DELIVERY_CLI_ARGUMENT_REQUIRED",
      `${name} is required.`,
    );
  }
  return candidate;
}

function exactMode(values: Readonly<Record<string, unknown>>): boolean {
  const apply = values.apply === true;
  const dryRun = values["dry-run"] === true;
  if (apply === dryRun) {
    throw new DeliveryOptimizerError(
      "DELIVERY_CLI_MODE_INVALID",
      "Choose exactly one of --dry-run or --apply.",
    );
  }
  return apply;
}

function background(value: string): DeliveryBackgroundPolicy {
  const normalized = value.trim().toLowerCase();
  if (normalized === "preserve") return { mode: "preserve" };
  if (normalized === "luminance-alpha") {
    return {
      mode: "luminance-alpha",
      blackPoint: 0,
      whitePoint: 255,
      gamma: 1,
      outputColour: "#ffffff",
      invert: false,
    };
  }
  const matteColour = normalized === "black" ? "#000000" : normalized;
  if (!/^#[0-9a-f]{6}$/u.test(matteColour)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_CLI_BACKGROUND_INVALID",
      "--background must be preserve, luminance-alpha, black or #RRGGBB.",
    );
  }
  return {
    mode: "remove-border-matte",
    matteColour,
    connectionDistance: matteColour === "#000000" ? 24 : 140,
    opaqueSeedDistance: matteColour === "#000000" ? 64 : 220,
    edgeSearchRadius: 12,
    bleedRadius: 2,
    minimumBorderMatteFraction: 0.65,
  };
}

async function requireAbsent(target: string, label: string): Promise<void> {
  const exists = await lstat(target).catch(() => null);
  if (exists) {
    throw new DeliveryOptimizerError(
      "DELIVERY_CLI_TARGET_EXISTS",
      `${label} already exists: ${target}.`,
    );
  }
}

async function imageCommand(
  values: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const apply = exactMode(values);
  const inputPath = path.resolve(required(values.input as string | undefined, "--input"));
  const profileId = required(values.profile as string | undefined, "--profile");
  if (!isDeliveryProfileId(profileId)) {
    throw new DeliveryOptimizerError(
      "DELIVERY_CLI_PROFILE_UNKNOWN",
      `Unknown delivery profile: ${profileId}.`,
    );
  }
  const policy = background(
    required(values.background as string | undefined, "--background"),
  );
  const input = await readFile(inputPath);
  const result = await optimizeDeliveryImage(input, {
    profileId,
    background: policy,
  });
  if (!apply) {
    return {
      schema: DELIVERY_OPTIMIZER_RECEIPT_SCHEMA,
      optimizerVersion: DELIVERY_OPTIMIZER_VERSION,
      status: "dry-run-ready",
      mutationPerformed: false,
      evidence: result.evidence,
    };
  }

  const outputPath = path.resolve(
    required(values.output as string | undefined, "--output"),
  );
  const expectedExtension = `.${resolveDeliveryImageProfile(profileId).outputFormat}`;
  if (path.extname(outputPath).toLowerCase() !== expectedExtension) {
    throw new DeliveryOptimizerError(
      "DELIVERY_CLI_EXTENSION_MISMATCH",
      `--output must end with ${expectedExtension} for ${profileId}.`,
    );
  }
  const evidenceValue = values.evidence as string | undefined;
  const evidencePath = evidenceValue ? path.resolve(evidenceValue) : null;
  await requireAbsent(outputPath, "Output image");
  if (evidencePath) await requireAbsent(evidencePath, "Evidence file");
  await mkdir(path.dirname(outputPath), { recursive: true });
  if (evidencePath) await mkdir(path.dirname(evidencePath), { recursive: true });
  await atomicWriteFile(outputPath, result.bytes);
  if (evidencePath) {
    await atomicWriteFile(
      evidencePath,
      `${JSON.stringify(result.evidence, null, 2)}\n`,
    );
  }
  return {
    schema: DELIVERY_OPTIMIZER_RECEIPT_SCHEMA,
    optimizerVersion: DELIVERY_OPTIMIZER_VERSION,
    status: "written",
    mutationPerformed: true,
    outputPath,
    evidencePath,
    evidence: result.evidence,
  };
}

async function batchCommand(
  values: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const apply = exactMode(values);
  const manifest = await readDeliveryBatchManifest(
    required(values.manifest as string | undefined, "--manifest"),
  );
  return executeDeliveryBatch({
    manifest,
    sourceRoot: required(
      values["source-root"] as string | undefined,
      "--source-root",
    ),
    outputRoot: required(
      values["output-root"] as string | undefined,
      "--output-root",
    ),
    apply,
  });
}

export async function runDeliveryOptimizerCli(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<unknown> {
  const parsed = parseArgs({
    args: [...arguments_],
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      evidence: { type: "string", short: "e" },
      profile: { type: "string", short: "p" },
      background: { type: "string", short: "b" },
      manifest: { type: "string", short: "m" },
      "source-root": { type: "string" },
      "output-root": { type: "string" },
      apply: { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
  });
  if (parsed.values.help || parsed.positionals.length === 0) {
    return { help: HELP };
  }
  if (parsed.positionals.length !== 1) {
    throw new DeliveryOptimizerError(
      "DELIVERY_CLI_COMMAND_INVALID",
      "Exactly one command is required.",
    );
  }
  const command = parsed.positionals[0]!;
  if (command === "profiles") {
    return {
      schema: "evavo.art-delivery-profile-catalog.v1",
      optimizerVersion: DELIVERY_OPTIMIZER_VERSION,
      profiles: listDeliveryImageProfiles(),
    };
  }
  if (command === "image") return imageCommand(parsed.values);
  if (command === "batch") return batchCommand(parsed.values);
  throw new DeliveryOptimizerError(
    "DELIVERY_CLI_COMMAND_UNKNOWN",
    `Unknown command: ${command}.`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const result = await runDeliveryOptimizerCli();
    if (
      typeof result === "object" &&
      result !== null &&
      "help" in result &&
      typeof result.help === "string"
    ) {
      process.stdout.write(result.help);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error: unknown) {
    const known = error instanceof DeliveryOptimizerError;
    process.stderr.write(
      `${JSON.stringify(
        {
          schema: "evavo.art-delivery-optimization-error.v1",
          status: "failed",
          error: {
            code: known ? error.code : "DELIVERY_UNEXPECTED_FAILURE",
            message: error instanceof Error ? error.message : String(error),
            details: known ? error.details : null,
          },
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  }
}
