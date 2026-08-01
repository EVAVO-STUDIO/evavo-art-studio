#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

import { executeAudioBatch } from "./batch.js";
import { readAudioBatchManifest } from "./manifest.js";
import { optimizeAudioDelivery } from "./optimizer.js";
import {
  isAudioDeliveryProfileId,
  listAudioDeliveryProfiles,
  resolveAudioDeliveryProfile,
} from "./profiles.js";
import {
  AUDIO_DELIVERY_RECEIPT_SCHEMA,
  AUDIO_DELIVERY_VERSION,
  AUDIO_PROFILE_CATALOG_VERSION,
  AudioDeliveryError,
} from "./types.js";

const HELP = `EVAVO Art Audio Delivery\n\n` +
  `Commands:\n` +
  `  evavo-art-audio profiles\n` +
  `  evavo-art-audio audio --input <file> --profile <id> [--loop] [--loop-begin-samples <n>] (--dry-run | --apply --output <file>) [--evidence <json>]\n` +
  `  evavo-art-audio batch --manifest <json> --source-root <dir> --output-root <new-dir> (--dry-run | --apply)\n`;

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new AudioDeliveryError(
      "AUDIO_CLI_ARGUMENT_REQUIRED",
      `${name} is required.`,
    );
  }
  return value;
}

function exactMode(values: Readonly<Record<string, unknown>>): boolean {
  const apply = values.apply === true;
  const dryRun = values["dry-run"] === true;
  if (apply === dryRun) {
    throw new AudioDeliveryError(
      "AUDIO_CLI_MODE_INVALID",
      "Choose exactly one of --dry-run or --apply.",
    );
  }
  return apply;
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      evidence: { type: "string", short: "e" },
      profile: { type: "string", short: "p" },
      loop: { type: "boolean" },
      "loop-begin-samples": { type: "string" },
      manifest: { type: "string", short: "m" },
      "source-root": { type: "string" },
      "output-root": { type: "string" },
      apply: { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
  });
  if (parsed.values.help || parsed.positionals.length === 0) {
    process.stdout.write(HELP);
    return;
  }
  if (parsed.positionals.length !== 1) {
    throw new AudioDeliveryError(
      "AUDIO_CLI_COMMAND_INVALID",
      "Exactly one command is required.",
    );
  }
  const command = parsed.positionals[0]!;
  if (command === "profiles") {
    console.log(
      JSON.stringify(
        {
          schema: "evavo.art-audio-delivery-profile-catalog.v1",
          optimizerVersion: AUDIO_DELIVERY_VERSION,
          profileCatalogVersion: AUDIO_PROFILE_CATALOG_VERSION,
          profiles: listAudioDeliveryProfiles(),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "audio") {
    const apply = exactMode(parsed.values);
    const profileId = required(parsed.values.profile, "--profile");
    if (!isAudioDeliveryProfileId(profileId)) {
      throw new AudioDeliveryError(
        "AUDIO_CLI_PROFILE_UNKNOWN",
        `Unknown profile: ${profileId}.`,
      );
    }
    const begin = parsed.values["loop-begin-samples"];
    const loop = {
      enabled: parsed.values.loop === true,
      ...(begin === undefined
        ? {}
        : { beginSamples: Number.parseInt(begin, 10) }),
    };
    const inputPath = path.resolve(required(parsed.values.input, "--input"));
    const result = await optimizeAudioDelivery(fs.readFileSync(inputPath), {
      profileId,
      loop,
    });
    if (!apply) {
      console.log(
        JSON.stringify(
          {
            schema: AUDIO_DELIVERY_RECEIPT_SCHEMA,
            status: "dry-run-ready",
            mutationPerformed: false,
            evidence: result.evidence,
          },
          null,
          2,
        ),
      );
      return;
    }
    const outputPath = path.resolve(
      required(parsed.values.output, "--output"),
    );
    const expectedExtension = `.${resolveAudioDeliveryProfile(profileId).outputFormat}`;
    if (path.extname(outputPath).toLowerCase() !== expectedExtension) {
      throw new AudioDeliveryError(
        "AUDIO_CLI_EXTENSION_MISMATCH",
        `--output must end with ${expectedExtension}.`,
      );
    }
    if (fs.lstatSync(outputPath, { throwIfNoEntry: false })) {
      throw new AudioDeliveryError(
        "AUDIO_CLI_OUTPUT_EXISTS",
        `Output already exists: ${outputPath}.`,
      );
    }
    const evidencePath = parsed.values.evidence
      ? path.resolve(parsed.values.evidence)
      : null;
    if (evidencePath && fs.lstatSync(evidencePath, { throwIfNoEntry: false })) {
      throw new AudioDeliveryError(
        "AUDIO_CLI_OUTPUT_EXISTS",
        `Evidence already exists: ${evidencePath}.`,
      );
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, result.bytes, { flag: "wx" });
    if (evidencePath) {
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(
        evidencePath,
        `${JSON.stringify(result.evidence, null, 2)}\n`,
        { flag: "wx" },
      );
    }
    console.log(
      JSON.stringify(
        {
          schema: AUDIO_DELIVERY_RECEIPT_SCHEMA,
          status: "written",
          mutationPerformed: true,
          outputPath,
          evidencePath,
          evidence: result.evidence,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "batch") {
    const apply = exactMode(parsed.values);
    const receipt = await executeAudioBatch({
      manifest: readAudioBatchManifest(
        required(parsed.values.manifest, "--manifest"),
      ),
      sourceRoot: required(parsed.values["source-root"], "--source-root"),
      outputRoot: required(parsed.values["output-root"], "--output-root"),
      apply,
    });
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }
  throw new AudioDeliveryError(
    "AUDIO_CLI_COMMAND_UNKNOWN",
    `Unknown command: ${command}.`,
  );
}

try {
  await main();
} catch (error: unknown) {
  const known = error instanceof AudioDeliveryError;
  process.stderr.write(
    `${JSON.stringify(
      {
        schema: "evavo.art-audio-delivery-error.v1",
        status: "failed",
        error: {
          code: known ? error.code : "AUDIO_UNEXPECTED_FAILURE",
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
