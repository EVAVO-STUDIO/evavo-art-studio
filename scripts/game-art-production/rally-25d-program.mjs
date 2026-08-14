#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { assert } from "./rally-25d-program-common.mjs";
import { compileRally25DArtProgram, verifyRally25DArtProgram } from "./rally-25d-program-core.mjs";

export { canonicalJson, sha256 } from "./rally-25d-program-common.mjs";
export { validateRally25DArtProgramRequest } from "./rally-25d-program-request.mjs";
export { compileRally25DArtProgram, verifyRally25DArtProgram };

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2); const outputIndex = rest.indexOf("--output"); const outputPath = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  assert(command === "compile" || command === "verify", "Usage: rally-25d-program.mjs <compile|verify> <input.json> [--output output.json]");
  assert(inputPath, "input path is required."); const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result = command === "compile" ? await compileRally25DArtProgram(input) : { valid: verifyRally25DArtProgram(input), programId: input.programId, programSha256: input.programSha256, assets: input.totals.assets, playableRequiredAssets: input.totals.playableRequiredAssets, status: input.readiness.status, downstreamProductionReady: input.readiness.downstreamProductionReady };
  const rendered = `${JSON.stringify(result, null, 2)}\n`; if (outputPath) await writeFile(outputPath, rendered, "utf8"); process.stdout.write(rendered);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
