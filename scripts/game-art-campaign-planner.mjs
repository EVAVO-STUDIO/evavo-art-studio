#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  campaignSummary,
  compileCampaignFile,
  getCampaignBatch,
  serializePlan,
} from "./game-art-campaign/compiler.mjs";
import { canonicalJson, writeTextFilesCreateOnly } from "./game-art-campaign/common.mjs";
import { campaignMarkdown } from "./game-art-campaign/markdown.mjs";

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
}

function usage() {
  return [
    "usage:",
    "  game-art-campaign-planner.mjs compile --request <request.json> [--output <plan.json>] [--markdown <plan.md>]",
    "  game-art-campaign-planner.mjs summary --request <request.json>",
    "  game-art-campaign-planner.mjs batch --request <request.json> --game <game-id> --batch <1-based-number>",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  const requestPath = argument(argv, "--request");
  if (!command || !requestPath) throw new Error(usage());
  const plan = await compileCampaignFile(requestPath);
  if (command === "compile") {
    const output = argument(argv, "--output");
    const markdown = argument(argv, "--markdown");
    const outputs = [
      ...(output ? [{ filePath: output, text: serializePlan(plan) }] : []),
      ...(markdown ? [{ filePath: markdown, text: campaignMarkdown(plan) }] : []),
    ];
    if (outputs.length) await writeTextFilesCreateOnly(outputs);
    process.stdout.write(canonicalJson({
      status: "passed",
      campaignId: plan.campaignId,
      planSha256: plan.planSha256,
      totals: plan.totals,
      output: output ? path.resolve(output) : null,
      markdown: markdown ? path.resolve(markdown) : null,
      providerExecution: false,
      targetRepositoryMutation: false,
      gitPush: false,
    }));
    return;
  }
  if (command === "summary") {
    process.stdout.write(canonicalJson(campaignSummary(plan)));
    return;
  }
  if (command === "batch") {
    const game = argument(argv, "--game");
    const batch = Number.parseInt(argument(argv, "--batch") ?? "", 10);
    if (!game || !Number.isInteger(batch)) throw new Error(usage());
    process.stdout.write(canonicalJson(getCampaignBatch(plan, game, batch)));
    return;
  }
  throw new Error(usage());
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
