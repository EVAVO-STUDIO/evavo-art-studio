#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";

import {
  assertAnimationRuntimeGraphIntegrity,
  compileAnimationRuntimeGraph,
  compileGodotAnimationRuntimeGraph,
  resolveAnimationRuntimeTransition,
} from "../packages/art-direction/dist/index.js";

const root = process.cwd();

function safePath(input, label) {
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return absolute;
  throw new Error(`${label} must remain inside the current repository workspace`);
}

async function readJson(path) {
  return JSON.parse(await readFile(safePath(path, "input path"), "utf8"));
}

async function emit(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(body);
    return;
  }
  await writeFile(safePath(outputPath, "output path"), body, { encoding: "utf8", flag: "wx" });
}

async function main() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!command || !inputPath || !["compile", "verify", "godot", "resolve"].includes(command)) {
    throw new Error(
      "usage: node scripts/animation-runtime-graph.mjs <compile|verify|godot|resolve> <input.json> [output.json]",
    );
  }
  const input = await readJson(inputPath);
  if (command === "compile") {
    await emit(compileAnimationRuntimeGraph(input), outputPath);
    return;
  }
  if (command === "verify") {
    assertAnimationRuntimeGraphIntegrity(input);
    await emit(
      {
        status: "verified",
        contentDigest: input.contentDigest,
        promotable: input.quality.promotable,
        blockerCount: input.quality.blockerCount,
        warningCount: input.quality.warningCount,
        authority: { runtimeActivation: false, creativeApproval: false },
      },
      outputPath,
    );
    return;
  }
  if (command === "godot") {
    await emit(compileGodotAnimationRuntimeGraph(input), outputPath);
    return;
  }
  await emit(resolveAnimationRuntimeTransition(input), outputPath);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ status: "error", message })}\n`);
  process.exitCode = 1;
});
