#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  compileDelivery,
  prepareRequestFile,
  validateDelivery,
} from "./game-asset-delivery/compiler.mjs";

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${token}.`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) values[key] = true;
    else {
      values[key] = next;
      index += 1;
    }
  }
  return values;
}

const usage = [
  "usage:",
  "  compile-game-asset-delivery.mjs prepare --draft <draft.json> --output <request.json>",
  "  compile-game-asset-delivery.mjs compile --request <request.json> --output <bundle.json>",
  "  compile-game-asset-delivery.mjs validate --bundle <bundle.json>",
].join("\n");

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const args = parse(rest);
  if (command === "prepare") {
    if (!args.draft || !args.output) throw new Error(usage);
    const request = await prepareRequestFile({ draftPath: args.draft, outputPath: args.output });
    process.stdout.write(`${JSON.stringify({ status: "prepared", requestSha256: request.requestSha256, runId: request.runId, output: path.resolve(args.output) })}\n`);
    return;
  }
  if (command === "compile") {
    if (!args.request || !args.output) throw new Error(usage);
    const bundle = await compileDelivery({ requestPath: args.request, outputPath: args.output });
    process.stdout.write(`${JSON.stringify({ status: bundle.status, bundleSha256: bundle.bundleSha256, runId: bundle.runId, itemCount: bundle.items.length, output: path.resolve(args.output) })}\n`);
    process.exitCode = bundle.status === "approved" ? 0 : 3;
    return;
  }
  if (command === "validate") {
    if (!args.bundle) throw new Error(usage);
    const result = await validateDelivery({ bundlePath: args.bundle });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error(usage);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
