#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  compileGameArtProductionProject,
  compileGameArtProductionWorkOrder,
  verifyGameArtProductionProfiles,
} from "./index.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function usage() {
  return [
    "EVAVO game-art production profiles",
    "",
    "Usage:",
    "  node scripts/game-art-production/profile-cli.mjs verify",
    "  node scripts/game-art-production/profile-cli.mjs project <project-id>",
    "  node scripts/game-art-production/profile-cli.mjs work-order <project-id> <asset-type-id> <unit-id> --subject <subject-id> --group <production-group> --intent <text> [--tokens-json <file>] [--references-json <file>]",
    "",
    "Profiles define reusable game-type production grammar. Project bindings provide game identity, subjects, paths and bounded overrides. These commands compile evidence only; they do not execute providers, approve assets, mutate target repositories, commit, deploy or publish.",
  ].join("\n");
}

async function jsonFile(filePath, label) {
  if (!filePath) return {};
  try {
    return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function runGameArtProductionProfileCli(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyGameArtProductionProfiles();
  if (command === "project") {
    if (!argv[1]) throw new Error(`project requires <project-id>.\n\n${usage()}`);
    return compileGameArtProductionProject(argv[1]);
  }
  if (command === "work-order") {
    const [projectId, assetTypeId, unitId] = argv.slice(1, 4);
    const subjectId = option(argv, "--subject");
    const productionGroup = option(argv, "--group");
    const creativeIntent = option(argv, "--intent");
    if (!projectId || !assetTypeId || !unitId || !subjectId || !productionGroup || !creativeIntent) {
      throw new Error(`work-order requires project, asset type, unit, --subject, --group and --intent.\n\n${usage()}`);
    }
    return compileGameArtProductionWorkOrder({
      projectId,
      assetTypeId,
      unitId,
      subjectId,
      productionGroup,
      creativeIntent,
      tokens: await jsonFile(option(argv, "--tokens-json"), "--tokens-json"),
      referenceBindings: await jsonFile(option(argv, "--references-json"), "--references-json"),
    });
  }
  throw new Error(`Unknown command ${command}.\n\n${usage()}`);
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  runGameArtProductionProfileCli().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result?.status === "failed") process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
