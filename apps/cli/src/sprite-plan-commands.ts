import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileSpritePlanJob,
  compileSpriteProductionPlan,
  spritePlannerProtocolSummary,
  validateSpritePlanCompileRequest,
} from "@evavo/art-sprite-planner";

export interface SpritePlanCommandValues {
  readonly input?: string;
}

export type SpritePlanCommandResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown }>;

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function inputPath(values: SpritePlanCommandValues, command: string): string {
  if (!values.input) throw new Error(`--input is required for ${command}.`);
  return path.resolve(values.input);
}

export async function handleSpritePlanCommand(
  command: string,
  values: SpritePlanCommandValues,
): Promise<SpritePlanCommandResult> {
  if (command === "sprite-plan-protocol") {
    return { handled: true, value: spritePlannerProtocolSummary() };
  }
  if (!new Set(["sprite-plan-validate", "sprite-plan-compile"]).has(command)) {
    return { handled: false };
  }
  const input = await readJson(inputPath(values, command));
  if (command === "sprite-plan-validate") {
    return { handled: true, value: validateSpritePlanCompileRequest(input) };
  }
  return {
    handled: true,
    value: {
      schemaVersion: "1.0",
      compiledPlan: compileSpriteProductionPlan(input),
      compiledJob: compileSpritePlanJob(input),
      executionBoundary:
        "Planning is deterministic and provider-free. Frame and layer creation, mastering, family verification, selection, promotion and packaging remain separate governed stages.",
    },
  };
}
