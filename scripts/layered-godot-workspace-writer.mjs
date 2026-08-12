#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
  LayeredGodotWorkspaceWriterError,
  MAXIMUM_PLAN_BYTES,
  fail,
  verifyLayeredGodotWorkspaceWriteRequest,
} from "./layered-godot-workspace-writer/contract.mjs";
import { readStableRegularFile } from "./layered-godot-workspace-writer/filesystem.mjs";
import {
  LayeredGodotWorkspaceSimulatedInterruption,
  applyLayeredGodotWorkspaceWriteRequest,
} from "./layered-godot-workspace-writer/runtime.mjs";
import { recoverLayeredGodotWorkspace } from "./layered-godot-workspace-writer/recovery.mjs";

export * from "./layered-godot-workspace-writer/contract.mjs";
export {
  LayeredGodotWorkspaceSimulatedInterruption,
  applyLayeredGodotWorkspaceWriteRequest,
} from "./layered-godot-workspace-writer/runtime.mjs";
export { recoverLayeredGodotWorkspace } from "./layered-godot-workspace-writer/recovery.mjs";

async function readPlanFile(planPath) {
  const absolute = path.resolve(planPath);
  const inspected = await readStableRegularFile(
    absolute,
    "integration plan file",
  );
  if (inspected.bytes > MAXIMUM_PLAN_BYTES) {
    fail(
      "LAYERED_GODOT_WRITE_INPUT_INVALID",
      "Integration plan file exceeds 32 MiB.",
    );
  }
  try {
    return JSON.parse(inspected.data.toString("utf8"));
  } catch {
    fail(
      "LAYERED_GODOT_WRITE_INPUT_INVALID",
      "Integration plan file is not valid JSON.",
    );
  }
}

function parseFlags(rest) {
  if (rest.length % 2 !== 0) {
    fail(
      "LAYERED_GODOT_WRITE_CLI_INVALID",
      "CLI flags must be provided as --flag value pairs.",
    );
  }
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (
      !flag?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      fail(
        "LAYERED_GODOT_WRITE_CLI_INVALID",
        `Invalid CLI argument near ${String(flag)}.`,
      );
    }
    if (values.has(flag)) {
      fail(
        "LAYERED_GODOT_WRITE_CLI_INVALID",
        `Duplicate CLI argument ${flag}.`,
      );
    }
    values.set(flag, value);
  }
  return values;
}

function parseCliArguments(argv) {
  const [command, ...rest] = argv;
  if (!["verify", "apply", "recover"].includes(command)) {
    fail(
      "LAYERED_GODOT_WRITE_CLI_INVALID",
      "Usage: layered-godot-workspace-writer.mjs <verify|apply|recover> --workspace DIR --repository OWNER/REPO [--plan FILE] [--request-id ID] [--revision x.y.z]",
    );
  }
  const values = parseFlags(rest);
  for (const required of ["--workspace", "--repository"]) {
    if (!values.has(required)) {
      fail(
        "LAYERED_GODOT_WRITE_CLI_INVALID",
        `Missing required CLI argument ${required}.`,
      );
    }
  }

  if (command === "recover") {
    for (const key of values.keys()) {
      if (!["--workspace", "--repository"].includes(key)) {
        fail(
          "LAYERED_GODOT_WRITE_CLI_INVALID",
          `Recovery does not accept CLI argument ${key}.`,
        );
      }
    }
    return {
      command,
      workspaceRoot: path.resolve(values.get("--workspace")),
      expectedRepository: values.get("--repository"),
    };
  }

  if (!values.has("--plan")) {
    fail(
      "LAYERED_GODOT_WRITE_CLI_INVALID",
      "Missing required CLI argument --plan.",
    );
  }
  for (const key of values.keys()) {
    if (
      ![
        "--plan",
        "--workspace",
        "--repository",
        "--request-id",
        "--revision",
      ].includes(key)
    ) {
      fail(
        "LAYERED_GODOT_WRITE_CLI_INVALID",
        `Unknown CLI argument ${key}.`,
      );
    }
  }
  return {
    command,
    planPath: values.get("--plan"),
    workspaceRoot: path.resolve(values.get("--workspace")),
    expectedRepository: values.get("--repository"),
    requestId:
      values.get("--request-id") ?? "layered-godot-workspace-write",
    revision: values.get("--revision") ?? "1.0.0",
  };
}

async function main() {
  try {
    const cli = parseCliArguments(process.argv.slice(2));
    if (cli.command === "recover") {
      console.log(
        JSON.stringify(
          await recoverLayeredGodotWorkspace({
            workspaceRoot: cli.workspaceRoot,
            expectedRepository: cli.expectedRepository,
          }),
          null,
          2,
        ),
      );
      return;
    }

    const integrationPlan = await readPlanFile(cli.planPath);
    const request = {
      schemaVersion: "1.0",
      kind: LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
      requestId: cli.requestId,
      revision: cli.revision,
      expectedRepository: cli.expectedRepository,
      workspaceRoot: cli.workspaceRoot,
      integrationPlan,
    };
    if (cli.command === "verify") {
      const verified = verifyLayeredGodotWorkspaceWriteRequest(request);
      console.log(
        JSON.stringify(
          {
            schemaVersion: "1.0",
            status: "passed",
            requestSha256: verified.requestSha256,
            integrationSha256:
              verified.integration.integrationSha256,
            expectedRepository: verified.expectedRepository,
            workspaceRoot: verified.workspaceRoot,
            resources: verified.integration.resources.length,
            bytes: verified.integration.totalBytes,
            writesPerformed: false,
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(
      JSON.stringify(
        await applyLayeredGodotWorkspaceWriteRequest(request),
        null,
        2,
      ),
    );
  } catch (error) {
    const payload = {
      code:
        error instanceof LayeredGodotWorkspaceWriterError
          ? error.code
          : error instanceof LayeredGodotWorkspaceSimulatedInterruption
            ? "LAYERED_GODOT_WRITE_SIMULATED_INTERRUPTION"
            : "LAYERED_GODOT_WRITE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof LayeredGodotWorkspaceWriterError &&
      error.details !== undefined
        ? { details: error.details }
        : {}),
    };
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
