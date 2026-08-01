import { readFile } from "node:fs/promises";
import path from "node:path";

import { LocalRuntimeRepository } from "@evavo/art-runtime";
import {
  automaticSpriteFinalizationProtocolSummary,
  automaticSpriteWorkflowProtocolSummary,
  compileAutomaticSpriteFinalizationWorkflow,
  compileAutomaticSpriteWorkflow,
  compileSpriteSupervisorWorkflow,
  spriteSupervisorProtocolSummary,
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

async function submit(
  values: SpriteSupervisorCommandValues,
  workflow: Readonly<{
    runId: string;
    workflowSha256: string;
    rootJob: Parameters<LocalRuntimeRepository["submit"]>[0];
  }>,
) {
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot(values) });
  const rootJob = await runtime.submit(workflow.rootJob, actor(values));
  return {
    schemaVersion: "1.0",
    runId: workflow.runId,
    workflowSha256: workflow.workflowSha256,
    rootJob,
    executionBoundary:
      "Only the root durable supervisor job was submitted. Provider credentials remain worker-only and all child quality, repair, selection, family verification and finalization gates remain active.",
  };
}

export async function handleSpriteSupervisorCommand(
  command: string,
  values: SpriteSupervisorCommandValues,
): Promise<SpriteSupervisorCommandResult> {
  if (command === "sprite-supervisor-protocol") {
    return { handled: true, value: spriteSupervisorProtocolSummary() };
  }
  if (command === "automatic-sprite-workflow-protocol") {
    return { handled: true, value: automaticSpriteWorkflowProtocolSummary() };
  }
  if (command === "automatic-sprite-finalization-protocol") {
    return {
      handled: true,
      value: automaticSpriteFinalizationProtocolSummary(),
    };
  }
  const commands = new Set([
    "sprite-supervisor-validate",
    "sprite-supervisor-compile",
    "sprite-supervisor-start",
    "automatic-sprite-workflow-validate",
    "automatic-sprite-workflow-compile",
    "automatic-sprite-workflow-start",
    "automatic-sprite-finalization-validate",
    "automatic-sprite-finalization-compile",
    "automatic-sprite-finalization-start",
  ]);
  if (!commands.has(command)) return { handled: false };

  const input = await readJson(requiredInput(values, command));
  if (command.startsWith("automatic-sprite-finalization-")) {
    const compiled = compileAutomaticSpriteFinalizationWorkflow(input);
    if (command.endsWith("-validate")) {
      return {
        handled: true,
        value: {
          request: compiled.request,
          analysis: compiled.analysis,
        },
      };
    }
    if (command.endsWith("-compile")) {
      return {
        handled: true,
        value: {
          schemaVersion: "1.0",
          workflow: compiled,
          executionBoundary:
            "Compilation chooses background and 3D reference policy but does not call providers, inspect artifacts, promote assets, or deploy a project.",
        },
      };
    }
    return {
      handled: true,
      value: await submit(values, compiled.supervisorWorkflow),
    };
  }

  if (command.startsWith("automatic-sprite-workflow-")) {
    const compiled = compileAutomaticSpriteWorkflow(input);
    if (command.endsWith("-validate")) {
      return {
        handled: true,
        value: {
          request: compiled.request,
          analysis: compiled.analysis,
        },
      };
    }
    if (command.endsWith("-compile")) {
      return {
        handled: true,
        value: {
          schemaVersion: "1.0",
          workflow: compiled,
          executionBoundary:
            "Compilation does not call a provider or execute any child job.",
        },
      };
    }
    return {
      handled: true,
      value: await submit(values, compiled.supervisorWorkflow),
    };
  }

  const workflow = compileSpriteSupervisorWorkflow(input);
  if (command === "sprite-supervisor-validate") {
    return { handled: true, value: workflow.request };
  }
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
  return {
    handled: true,
    value: await submit(values, workflow),
  };
}
