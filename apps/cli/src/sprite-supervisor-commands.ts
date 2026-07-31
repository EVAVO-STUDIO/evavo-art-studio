import { readFile } from "node:fs/promises";
import path from "node:path";

import { LocalRuntimeRepository } from "@evavo/art-runtime";
import {
  compileSpriteSupervisorWorkflow,
  spriteSupervisorProtocolSummary,
  validateSpriteSupervisorCompileRequest,
} from "@evavo/art-sprite-supervisor";

export interface SpriteSupervisorCommandValues {
  readonly input?: string;
  readonly "runtime-root"?: string;
  readonly actor?: string;
}

export type SpriteSupervisorCommandResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown }>;

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8")) as unknown;
}

function requiredInput(
  values: SpriteSupervisorCommandValues,
  command: string,
): string {
  const value = values.input?.trim();
  if (!value) throw new Error(`--input is required for ${command}.`);
  return path.resolve(value);
}

function runtimeRoot(values: SpriteSupervisorCommandValues): string {
  return path.resolve(
    values["runtime-root"] ??
      process.env.EVAVO_ART_RUNTIME_ROOT ??
      ".art-studio/runtime",
  );
}

function actor(values: SpriteSupervisorCommandValues): string {
  return (
    values.actor?.trim() ||
    process.env.EVAVO_ART_ACTOR?.trim() ||
    "sprite-supervisor-cli"
  );
}

export async function handleSpriteSupervisorCommand(
  command: string,
  values: SpriteSupervisorCommandValues,
): Promise<SpriteSupervisorCommandResult> {
  if (command === "sprite-supervisor-protocol") {
    return { handled: true, value: spriteSupervisorProtocolSummary() };
  }
  if (
    !new Set([
      "sprite-supervisor-validate",
      "sprite-supervisor-compile",
      "sprite-supervisor-start",
    ]).has(command)
  ) {
    return { handled: false };
  }
  const input = await readJson(requiredInput(values, command));
  if (command === "sprite-supervisor-validate") {
    return {
      handled: true,
      value: validateSpriteSupervisorCompileRequest(input),
    };
  }
  const workflow = compileSpriteSupervisorWorkflow(input);
  if (command === "sprite-supervisor-compile") {
    return {
      handled: true,
      value: {
        schemaVersion: "1.0",
        workflow,
        executionBoundary:
          "Compilation does not execute providers, mutate approved references or run child jobs.",
      },
    };
  }
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot(values) });
  const rootJob = await runtime.submit(workflow.rootJob, actor(values));
  return {
    handled: true,
    value: {
      schemaVersion: "1.0",
      runId: workflow.runId,
      workflowSha256: workflow.workflowSha256,
      rootJob,
      executionBoundary:
        "The root durable supervisor job was submitted. Capability workers execute all child provider, media, verification, repair, selection, atlas and Godot work.",
    },
  };
}
