#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  ADAPTER_PROTOCOL_VERSION,
  ADAPTER_REQUEST_CONTRACT,
  compileContinuity3dReferenceHandoff,
  verifyContinuity3dReferenceHandoff,
} from "./visual-continuity-3d-reference-adapter.mjs";

function usage() {
  return [
    "Usage:",
    "  visual-continuity-3d-reference-adapter-cli.mjs capabilities [--output FILE]",
    "  visual-continuity-3d-reference-adapter-cli.mjs compile REQUEST [--output FILE]",
    "  visual-continuity-3d-reference-adapter-cli.mjs verify REQUEST HANDOFF [--output FILE]",
  ].join("\n");
}

function fail(message) {
  throw new Error(`EVAVO_VISUAL_CONTINUITY_3D_ADAPTER_CLI: ${message}\n${usage()}`);
}

export function parseVisualContinuity3dAdapterCli(argv) {
  const args = [...argv];
  const command = args.shift();
  if (!["capabilities", "compile", "verify"].includes(command)) {
    fail("command must be capabilities, compile or verify.");
  }

  let outputPath;
  const outputIndex = args.indexOf("--output");
  if (outputIndex >= 0) {
    if (args.indexOf("--output", outputIndex + 1) >= 0) {
      fail("--output may be supplied only once.");
    }
    outputPath = args[outputIndex + 1];
    if (!outputPath || outputPath === "--output") {
      fail("--output requires a file path.");
    }
    args.splice(outputIndex, 2);
  }
  if (args.some((argument) => argument.startsWith("--"))) {
    fail("unsupported option supplied.");
  }

  if (command === "capabilities") {
    if (args.length !== 0) fail("capabilities accepts no positional arguments.");
    return Object.freeze({ command, ...(outputPath ? { outputPath } : {}) });
  }
  if (command === "compile") {
    if (args.length !== 1) fail("compile requires exactly one REQUEST path.");
    return Object.freeze({
      command,
      requestPath: args[0],
      ...(outputPath ? { outputPath } : {}),
    });
  }
  if (args.length !== 2) {
    fail("verify requires exactly one REQUEST path and one HANDOFF path.");
  }
  return Object.freeze({
    command,
    requestPath: args[0],
    handoffPath: args[1],
    ...(outputPath ? { outputPath } : {}),
  });
}

async function readJson(filePath, label) {
  const absolutePath = path.resolve(filePath);
  let value;
  try {
    value = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(
      `EVAVO_VISUAL_CONTINUITY_3D_ADAPTER_CLI: ${label} could not be read as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { absolutePath, value };
}

function capabilities() {
  return Object.freeze({
    contractVersion:
      "evavo_art_visual_continuity_3d_reference_adapter_capabilities_v1",
    protocolVersion: ADAPTER_PROTOCOL_VERSION,
    requestContract: ADAPTER_REQUEST_CONTRACT,
    outputSchema: "evavo.art.asset-fabricator-reference-handoff.v1",
    receiver: "evavo-3d-art-reference-brief",
    workerTaskId: "creative-media-3d-art-reference-brief",
    requiredViews: ["front", "back", "left", "right", "three-quarter"],
    topRequiredFor: [
      "vehicle",
      "architecture",
      "environment-piece",
      "environment-kit",
      "terrain",
    ],
    providerExecution: false,
    receiverExecution: false,
    automaticCreativeApproval: false,
  });
}

export async function runVisualContinuity3dAdapterCli(
  parsed,
  { writeOutput = writeFile } = {},
) {
  let result;
  if (parsed.command === "capabilities") {
    result = capabilities();
  } else {
    const request = await readJson(parsed.requestPath, "request");
    const options = {
      baseDirectory: path.dirname(request.absolutePath),
      sourceProgramPath: request.absolutePath,
    };
    if (parsed.command === "compile") {
      result = await compileContinuity3dReferenceHandoff(
        request.value,
        options,
      );
    } else {
      const handoff = await readJson(parsed.handoffPath, "handoff");
      result = Object.freeze({
        valid: await verifyContinuity3dReferenceHandoff(
          request.value,
          handoff.value,
          options,
        ),
        handoffSha256: handoff.value.handoffSha256,
      });
    }
  }

  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  if (parsed.outputPath) {
    await writeOutput(path.resolve(parsed.outputPath), rendered, {
      encoding: "utf8",
      flag: "wx",
    });
  }
  return Object.freeze({ result, rendered });
}

async function main() {
  const parsed = parseVisualContinuity3dAdapterCli(process.argv.slice(2));
  const executed = await runVisualContinuity3dAdapterCli(parsed);
  process.stdout.write(executed.rendered);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
